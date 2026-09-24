import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import { Search, X, Check, Trash2, Eye, Pencil, Loader2, Hourglass, Sparkles, PackageCheck, PackageX, Archive, AlertTriangle } from "lucide-react";
import {
  listValidationProducts, getValidationTotals, getValidationFacets, resolveValidationSelection, bulkValidationAction,
  type ValidationFilter, type ValidationRow,
} from "@/lib/admin-product-validation.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";

const DEFAULT_FILTER: ValidationFilter = {
  q: "", status: "to_review", source: "all", kind: "all", vendorId: null, categoryId: null,
  dateFrom: null, dateTo: null, quality: "all", sort: "created_at", dir: "desc",
};
const CHUNK = 100;
type BulkAction = "approve" | "reject" | "delete";
const ACTION_LABEL: Record<BulkAction, { verb: string; done: string }> = {
  approve: { verb: "approuver", done: "Approuvés" },
  reject: { verb: "rejeter", done: "Rejetés" },
  delete: { verb: "supprimer", done: "Supprimés" },
};

function fmtMoney(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "Prix à définir";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " FCFA";
}
function fmtDate(s: string) { try { return format(new Date(s), "dd/MM/yyyy"); } catch { return "—"; } }

export function ValidationPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listValidationProducts);
  const totalsFn = useServerFn(getValidationTotals);
  const facetsFn = useServerFn(getValidationFacets);
  const resolveFn = useServerFn(resolveValidationSelection);
  const bulkFn = useServerFn(bulkValidationAction);

  const [filterDraft, setFilterDraft] = useState<ValidationFilter>(DEFAULT_FILTER);
  const debQ = useDebouncedValue(filterDraft.q, 300);
  const filter = useMemo(() => ({ ...filterDraft, q: debQ }), [filterDraft, debQ]);
  const filterKey = JSON.stringify(filter);
  const set = <K extends keyof ValidationFilter>(k: K, v: ValidationFilter[K]) => setFilterDraft((f) => ({ ...f, [k]: v }));

  const { data: totals } = useQuery({ queryKey: ["admin", "validation", "totals"], queryFn: () => totalsFn(), staleTime: 15_000 });
  const { data: facets } = useQuery({ queryKey: ["admin", "validation", "facets"], queryFn: () => facetsFn(), staleTime: 300_000 });

  const list = useInfiniteQuery({
    queryKey: ["admin", "validation", "list", filterKey],
    initialPageParam: null as { v: string; id: string } | null,
    queryFn: ({ pageParam }) => listFn({ data: { filter, cursor: pageParam, limit: 40, withCount: pageParam === null } }),
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 15_000,
  });
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.rows) ?? [], [list.data]);
  const total = list.data?.pages[0]?.total ?? 0;

  // Chargement progressif : sentinelle en bas de liste.
  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((ents) => {
      if (ents[0]?.isIntersecting && list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage();
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [list.hasNextPage, list.isFetchingNextPage, list.fetchNextPage, rows.length]);

  // Sélection persistante (identifiants), mémorise le filtre d'origine.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selFilterKey, setSelFilterKey] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const selectionFromOtherFilter = selected.size > 0 && selFilterKey !== null && selFilterKey !== filterKey;
  const toggle = useCallback((id: string, on: boolean) => {
    setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
    setSelFilterKey((k) => k ?? filterKey);
  }, [filterKey]);
  const clearSel = () => { setSelected(new Set()); setSelFilterKey(null); };
  const allMatchingSelected = total > 0 && selected.size >= total && !selectionFromOtherFilter;

  async function selectAllMatching() {
    setSelecting(true);
    try {
      const r = await resolveFn({ data: { filter } });
      setSelected(new Set(r.ids));
      setSelFilterKey(filterKey);
      toast.success(`${r.ids.length} produit(s) sélectionné(s)`);
    } catch (e) { toast.error((e as Error).message); } finally { setSelecting(false); }
  }

  // Actions en masse par lots, avec progression réelle.
  const [confirm, setConfirm] = useState<BulkAction | null>(null);
  const [reason, setReason] = useState("");
  const [job, setJob] = useState<null | { action: BulkAction; total: number; processed: number; done: number; archived: number; errors: Array<{ name: string | null; reason: string }>; finished: boolean }>(null);

  async function runBulk(action: BulkAction) {
    const ids = [...selected];
    setConfirm(null);
    setJob({ action, total: ids.length, processed: 0, done: 0, archived: 0, errors: [], finished: false });
    for (let i = 0; i < ids.length; i += CHUNK) {
      const part = ids.slice(i, i + CHUNK);
      try {
        const r = await bulkFn({ data: { ids: part, action, reason: action === "reject" ? reason || null : null } });
        setJob((j) => j && { ...j, processed: j.processed + part.length, done: j.done + r.done, archived: j.archived + r.archived, errors: [...j.errors, ...r.errors] });
        const failed = new Set(r.errors.map((e) => e.id));
        setSelected((s) => { const n = new Set(s); for (const id of part) if (!failed.has(id)) n.delete(id); return n; });
      } catch (e) {
        setJob((j) => j && { ...j, processed: j.processed + part.length, errors: [...j.errors, ...part.map(() => ({ name: null, reason: (e as Error).message }))] });
      }
    }
    setJob((j) => j && { ...j, finished: true });
    setReason("");
    qc.invalidateQueries({ queryKey: ["admin", "validation"] });
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
  }

  const running = !!job && !job.finished;
  const filtersActive = JSON.stringify({ ...filterDraft }) !== JSON.stringify(DEFAULT_FILTER);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Tile label="À valider" value={totals?.to_review} icon={Hourglass} tone="text-amber-600" onClick={() => set("status", "to_review")} active={filterDraft.status === "to_review"} />
        <Tile label="Validés auto" value={totals?.auto} icon={Sparkles} tone="text-primary" onClick={() => set("status", "auto")} active={filterDraft.status === "auto"} />
        <Tile label="Validés" value={totals?.approved} icon={PackageCheck} tone="text-emerald-600" onClick={() => set("status", "approved")} active={filterDraft.status === "approved"} />
        <Tile label="Rejetés" value={totals?.rejected} icon={PackageX} tone="text-destructive" onClick={() => set("status", "rejected")} active={filterDraft.status === "rejected"} />
        <Tile label="Archivés" value={totals?.archived} icon={Archive} tone="text-muted-foreground" onClick={() => set("status", "archived")} active={filterDraft.status === "archived"} />
      </div>

      <Card>
        <CardContent className="space-y-2 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Nom, désignation, SKU, code, référence CJ, boutique…" className="pl-8" value={filterDraft.q} onChange={(e) => set("q", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
            <Select value={filterDraft.vendorId ?? "all"} onValueChange={(v) => set("vendorId", v === "all" ? null : v)}>
              <SelectTrigger className="col-span-2"><SelectValue placeholder="Boutique" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">Toutes les boutiques</SelectItem>
                {(facets?.vendors ?? []).map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterDraft.status} onValueChange={(v) => set("status", v as ValidationFilter["status"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="to_review">À valider</SelectItem>
                <SelectItem value="approved">Validés (tous)</SelectItem>
                <SelectItem value="auto">Validés automatiquement</SelectItem>
                <SelectItem value="manual">Validés manuellement</SelectItem>
                <SelectItem value="rejected">Rejetés</SelectItem>
                <SelectItem value="archived">Archivés</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterDraft.source} onValueChange={(v) => set("source", v as ValidationFilter["source"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes sources</SelectItem>
                <SelectItem value="cj_import">Import CJ</SelectItem>
                <SelectItem value="manual">Manuel</SelectItem>
                <SelectItem value="other">Autre</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterDraft.kind} onValueChange={(v) => set("kind", v as ValidationFilter["kind"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Nouveaux + modifs</SelectItem>
                <SelectItem value="new">Nouveaux</SelectItem>
                <SelectItem value="edit">Modifications</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterDraft.quality} onValueChange={(v) => set("quality", v as ValidationFilter["quality"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toute qualité</SelectItem>
                <SelectItem value="issues">Avec erreur / à vérifier</SelectItem>
                <SelectItem value="incomplete">Incomplets</SelectItem>
              </SelectContent>
            </Select>
            <Select value={`${filterDraft.sort}:${filterDraft.dir}`} onValueChange={(v) => { const [s, d] = v.split(":"); setFilterDraft((f) => ({ ...f, sort: s as ValidationFilter["sort"], dir: d as ValidationFilter["dir"] })); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at:desc">Plus récents</SelectItem>
                <SelectItem value="created_at:asc">Plus anciens</SelectItem>
                <SelectItem value="updated_at:desc">Modifiés récemment</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterDraft.categoryId ?? "all"} onValueChange={(v) => set("categoryId", v === "all" ? null : v)}>
              <SelectTrigger className="col-span-2 md:col-span-2"><SelectValue placeholder="Catégorie" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">Toutes catégories</SelectItem>
                {(facets?.categories ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.path}</SelectItem>)}
              </SelectContent>
            </Select>
            <label className="col-span-1 flex items-center gap-1 text-xs text-muted-foreground">Du
              <Input type="date" className="h-9" value={filterDraft.dateFrom ?? ""} onChange={(e) => set("dateFrom", e.target.value || null)} />
            </label>
            <label className="col-span-1 flex items-center gap-1 text-xs text-muted-foreground">au
              <Input type="date" className="h-9" value={filterDraft.dateTo ?? ""} onChange={(e) => set("dateTo", e.target.value || null)} />
            </label>
          </div>
          {filtersActive ? (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFilterDraft(DEFAULT_FILTER)}>
              <X className="mr-1 h-3 w-3" /> Réinitialiser les filtres
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {/* Barre de sélection / actions — toujours visible en haut */}
      <div className="sticky top-0 z-20 space-y-2 rounded-lg border bg-background/95 p-2 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox" className="h-4 w-4 accent-primary"
              checked={allMatchingSelected}
              disabled={selecting || total === 0 || running}
              onChange={(e) => (e.target.checked ? selectAllMatching() : clearSel())}
            />
            Tout sélectionner
          </label>
          {selecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          <span className="text-sm text-muted-foreground">
            <strong className="text-foreground">{total}</strong> produit{total > 1 ? "s" : ""} correspondent au filtre
            {list.isFetching && !list.isFetchingNextPage ? " · …" : ""}
          </span>
          {selected.size > 0 ? (
            <>
              <Badge variant="secondary">{selected.size} sélectionné{selected.size > 1 ? "s" : ""}</Badge>
              <div className="ml-auto flex flex-wrap gap-1.5">
                <Button size="sm" className="h-8" disabled={running} onClick={() => setConfirm("approve")}><Check className="mr-1 h-3.5 w-3.5" />Approuver</Button>
                <Button size="sm" variant="outline" className="h-8" disabled={running} onClick={() => setConfirm("reject")}><X className="mr-1 h-3.5 w-3.5" />Rejeter</Button>
                <Button size="sm" variant="destructive" className="h-8" disabled={running} onClick={() => setConfirm("delete")}><Trash2 className="mr-1 h-3.5 w-3.5" />Supprimer</Button>
                <Button size="sm" variant="ghost" className="h-8" disabled={running} onClick={clearSel}>Désélectionner</Button>
              </div>
            </>
          ) : null}
        </div>
        {selectionFromOtherFilter ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            {selected.size} produit(s) sélectionné(s) avec un filtre précédent restent sélectionnés.
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={clearSel}>Réinitialiser la sélection</Button>
          </div>
        ) : null}
        {job ? (
          <div className="space-y-1 rounded-md bg-muted/60 px-2 py-1.5 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              {job.finished ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span className="font-medium">{job.finished ? "Terminé" : "Traitement…"} {job.processed} / {job.total}</span>
              <span>{ACTION_LABEL[job.action].done} : {job.done}</span>
              {job.archived ? <span>Archivés (déjà vendus) : {job.archived}</span> : null}
              <span className={job.errors.length ? "text-destructive" : ""}>Erreurs : {job.errors.length}</span>
              {job.finished ? <Button size="sm" variant="ghost" className="ml-auto h-6 px-2 text-xs" onClick={() => setJob(null)}>Fermer</Button> : null}
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-background"><div className="h-full bg-primary transition-all" style={{ width: `${job.total ? (job.processed / job.total) * 100 : 0}%` }} /></div>
            {job.finished && job.errors.length ? (
              <ul className="max-h-24 list-disc overflow-auto pl-4 text-destructive">
                {job.errors.slice(0, 20).map((e, i) => <li key={i}>{e.name ?? "Produit"} : {e.reason}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        {list.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Chargement…</p>
        ) : list.isError ? (
          <p className="p-4 text-sm text-destructive">{(list.error as Error).message}</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Aucun produit ne correspond au filtre.</p>
        ) : rows.map((r) => <Row key={r.id} row={r} checked={selected.has(r.id)} onCheck={(on) => toggle(r.id, on)} disabled={running} />)}
        <div ref={sentinel} className="flex h-10 items-center justify-center text-xs text-muted-foreground">
          {list.isFetchingNextPage ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Chargement…</> : list.hasNextPage ? "" : rows.length ? `${rows.length} / ${total} affichés` : ""}
        </div>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm ? `${ACTION_LABEL[confirm].verb[0].toUpperCase()}${ACTION_LABEL[confirm].verb.slice(1)} ${selected.size} produit(s) ?` : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              Vous êtes sur le point de {confirm ? ACTION_LABEL[confirm].verb : ""} <strong>{selected.size}</strong> produit(s).
              {confirm === "delete" ? " Les produits déjà vendus seront archivés pour préserver l'historique ; les autres seront supprimés définitivement." : ""}
              {confirm === "approve" ? " L'approbation ne change pas l'activation : un produit inactif reste non publié." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm === "reject" ? (
            <Textarea placeholder="Motif du rejet (envoyé aux boutiques)" value={reason} onChange={(e) => setReason(e.target.value)} />
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className={confirm === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              onClick={(e) => { e.preventDefault(); if (confirm) runBulk(confirm); }}
            >Confirmer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Tile({ label, value, icon: Icon, tone, onClick, active }: { label: string; value?: number; icon: typeof Hourglass; tone: string; onClick: () => void; active: boolean }) {
  return (
    <button onClick={onClick} className={cn("flex items-center gap-2 rounded-lg border bg-card p-2.5 text-left transition-colors hover:bg-muted/50", active && "border-primary ring-1 ring-primary")}>
      <Icon className={cn("h-5 w-5 shrink-0", tone)} />
      <div className="min-w-0">
        <div className="text-lg font-bold leading-none">{value ?? "—"}</div>
        <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      </div>
    </button>
  );
}

function StatusBadges({ row }: { row: ValidationRow }) {
  const out: React.ReactNode[] = [];
  if (row.source === "cj_import") out.push(<Badge key="src" variant="outline" className="text-[10px]">Import CJ</Badge>);
  if (row.is_archived) out.push(<Badge key="s" variant="secondary">Archivé</Badge>);
  else if (row.status === "pending") out.push(<Badge key="s" variant="outline" className="border-amber-500 text-amber-600">{row.review_reasons.length ? "À vérifier" : row.is_edit ? "Modification à valider" : "À valider"}</Badge>);
  else if (row.status === "rejected") out.push(<Badge key="s" variant="destructive">Rejeté</Badge>);
  else {
    out.push(<Badge key="s" className="bg-emerald-600 hover:bg-emerald-600">{row.validation_mode === "auto" ? "Validé automatiquement" : "Validé"}</Badge>);
    out.push(<Badge key="p" variant="secondary" className="text-[10px]">{row.is_active ? "Publié" : "Non publié"}</Badge>);
  }
  return <div className="flex flex-wrap gap-1">{out}</div>;
}

function Row({ row, checked, onCheck, disabled }: { row: ValidationRow; checked: boolean; onCheck: (on: boolean) => void; disabled: boolean }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border bg-card p-2.5", checked && "border-primary bg-primary/5")}>
      <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={checked} disabled={disabled} onChange={(e) => onCheck(e.target.checked)} aria-label={`Sélectionner ${row.name}`} />
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-muted">
        {row.image_url ? <img src={row.image_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : null}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="line-clamp-1 text-sm font-semibold">{row.name}</div>
        <div className="text-xs text-muted-foreground">#{row.code} · {fmtMoney(row.price)} · {row.vendor_name ?? "—"} · {fmtDate(row.created_at)}</div>
        <StatusBadges row={row} />
        {row.status === "pending" && row.review_reasons.length ? (
          <div className="text-[11px] text-amber-700 dark:text-amber-400">{row.review_reasons.join(" · ")}</div>
        ) : null}
        {row.status === "rejected" && row.rejection_reason ? <div className="text-[11px] text-destructive">Motif : {row.rejection_reason}</div> : null}
      </div>
      <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
        <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
          <Link to="/admin/products/$productId/moderate" params={{ productId: row.id }}><Eye className="mr-1 h-3 w-3" />Examiner</Link>
        </Button>
        <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
          <Link to="/admin/products/$productId/edit" params={{ productId: row.id }}><Pencil className="mr-1 h-3 w-3" />Modifier</Link>
        </Button>
      </div>
    </div>
  );
}
