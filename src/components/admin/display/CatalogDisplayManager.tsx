import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BulkCheckbox } from "@/components/shared/BulkActionsBar";
import { DisplayConfigForm } from "./DisplayConfigForm";
import { ProductGrid } from "@/components/product/ProductGrid";
import { ProductCard, type ProductCardProduct } from "@/components/product/ProductCard";
import { ProductPricesProvider } from "@/components/product/ProductPricesProvider";
import { useResolveDisplay } from "@/hooks/use-display-presets";
import { DEFAULT_DISPLAY, normalizeDisplay, type DisplayConfig } from "@/lib/display/display-config";
import { PRODUCT_CARD_SELECT } from "@/lib/product-select";
import { Eye, RotateCcw, Save, Trash2 } from "lucide-react";

type Scope = "global" | "category" | "products";

export function CatalogDisplayManager() {
  const qc = useQueryClient();
  const { global, presets } = useResolveDisplay();

  const [scope, setScope] = useState<Scope>("global");
  const [categoryId, setCategoryId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("approved");
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<DisplayConfig>(global);
  const [previewOn, setPreviewOn] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["admin", "categories", "flat"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, level, parent_id")
        .order("level")
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: products } = useQuery({
    queryKey: ["admin", "display-products", search, filterCategory, filterStatus],
    queryFn: async () => {
      let q = (supabase as any)
        .from("products")
        .select(PRODUCT_CARD_SELECT)
        .order("position", { referencedTable: "product_images", ascending: true })
        .order("created_at", { ascending: false })
        .limit(200);
      if (filterStatus !== "all") q = q.eq("status", filterStatus);
      if (search.trim()) q = q.ilike("name", `%${search.trim()}%`);
      if (filterCategory !== "all") q = q.eq("category_id", filterCategory);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ProductCardProduct[];
    },
  });

  const list = products ?? [];
  const allSelected = list.length > 0 && selected.length === list.length;

  // Aperçu : quelques produits représentatifs
  const previewProducts = useMemo(() => {
    if (scope === "products" && selected.length > 0) {
      return list.filter((p) => selected.includes(p.id)).slice(0, 8);
    }
    if (scope === "category" && categoryId) {
      return list.filter((p) => p.category_id === categoryId).slice(0, 8);
    }
    return list.slice(0, 8);
  }, [scope, selected, categoryId, list]);

  const targetLabel =
    scope === "global"
      ? "Tous les produits (réglage général)"
      : scope === "category"
      ? categoryId
        ? `Catégorie : ${categories?.find((c) => c.id === categoryId)?.name ?? ""}`
        : "Aucune catégorie choisie"
      : `${selected.length} produit(s) sélectionné(s)`;

  const loadExisting = (nextScope: Scope, id?: string) => {
    if (nextScope === "global") {
      setDraft(global);
    } else if (nextScope === "category" && id) {
      const row = presets.find((p) => p.scope === "category" && p.scope_id === id);
      setDraft(normalizeDisplay(row?.config, global));
    } else {
      setDraft(global);
    }
  };

  const apply = async () => {
    if (scope === "category" && !categoryId) {
      toast.error("Choisissez une catégorie");
      return;
    }
    if (scope === "products" && selected.length === 0) {
      toast.error("Sélectionnez au moins un produit");
      return;
    }
    setSaving(true);
    try {
      const rows =
        scope === "global"
          ? [{ scope: "global", scope_id: null, config: draft }]
          : scope === "category"
          ? [{ scope: "category", scope_id: categoryId, config: draft }]
          : selected.map((id) => ({ scope: "product", scope_id: id, config: draft }));

      // upsert manuel (index unique avec COALESCE : on gère à la main)
      for (const r of rows) {
        const existing = presets.find((p) => p.scope === r.scope && p.scope_id === r.scope_id);
        if (existing) {
          const { error } = await (supabase as any)
            .from("display_presets").update({ config: r.config }).eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await (supabase as any).from("display_presets").insert(r);
          if (error) throw error;
        }
      }
      await qc.invalidateQueries({ queryKey: ["display-presets"] });
      toast.success(`Affichage appliqué — ${rows.length} réglage(s)`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const clearOverrides = async () => {
    setSaving(true);
    try {
      if (scope === "products" && selected.length > 0) {
        const { error } = await (supabase as any)
          .from("display_presets").delete().eq("scope", "product").in("scope_id", selected);
        if (error) throw error;
      } else if (scope === "category" && categoryId) {
        const { error } = await (supabase as any)
          .from("display_presets").delete().eq("scope", "category").eq("scope_id", categoryId);
        if (error) throw error;
      } else {
        toast.info("Le réglage général ne peut pas être supprimé, seulement modifié.");
        setSaving(false);
        return;
      }
      await qc.invalidateQueries({ queryKey: ["display-presets"] });
      toast.success("Exception(s) supprimée(s) — retour au réglage général");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      {/* Panneau de réglages */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">1. Cible</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select
              value={scope}
              onValueChange={(v) => { setScope(v as Scope); loadExisting(v as Scope, categoryId); }}
            >
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Réglage général (tous les produits)</SelectItem>
                <SelectItem value="category">Une catégorie / sous-catégorie</SelectItem>
                <SelectItem value="products">Une sélection de produits</SelectItem>
              </SelectContent>
            </Select>

            {scope === "category" && (
              <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); loadExisting("category", v); }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Choisir une catégorie" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {(categories ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {"— ".repeat(Math.max(0, (c.level ?? 1) - 1))}{c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs font-medium">{targetLabel}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">2. Réglages d'affichage</CardTitle>
          </CardHeader>
          <CardContent>
            <DisplayConfigForm value={draft} onChange={setDraft} />
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={apply} disabled={saving} className="gap-1">
            <Save className="h-4 w-4" /> Appliquer
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDraft(global)} className="gap-1">
            <RotateCcw className="h-4 w-4" /> Annuler les changements
          </Button>
          <Button size="sm" variant="ghost" onClick={clearOverrides} disabled={saving} className="gap-1">
            <Trash2 className="h-4 w-4" /> Supprimer l'exception
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setPreviewOn((v) => !v)} className="gap-1">
            <Eye className="h-4 w-4" /> {previewOn ? "Masquer" : "Afficher"} l'aperçu
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Les réglages ne sont enregistrés qu'après « Appliquer ». L'aperçu ci-contre ne modifie rien.
        </p>
      </div>

      {/* Aperçu + sélection */}
      <div className="space-y-4">
        {previewOn && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Aperçu (avant application)</CardTitle>
            </CardHeader>
            <CardContent>
              {previewProducts.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucun produit à prévisualiser.</p>
              ) : (
                <ProductPricesProvider productIds={previewProducts.map((p) => p.id)}>
                  <ProductGrid config={draft}>
                    {previewProducts.map((p) => (
                      <ProductCard key={p.id} product={p} display={draft} onQuickAdd={() => {}} />
                    ))}
                  </ProductGrid>
                </ProductPricesProvider>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Sélection rapide des produits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-[11px]">Recherche</Label>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom du produit" className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Catégorie</Label>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="all">Toutes</SelectItem>
                    {(categories ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {"— ".repeat(Math.max(0, (c.level ?? 1) - 1))}{c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Statut</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="approved">Approuvés</SelectItem>
                    <SelectItem value="pending">En attente</SelectItem>
                    <SelectItem value="rejected">Refusés</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Button size="sm" variant="outline" className="h-7"
                onClick={() => setSelected(allSelected ? [] : list.map((p) => p.id))}>
                {allSelected ? "Tout désélectionner" : `Sélectionner les ${list.length} résultats`}
              </Button>
              <span className="text-muted-foreground">{selected.length} sélectionné(s)</span>
            </div>

            <div className="max-h-[420px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {list.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50">
                  <BulkCheckbox
                    checked={selected.includes(p.id)}
                    onChange={(c) => setSelected((prev) => (c ? [...prev, p.id] : prev.filter((x) => x !== p.id)))}
                  />
                  <img
                    src={p.product_images?.[0]?.url ?? ""}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded object-contain"
                  />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {presets.some((x) => x.scope === "product" && x.scope_id === p.id) && (
                    <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      exception
                    </span>
                  )}
                </label>
              ))}
              {list.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">Aucun produit.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export { DEFAULT_DISPLAY };
