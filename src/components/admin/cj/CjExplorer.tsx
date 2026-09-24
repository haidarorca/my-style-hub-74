import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, Download, Filter, Loader2, PackageSearch, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exploreCj, createCjJob, type Criteria, type ExploreHit } from "@/lib/cj-center.functions";
import { CriteriaForm, EMPTY_CRITERIA } from "./CriteriaForm";
import { CjProductDetail } from "./CjProductDetail";

type ResultFilter = "all" | "new" | "existing" | "sync" | "incomplete";

export function CjExplorer({ categories, onJobCreated }: { categories: Array<{ id: string; path: string }>; onJobCreated: () => void }) {
  const qc = useQueryClient();
  const exploreFn = useServerFn(exploreCj);
  const jobFn = useServerFn(createCjJob);
  const [criteria, setCriteria] = useState<Criteria>({ ...EMPTY_CRITERIA });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<{ hits: ExploreHit[]; total: number; totalPages: number; excluded: number; deepChecked: boolean } | null>(null);
  const [selected, setSelected] = useState<Map<string, ExploreHit>>(new Map());
  const [detail, setDetail] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [resultFilter, setResultFilter] = useState<ResultFilter>("new");
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => (res?.hits ?? []).filter((h) => {
    if (resultFilter === "new") return !h.exists;
    if (resultFilter === "existing") return h.exists;
    if (resultFilter === "sync") return h.needsSync;
    if (resultFilter === "incomplete") return h.missing.length > 0;
    return true;
  }), [res, resultFilter]);
  const selectedRows = [...selected.values()];
  const selectedNew = selectedRows.filter((h) => !h.exists);
  const selectedExisting = selectedRows.filter((h) => h.exists);
  const pageSelected = visible.length > 0 && visible.every((h) => selected.has(h.pid));
  const categoryLabel = categories.find((c) => c.id === criteria.categoryId)?.path;

  async function search(p = 1) {
    if (!criteria.keyword?.trim() && !criteria.categoryId) { toast.error("Indiquez un mot-clé ou choisissez une catégorie."); return; }
    setLoading(true);
    try {
      const r = await exploreFn({ data: { criteria, page: p, size: 50 } });
      if (!r.ok) { toast.error(r.error ?? "Recherche impossible"); return; }
      setPage(p);
      setRes({ hits: r.hits, total: r.total, totalPages: r.totalPages, excluded: r.excluded ?? 0, deepChecked: !!r.deepChecked });
      setResultFilter(criteria.newOnly === false ? "all" : "new");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setLoading(false); }
  }

  function toggle(h: ExploreHit) {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(h.pid)) next.delete(h.pid); else next.set(h.pid, h);
      return next;
    });
  }

  function togglePage() {
    setSelected((current) => {
      const next = new Map(current);
      if (pageSelected) visible.forEach((h) => next.delete(h.pid));
      else visible.forEach((h) => next.set(h.pid, h));
      return next;
    });
  }

  async function createJob(kind: "import" | "sync", rows: ExploreHit[], targetCount?: number) {
    return jobFn({ data: targetCount
      ? { kind: "import", criteria: { ...criteria, newOnly: true }, targetCount, name: `Import par critères — ${criteria.keyword || categoryLabel || "catalogue"} (${targetCount})` }
      : { kind, criteria, pids: rows.map((h) => ({ pid: h.pid, name: h.name, image: h.image })), syncParts: kind === "sync" ? ["stock", "price", "images", "variants", "data"] : [] }
    });
  }

  async function launchSelection(includeExisting: boolean) {
    setBusy(true);
    try {
      if (selectedNew.length) await createJob("import", selectedNew);
      if (includeExisting && selectedExisting.length) await createJob("sync", selectedExisting);
      toast.success("Traitement lancé en arrière-plan.");
      setSelected(new Map());
      qc.invalidateQueries({ queryKey: ["cj-jobs"] });
      onJobCreated();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(false); }
  }

  async function launchTarget(targetCount: number) {
    setBusy(true);
    try {
      await createJob("import", [], targetCount);
      toast.success(`${targetCount} produit(s) placé(s) dans la file d’import.`);
      qc.invalidateQueries({ queryKey: ["cj-jobs"] });
      onJobCreated();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(false); }
  }

  async function syncOne(pid: string) {
    const hit = (res?.hits ?? []).find((h) => h.pid === pid) ?? { pid, name: null, image: null, exists: true } as ExploreHit;
    setBusy(true);
    try {
      await createJob("sync", [hit]);
      toast.success("Synchronisation lancée.");
      qc.invalidateQueries({ queryKey: ["cj-jobs"] });
      setDetail(null);
      onJobCreated();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3 border-b pb-5">
        <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_240px_auto]" onSubmit={(e) => { e.preventDefault(); search(1); }}>
          <div className="relative min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-11 pl-9" value={criteria.keyword ?? ""} onChange={(e) => setCriteria({ ...criteria, keyword: e.target.value })} placeholder="Rechercher un produit, un SKU…" />
          </div>
          <Select value={criteria.categoryId ?? "all"} onValueChange={(value) => setCriteria({ ...criteria, categoryId: value === "all" ? null : value })}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Toutes les catégories" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Toutes les catégories</SelectItem>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.path}</SelectItem>)}</SelectContent>
          </Select>
          <Button type="submit" className="h-11" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}<span>Rechercher</span></Button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant={filtersOpen ? "secondary" : "outline"} size="sm" onClick={() => setFiltersOpen(!filtersOpen)}>
            <Filter className="h-4 w-4" />Filtres<ChevronDown className={`h-3 w-3 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
          </Button>
          <label className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs">
            <Checkbox checked={resultFilter === "new"} onCheckedChange={(checked) => setResultFilter(checked === true ? "new" : "all")} />
            Nouveaux uniquement
          </label>
          {(criteria.minPrice != null || criteria.maxPrice != null || criteria.minStock != null || criteria.maxWeightKg != null || criteria.requireImages || criteria.requireSku || criteria.requireDimensions) && <Badge variant="secondary">Filtres actifs</Badge>}
        </div>
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CollapsibleContent className="rounded-md border bg-muted/20 p-3">
            <CriteriaForm value={criteria} onChange={setCriteria} categories={categories} hideMain />
          </CollapsibleContent>
        </Collapsible>
      </section>

      {!res && !loading && <div className="grid min-h-64 place-items-center border-b py-12 text-center"><div><PackageSearch className="mx-auto mb-3 h-9 w-9 text-muted-foreground" /><h2 className="font-semibold">Explorez le catalogue CJ</h2><p className="mt-1 text-sm text-muted-foreground">Recherchez par nom, SKU ou catégorie.</p></div></div>}

      {res && <>
        <section className="space-y-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            <div className="min-w-0"><h2 className="text-lg font-semibold">{res.total.toLocaleString("fr-FR")} produits trouvés</h2><p className="text-xs text-muted-foreground">Page {page} sur {Math.max(res.totalPages, 1)} · {selected.size} sélectionné(s)</p>{res.deepChecked && <p className="text-xs text-muted-foreground">Filtres avancés vérifiés sur les fiches complètes : {res.hits.length} conservé(s), {res.excluded} écarté(s) sur cette page.</p>}</div>
            <div className="flex shrink-0 gap-1"><Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => search(page - 1)}>Préc.</Button><Button size="sm" variant="outline" disabled={page >= res.totalPages || loading} onClick={() => search(page + 1)}>Suiv.</Button></div>
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {([['all', 'Tous'], ['new', 'Nouveaux'], ['existing', 'Déjà importés'], ['sync', 'À synchroniser'], ['incomplete', 'Incomplets']] as const).map(([key, label]) => <Button key={key} size="sm" variant={resultFilter === key ? "default" : "ghost"} onClick={() => setResultFilter(key)}>{label}</Button>)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3">
            <label className="flex items-center gap-2 text-sm font-medium"><Checkbox checked={pageSelected} onCheckedChange={togglePage} />Sélectionner la page</label>
            {res.total > res.hits.length && <div className="flex flex-wrap items-center justify-end gap-1.5"><span className="mr-1 text-xs text-muted-foreground">Importer selon les critères :</span>{[100, 500, 1000].filter((n) => n <= res.total).map((n) => <Button key={n} size="sm" variant="outline" disabled={busy} onClick={() => launchTarget(n)}>{n.toLocaleString("fr-FR")}</Button>)}<Button size="sm" variant="outline" disabled={busy} onClick={() => launchTarget(Math.min(res.total, 20000))}>Tous</Button></div>}
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((h) => <article key={h.pid} className={`group overflow-hidden rounded-md border bg-card transition-shadow hover:shadow-md ${selected.has(h.pid) ? "ring-2 ring-primary" : ""}`}>
            <div className="relative aspect-[4/3] bg-muted/40">
              <Button variant="ghost" className="absolute inset-0 z-0 h-full w-full rounded-none p-0" onClick={() => setDetail(h.pid)} aria-label={`Voir ${h.name ?? "le produit"}`} />
              {h.image ? <img src={h.image} alt={h.name ?? "Produit CJ"} loading="lazy" className="h-full w-full object-contain" /> : <div className="grid h-full place-items-center"><PackageSearch className="h-8 w-8 text-muted-foreground" /></div>}
              <label className="absolute left-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-md border bg-background/95 shadow-sm"><Checkbox checked={selected.has(h.pid)} onCheckedChange={() => toggle(h)} aria-label="Sélectionner ce produit" /></label>
              <Badge className="absolute right-2 top-2" variant={h.exists ? "secondary" : "default"}>{h.needsSync ? "À synchroniser" : h.exists ? <><CheckCircle2 className="h-3 w-3" />Déjà importé</> : "Nouveau"}</Badge>
            </div>
            <div className="space-y-3 p-3">
              <button type="button" className="block w-full text-left" onClick={() => setDetail(h.pid)}><h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5">{h.name ?? "Produit sans nom"}</h3><p className="mt-1 truncate text-xs text-muted-foreground">{h.categoryPath ?? "Catégorie non renseignée"}</p></button>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <Metric label="Prix" value={h.price != null ? `${h.price} USD` : "À vérifier"} />
                <Metric label="Stock" value={h.stock != null ? h.stock.toLocaleString("fr-FR") : "À vérifier"} />
                <Metric label="Variantes" value={h.variantCount != null ? String(h.variantCount) : "Voir la fiche"} />
                <Metric label="Poids" value={h.weightKg != null ? `${h.weightKg} kg` : "Voir la fiche"} />
                {h.material != null && <Metric label="Matière" value={h.material} />}
                {h.imageCount != null && <Metric label="Images" value={String(h.imageCount)} />}
              </div>
              <div className="flex items-center justify-between border-t pt-2"><span className={`inline-flex items-center gap-1 text-xs ${h.missing.length ? "text-warning" : "text-success"}`}><SlidersHorizontal className="h-3.5 w-3.5" />{h.score != null ? `Données complètes : ${h.score} %` : h.missing.length ? "Données manquantes" : "Complet"}</span><Button size="sm" variant="ghost" onClick={() => setDetail(h.pid)}>Aperçu</Button></div>
            </div>
          </article>)}
        </div>
        {!visible.length && <p className="py-12 text-center text-sm text-muted-foreground">Aucun produit dans cette vue.</p>}
      </>}

      {selected.size > 0 && <div className="sticky bottom-3 z-30 mx-auto grid max-w-3xl gap-3 rounded-md border bg-background/95 p-3 shadow-lg backdrop-blur sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0"><p className="text-sm font-semibold">{selected.size} produit(s) sélectionné(s)</p><p className="text-xs text-muted-foreground">{selectedNew.length} nouveau(x) · {selectedExisting.length} déjà importé(s)</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedNew.length > 0 && <Button disabled={busy} onClick={() => launchSelection(false)}><Download className="h-4 w-4" />Importer les {selectedNew.length} nouveaux</Button>}
          {selectedExisting.length > 0 && <Button variant={selectedNew.length ? "outline" : "default"} disabled={busy} onClick={() => launchSelection(true)}>{selectedNew.length ? `Importer + synchroniser (${selectedExisting.length})` : `Synchroniser les ${selectedExisting.length}`}</Button>}
          <Button size="icon" variant="ghost" onClick={() => setSelected(new Map())} aria-label="Vider la sélection"><X className="h-4 w-4" /></Button>
        </div>
      </div>}

      <CjProductDetail pid={detail} onClose={() => setDetail(null)} onImport={(pid, name, image) => { const hit = (res?.hits ?? []).find((h) => h.pid === pid); if (hit) setSelected(new Map(selected).set(pid, hit)); else setSelected(new Map(selected).set(pid, { pid, name, image, sku: null, price: null, stock: null, categoryPath: null, existingProductId: null, exists: false, variantCount: null, weightKg: null, missing: [], needsSync: false } as ExploreHit)); setDetail(null); }} onSync={syncOne} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] text-muted-foreground">{label}</p><p className="truncate font-medium">{value}</p></div>;
}