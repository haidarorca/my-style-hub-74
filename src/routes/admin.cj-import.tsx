// ═══════════════════════════════════════════════════════════════
// Administration → Catalogue → Importer depuis CJ
//
// Recherche d'un produit CJ (identifiant, SKU ou mots-clés), import en
// BROUILLON, et correspondance des catégories CJ → KawZone.
// Aucun import massif : un produit à la fois.
// ═══════════════════════════════════════════════════════════════
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Loader2, Search, RefreshCw, FolderTree, CheckCircle2 } from "lucide-react";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  searchCjProducts,
  getCjCategoryMappings,
  setCjCategoryMapping,
  getCjImportedProducts,
  type CjSearchHit,
} from "@/lib/cj-catalog.functions";
import { importCjProduct, type CjImportReport } from "@/lib/cj-import.functions";
import { getCjCategoryTree } from "@/lib/cj-center.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CjExplorer } from "@/components/admin/cj/CjExplorer";
import { CjJobsPanel } from "@/components/admin/cj/CjJobsPanel";
import { CjSchedulesPanel } from "@/components/admin/cj/CjSchedulesPanel";

export const Route = createFileRoute("/admin/cj-import")({
  component: () => (
    <PermissionGate perm="products">
      <CjCenter />
    </PermissionGate>
  ),
  head: () => ({
    meta: [
      { title: "Centre de sourcing CJ — KawZone Admin" },
      {
        name: "description",
        content: "Rechercher un produit CJdropshipping et l'importer en brouillon dans le catalogue KawZone.",
      },
      { property: "og:title", content: "Centre de sourcing CJ — KawZone Admin" },
      { property: "og:description", content: "Rechercher, sélectionner et importer des produits CJ dans KawZone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function CjCenter() {
  const treeFn = useServerFn(getCjCategoryTree);
  const [tab, setTab] = useState("explore");
  const { data: tree } = useQuery({ queryKey: ["cj-cat-tree"], queryFn: () => treeFn(), staleTime: 3600_000 });
  const categories = tree?.categories ?? [];
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5 p-3 sm:p-5 lg:p-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold sm:text-2xl">Centre de sourcing CJ</h1>
          <p className="text-sm text-muted-foreground">Recherchez, sélectionnez et importez sans bloquer votre écran.</p>
        </div>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-4">
          <TabsTrigger value="explore">Explorer</TabsTrigger>
          <TabsTrigger value="jobs">Imports</TabsTrigger>
          <TabsTrigger value="schedules">Programmés</TabsTrigger>
          <TabsTrigger value="single">Produit unique</TabsTrigger>
        </TabsList>
        <TabsContent value="explore"><CjExplorer categories={categories} onJobCreated={() => setTab("jobs")} /></TabsContent>
        <TabsContent value="jobs"><CjJobsPanel /></TabsContent>
        <TabsContent value="schedules"><CjSchedulesPanel categories={categories} /></TabsContent>
        <TabsContent value="single"><CjImportPage /></TabsContent>
      </Tabs>
    </div>
  );
}

function CjImportPage() {
  const qc = useQueryClient();
  const searchFn = useServerFn(searchCjProducts);
  const importFn = useServerFn(importCjProduct);
  const mappingsFn = useServerFn(getCjCategoryMappings);
  const setMappingFn = useServerFn(setCjCategoryMapping);
  const importedFn = useServerFn(getCjImportedProducts);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<CjSearchHit[] | null>(null);
  const [searchInfo, setSearchInfo] = useState<string | null>(null);
  const [busyPid, setBusyPid] = useState<string | null>(null);
  const [withStock, setWithStock] = useState(false);
  const [report, setReport] = useState<CjImportReport | null>(null);

  const { data: cats } = useQuery({
    queryKey: ["cj-category-mappings"],
    queryFn: () => mappingsFn(),
  });
  const { data: imported } = useQuery({
    queryKey: ["cj-imported-products"],
    queryFn: () => importedFn(),
  });

  async function runSearch() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setHits(null);
    setReport(null);
    try {
      const r = await searchFn({ data: { query: q } });
      if (!r.ok) {
        toast.error(r.error ?? "Recherche impossible");
        setSearchInfo(null);
      } else {
        setHits(r.hits);
        setSearchInfo(
          `${r.hits.length} résultat(s) — ${r.apiCalls} appel(s) via ${r.endpoint}` +
            (r.pointsRemaining != null ? ` — ${r.pointsRemaining} points restants` : ""),
        );
        if (!r.hits.length) toast.info("Aucun produit CJ trouvé pour cette recherche.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSearching(false);
    }
  }

  async function runImport(pid: string, update: boolean) {
    setBusyPid(pid);
    setReport(null);
    try {
      const r = await importFn({ data: { pid, update, withStock } });
      setReport(r);
      if (r.ok) {
        toast.success(
          r.action === "updated" ? "Produit CJ mis à jour" : "Produit importé en brouillon",
        );
        qc.invalidateQueries({ queryKey: ["cj-imported-products"] });
        qc.invalidateQueries({ queryKey: ["cj-category-mappings"] });
      } else {
        toast.error(r.error ?? "Import impossible");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusyPid(null);
    }
  }

  async function saveMapping(cjCategoryId: string, kawzoneCategoryId: string) {
    try {
      const r = await setMappingFn({
        data: { cjCategoryId, kawzoneCategoryId: kawzoneCategoryId || null },
      });
      toast.success(
        r.updatedProducts
          ? `Correspondance enregistrée — ${r.updatedProducts} produit(s) mis à jour`
          : "Correspondance enregistrée",
      );
      qc.invalidateQueries({ queryKey: ["cj-category-mappings"] });
      qc.invalidateQueries({ queryKey: ["cj-imported-products"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center gap-2">
        <Download className="h-5 w-5" />
        <h1 className="text-lg font-bold">Importer depuis CJ</h1>
      </div>

      {/* ── Recherche ───────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Rechercher un produit CJ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Identifiant CJ, SKU (CJ…) ou mots-clés"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
            />
            <Button onClick={runSearch} disabled={searching} className="sm:w-40">
              {searching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Rechercher
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Un identifiant ou un SKU consomme 10 points ; une recherche par mots-clés en consomme 50.
          </p>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={withStock}
              onChange={(e) => setWithStock(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Lire aussi les stocks CJ à l'import (10 points par variante)
          </label>
          {searchInfo && <p className="text-xs text-muted-foreground">{searchInfo}</p>}
        </CardContent>
      </Card>

      {/* ── Résultats ───────────────────────────────────────────── */}
      {hits && hits.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {hits.map((h) => (
            <Card key={h.pid}>
              <CardContent className="flex gap-3 p-3">
                {h.image ? (
                  <img
                    src={h.image}
                    alt={h.name ?? h.pid}
                    className="h-20 w-20 shrink-0 rounded-md object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-20 w-20 shrink-0 rounded-md bg-muted" />
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="line-clamp-2 text-xs font-semibold">{h.name ?? h.pid}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {h.sku ?? "—"} · {h.cost != null ? `${h.cost.toFixed(2)} USD` : "prix —"}
                  </p>
                  {h.categoryPath && (
                    <p className="text-[11px] text-muted-foreground">{h.categoryPath}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {h.alreadyImported ? (
                      <>
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Produit CJ déjà importé
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => runImport(h.pid, true)}
                          disabled={busyPid === h.pid}
                        >
                          {busyPid === h.pid ? (
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-3 w-3" />
                          )}
                          Synchroniser
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => runImport(h.pid, false)}
                        disabled={busyPid === h.pid}
                      >
                        {busyPid === h.pid ? (
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        ) : (
                          <Download className="mr-2 h-3 w-3" />
                        )}
                        Importer en brouillon
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Rapport d'import ────────────────────────────────────── */}
      {report && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Résultat de l'import — {report.ok ? "succès" : "échec"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            {report.error && <p className="text-destructive">{report.error}</p>}
            {report.ok && (
              <>
                <p>
                  <strong>{report.productName}</strong> — {report.variantsImported}/
                  {report.variantsTotal} variante(s), {report.images} image(s) en galerie,{" "}
                  {report.variantImages} image(s) de variante.
                </p>
                <p>
                  Catégorie CJ : <strong>{report.cjCategory ?? "—"}</strong> → KawZone :{" "}
                  {report.kawzoneCategoryChain.length ? (
                    <strong>{report.kawzoneCategoryChain.join(" › ")}</strong>
                  ) : (
                    <strong className="text-amber-600">Catégorie à attribuer</strong>
                  )}
                  {report.categoryUnresolved.length > 0 && (
                    <span className="text-amber-600">
                      {" "}
                      — niveau(x) à attribuer : {report.categoryUnresolved.join(" › ")}
                    </span>
                  )}
                </p>
                <p>
                  {report.apiCalls} appel(s) API
                  {report.pointsRemaining != null
                    ? ` — ${report.pointsRemaining} points restants`
                    : ""}
                  . Images hébergées par KawZone :{" "}
                  {report.media.uploaded} envoyée(s), {report.media.reused} réutilisée(s),{" "}
                  {report.media.failed} en erreur.
                </p>
                <p>
                  Contrôle des adresses fournisseur :{" "}
                  {report.publicCleanCheck.clean
                    ? "aucune référence publique"
                    : report.publicCleanCheck.offenders.join(", ")}
                </p>
                {report.missing.length > 0 && (
                  <p className="text-muted-foreground">
                    À compléter : {report.missing.join(" · ")}
                  </p>
                )}
                <Link
                  to="/admin/products"
                  className="inline-block pt-1 font-medium text-primary underline"
                >
                  Ouvrir « Validation produits »
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Correspondance des catégories ───────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FolderTree className="h-4 w-4" /> Correspondance des catégories CJ
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(cats?.mappings ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Aucune catégorie CJ rencontrée pour l'instant.
            </p>
          ) : (
            (cats?.mappings ?? []).map((m) => (
              <div
                key={m.cj_category_id}
                className="flex flex-col gap-2 border-b pb-3 last:border-0 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">
                    {m.cj_category_path ?? m.cj_category_name ?? m.cj_category_id}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {m.status === "mapped"
                      ? "Correspondance définie"
                      : m.kawzone_category_id
                        ? "Correspondance automatique — à confirmer"
                        : "Catégorie à attribuer"}
                  </p>
                </div>
                <Select
                  value={m.kawzone_category_id ?? ""}
                  onValueChange={(v) => saveMapping(m.cj_category_id, v)}
                >
                  <SelectTrigger className="w-full sm:w-80">
                    <SelectValue placeholder="Choisir une catégorie KawZone" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {(cats?.kawzone ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Produits CJ importés ────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Produits CJ importés</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(imported?.rows ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucun produit CJ importé.</p>
          ) : (
            (imported?.rows ?? []).map((r: any) => (
              <div
                key={r.cj_product_id}
                className="flex items-center justify-between gap-3 border-b py-2 text-xs last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.name_en ?? r.cj_product_id}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {r.cj_sku ?? "—"} · {r.cj_category_path ?? r.cj_category_name ?? "catégorie CJ —"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={r.category_mapping_status === "pending" ? "outline" : "secondary"}>
                    {r.category_mapping_status === "mapped"
                      ? "Catégorie définie"
                      : r.category_mapping_status === "auto"
                        ? "Catégorie automatique"
                        : "Catégorie à attribuer"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => runImport(r.cj_product_id, true)}
                    disabled={busyPid === r.cj_product_id}
                  >
                    {busyPid === r.cj_product_id ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-3 w-3" />
                    )}
                    Synchroniser
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
