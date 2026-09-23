import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Search, Download, CheckCircle2, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { exploreCj, createCjJob, type Criteria, type ExploreHit } from "@/lib/cj-center.functions";
import { CriteriaForm, EMPTY_CRITERIA } from "./CriteriaForm";
import { CjProductDetail } from "./CjProductDetail";

export function CjExplorer({ categories, onJobCreated }: { categories: Array<{ id: string; path: string }>; onJobCreated: () => void }) {
  const qc = useQueryClient();
  const exploreFn = useServerFn(exploreCj);
  const jobFn = useServerFn(createCjJob);
  const [criteria, setCriteria] = useState<Criteria>({ ...EMPTY_CRITERIA });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<{ hits: ExploreHit[]; total: number; totalPages: number; info: string } | null>(null);
  const [selected, setSelected] = useState<Map<string, ExploreHit>>(new Map());
  const [detail, setDetail] = useState<string | null>(null);
  const [target, setTarget] = useState(100);
  const [busy, setBusy] = useState(false);

  async function search(p = 1) {
    if (!criteria.keyword && !criteria.categoryId) { toast.error("Indiquez un mot-clé ou une catégorie."); return; }
    setLoading(true);
    try {
      const r = await exploreFn({ data: { criteria, page: p, size: 50 } });
      if (!r.ok) { toast.error(r.error ?? "Recherche impossible"); return; }
      setPage(p);
      setRes({
        hits: r.hits, total: r.total, totalPages: r.totalPages,
        info: `${r.total} produit(s) chez CJ · page ${p}/${r.totalPages || 1}${r.cached ? " · depuis le cache (0 point)" : " · 50 points"}`,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  function toggle(h: ExploreHit) {
    const m = new Map(selected);
    if (m.has(h.pid)) m.delete(h.pid); else m.set(h.pid, h);
    setSelected(m);
  }

  async function launch(kind: "selection" | "criteria", pids?: Array<{ pid: string; name: string | null; image: string | null }>) {
    setBusy(true);
    try {
      const list = pids ?? [...selected.values()].map((h) => ({ pid: h.pid, name: h.name, image: h.image }));
      await jobFn({
        data: kind === "selection"
          ? { kind: "import", pids: list, criteria }
          : { kind: "import", criteria, targetCount: target, name: `Import par critères — ${criteria.keyword || "catégorie"} (${target})` },
      });
      toast.success("Import lancé en arrière-plan. Vous pouvez fermer la page.");
      if (!pids) setSelected(new Map());
      qc.invalidateQueries({ queryKey: ["cj-jobs"] });
      onJobCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function syncOne(pid: string) {
    try {
      await jobFn({ data: { kind: "sync", pids: [{ pid }], syncParts: ["stock", "price", "images", "variants", "data"] } });
      toast.success("Synchronisation lancée");
      qc.invalidateQueries({ queryKey: ["cj-jobs"] });
      setDetail(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  const importable = (res?.hits ?? []).filter((h) => !h.exists);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Rechercher des produits CJ</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <CriteriaForm value={criteria} onChange={setCriteria} categories={categories} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => search(1)} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />} Rechercher
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-2">
            <Sparkles className="mb-2 h-4 w-4 text-primary" />
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground">Import automatique selon ces critères</p>
              <Input type="number" min={1} max={20000} value={target} onChange={(e) => setTarget(Number(e.target.value) || 1)} className="h-9 w-28" />
            </div>
            <Button variant="outline" disabled={busy || (!criteria.keyword && !criteria.categoryId)} onClick={() => launch("criteria")}>
              Trouver et importer {target} nouveaux produits
            </Button>
          </div>
          {res && <p className="text-xs text-muted-foreground">{res.info}</p>}
        </CardContent>
      </Card>

      {selected.size > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2 shadow-md">
          <span className="text-xs font-medium">{selected.size} produit(s) sélectionné(s)</span>
          <Button size="sm" disabled={busy} onClick={() => launch("selection")}><Download className="mr-1 h-3 w-3" />Importer la sélection</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Map())}>Vider</Button>
        </div>
      )}

      {res && (
        <>
          <div className="flex items-center justify-between gap-2">
            <Button size="sm" variant="outline" disabled={!importable.length} onClick={() => {
              const m = new Map(selected); importable.forEach((h) => m.set(h.pid, h)); setSelected(m);
            }}>Sélectionner les {importable.length} nouveaux de la page</Button>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => search(page - 1)}>Préc.</Button>
              <Button size="sm" variant="outline" disabled={page >= res.totalPages || loading} onClick={() => search(page + 1)}>Suiv.</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {res.hits.map((h) => (
              <Card key={h.pid} className={selected.has(h.pid) ? "ring-2 ring-primary" : ""}>
                <CardContent className="space-y-1 p-2">
                  <button type="button" className="block w-full" onClick={() => setDetail(h.pid)}>
                    {h.image ? <img src={h.image} alt={h.name ?? h.pid} loading="lazy" className="aspect-square w-full rounded object-cover" /> : <div className="aspect-square w-full rounded bg-muted" />}
                  </button>
                  <p className="line-clamp-2 text-[11px] font-medium">{h.name ?? h.pid}</p>
                  <p className="text-[10px] text-muted-foreground">{h.sku ?? "—"}</p>
                  <p className="text-[11px]">{h.price != null ? `${h.price} USD` : "prix —"} · stock {h.stock ?? "?"}</p>
                  <div className="flex items-center justify-between gap-1">
                    {h.exists ? (
                      <Badge variant="secondary" className="gap-1 text-[10px]"><CheckCircle2 className="h-3 w-3" />Dans KawZone</Badge>
                    ) : (
                      <label className="flex items-center gap-1 text-[11px]">
                        <input type="checkbox" className="h-4 w-4 accent-primary" checked={selected.has(h.pid)} onChange={() => toggle(h)} /> Choisir
                      </label>
                    )}
                    <Button size="sm" variant="ghost" className="h-6 px-1 text-[10px]" onClick={() => setDetail(h.pid)}>Voir</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {!res.hits.length && <p className="text-xs text-muted-foreground">Aucun nouveau produit sur cette page.</p>}
        </>
      )}

      <CjProductDetail
        pid={detail}
        onClose={() => setDetail(null)}
        onImport={(pid, name, image) => { setDetail(null); launch("selection", [{ pid, name, image }]); }}
        onSync={syncOne}
      />
    </div>
  );
}
