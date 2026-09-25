import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Play, Trash2, Pencil, CalendarClock, ArrowUp, ArrowDown, X, FileBarChart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listCjSchedules, saveCjSchedule, deleteCjSchedule, runCjScheduleNow, getCjJobReport, type Criteria, type ScheduleTarget } from "@/lib/cj-center.functions";
import { EMPTY_CRITERIA } from "./CriteriaForm";
import { CategoryTreePicker, type CjNode } from "./CategoryTreePicker";

type Draft = { id: string | null; name: string; enabled: boolean; hourUtc: number; maxNew: number; criteria: Criteria };
const newTarget = (i: number): ScheduleTarget => ({ key: `t${Date.now().toString(36)}${i}`, label: "", keyword: "", categoryId: null, quota: 10, priority: i + 1 });
const NEW: Draft = {
  id: null, name: "", enabled: true, hourUtc: 2, maxNew: 30,
  criteria: { ...EMPTY_CRITERIA, requireImages: true, newOnly: true, quotaMode: "per_category", frequencyDays: 1, targets: [newTarget(0)] },
};
const FREQ: Record<number, string> = { 1: "Tous les jours", 2: "Tous les 2 jours", 3: "Tous les 3 jours", 7: "Chaque semaine" };

/** Ancienne règle (mot-clé unique) → cibles modifiables. */
function toDraft(s: any): Draft {
  const c = { ...EMPTY_CRITERIA, ...(s.criteria ?? {}) } as Criteria;
  if (!c.targets?.length && (c.keyword || c.categoryId)) {
    c.targets = [{ key: "t1", label: c.keyword || "Catégorie", keyword: c.keyword ?? "", categoryId: c.categoryId ?? null, quota: 0, priority: 1 }];
    c.quotaMode = "global";
  }
  return { id: s.id, name: s.name, enabled: s.enabled, hourUtc: s.hour_utc, maxNew: s.max_new, criteria: c };
}

export function CjSchedulesPanel({ categories, nodes = [] }: { categories: Array<{ id: string; path: string }>; nodes?: CjNode[] }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listCjSchedules);
  const saveFn = useServerFn(saveCjSchedule);
  const delFn = useServerFn(deleteCjSchedule);
  const runFn = useServerFn(runCjScheduleNow);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["cj-schedules"], queryFn: () => listFn() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["cj-schedules"] });
  const allNodes: CjNode[] = nodes.length ? nodes : categories.map((c) => ({ ...c, level: 3 as const }));
  const catName = (id?: string | null) => allNodes.find((c) => c.id === id)?.path.split(" › ").pop() ?? null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b pb-4">
        <div className="min-w-0"><h2 className="font-semibold">Imports automatiques</h2><p className="text-sm text-muted-foreground">Choisissez une famille entière ou une sous-catégorie, et un nombre de produits par jour (jusqu'à 5 000). La recherche continue sur le serveur, page fermée.</p></div>
        {!draft && <Button size="sm" onClick={() => setDraft(structuredClone(NEW))}><Plus className="h-4 w-4" />Nouvelle règle</Button>}
      </div>
      {draft && <RuleEditor draft={draft} setDraft={setDraft} nodes={allNodes} onSave={async () => {
        const targets = (draft.criteria.targets ?? []).filter((t) => t.keyword?.trim() || t.categoryId);
        if (!targets.length) { toast.error("Ajoutez au moins une recherche (mot-clé ou catégorie)."); return; }
        const criteria = { ...draft.criteria, targets: targets.map((t, i) => ({ ...t, label: t.label || t.keyword || catName(t.categoryId) || `Recherche ${i + 1}`, priority: i + 1 })) };
        const perCat = criteria.quotaMode !== "global";
        const maxNew = perCat ? Math.min(draft.maxNew, targets.reduce((n, t) => n + (t.quota || 0), 0)) || draft.maxNew : draft.maxNew;
        try { await saveFn({ data: { ...draft, maxNew, criteria } }); toast.success("Règle enregistrée"); setDraft(null); refresh(); }
        catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
      }} />}
      {(data?.schedules ?? []).map((s: any) => {
        const d = toDraft(s);
        const c = d.criteria;
        return (
          <Card key={s.id} className="overflow-hidden">
            <CardContent className="space-y-3 p-4 text-xs">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{s.name}</p>
                  <p className="mt-1 flex items-center gap-1 text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" />{FREQ[c.frequencyDays ?? 1]} à {String(s.hour_utc).padStart(2, "0")}:00 · {c.quotaMode === "global" ? `${s.max_new} produits au total` : `quota par catégorie, ${s.max_new} max`}</p>
                </div>
                <Badge variant={s.enabled ? "secondary" : "outline"}>{s.enabled ? "Active" : "Désactivée"}</Badge>
              </div>
              <ol className="space-y-1 rounded-md bg-muted/40 p-3">
                {(c.targets ?? []).map((t, i) => <li key={t.key} className="flex justify-between gap-2"><span className="truncate">{i + 1}. {t.label}{t.categoryId && t.keyword ? ` · ${catName(t.categoryId)}` : ""}</span><span className="shrink-0 text-muted-foreground">{t.quota ? `jusqu'à ${t.quota}` : "sans limite"}</span></li>)}
              </ol>
              <p className="text-muted-foreground">Filtres : nouveaux uniquement{c.minStock != null ? ` · stock ≥ ${c.minStock}` : ""}{c.maxPrice != null ? ` · prix ≤ ${c.maxPrice} USD` : ""}{c.maxWeightKg != null ? ` · poids ≤ ${c.maxWeightKg} kg` : ""}{c.minImages != null ? ` · ≥ ${c.minImages} images` : ""}</p>
              <div className="flex flex-wrap gap-1 border-t pt-3">
                <Button size="sm" variant="outline" onClick={async () => { try { await runFn({ data: { id: s.id } }); toast.success("Import lancé — voir l'onglet Imports"); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); } }}><Play className="mr-1 h-3 w-3" />Lancer maintenant</Button>
                <Button size="sm" variant="outline" onClick={async () => { await saveFn({ data: { id: s.id, name: s.name, enabled: !s.enabled, hourUtc: s.hour_utc, maxNew: s.max_new, criteria: s.criteria } }); refresh(); }}>{s.enabled ? "Désactiver" : "Activer"}</Button>
                {s.last_job_id && <Button size="sm" variant="outline" onClick={() => setReport(report === s.last_job_id ? null : s.last_job_id)}><FileBarChart className="mr-1 h-3 w-3" />Dernier rapport</Button>}
                <Button size="sm" variant="ghost" onClick={() => setDraft(d)} aria-label="Modifier"><Pencil className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" aria-label="Supprimer" onClick={async () => { if (confirm("Supprimer cette règle ?")) { await delFn({ data: { id: s.id } }); refresh(); } }}><Trash2 className="h-3 w-3" /></Button>
              </div>
              {report === s.last_job_id && <RunReport jobId={s.last_job_id} />}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function NumIn({ label, value, onChange, min = 0 }: { label: string; value: number | null | undefined; onChange: (v: number | null) => void; min?: number }) {
  return <div className="space-y-1"><Label className="text-[11px]">{label}</Label><Input type="number" min={min} className="h-9" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} /></div>;
}

function RuleEditor({ draft, setDraft, nodes, onSave }: { draft: Draft; setDraft: (d: Draft | null) => void; nodes: CjNode[]; onSave: () => void }) {
  const c = draft.criteria;
  const targets = c.targets ?? [];
  const setC = (patch: Partial<Criteria>) => setDraft({ ...draft, criteria: { ...c, ...patch } });
  const setT = (i: number, patch: Partial<ScheduleTarget>) => setC({ targets: targets.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const move = (i: number, dir: -1 | 1) => { const n = [...targets]; const j = i + dir; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setC({ targets: n }); };
  const perCat = c.quotaMode !== "global";
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{draft.id ? "Modifier la règle" : "Nouvelle règle"}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1"><Label className="text-[11px]">Nom</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="ex. Décoration pâtisserie quotidienne" className="h-9" /></div>

        <div className="space-y-2">
          <Label className="text-[11px]">Recherches, par ordre de priorité</Label>
          {targets.map((t, i) => (
            <div key={t.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 rounded-md border p-2">
              <div className="flex flex-col"><Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => move(i, -1)} aria-label="Monter"><ArrowUp className="h-3 w-3" /></Button><span className="text-center text-xs font-semibold">{i + 1}</span><Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => move(i, 1)} aria-label="Descendre"><ArrowDown className="h-3 w-3" /></Button></div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_90px]">
                <Input className="h-9" value={t.keyword ?? ""} onChange={(e) => setT(i, { keyword: e.target.value, label: e.target.value })} placeholder="Mot-clé (facultatif)" />
                <CategoryTreePicker className="h-9" nodes={nodes} value={t.categoryId} onChange={(id) => setT(i, { categoryId: id })} placeholder="Toutes les catégories CJ" />
                <Input className="h-9" type="number" min={0} value={t.quota} onChange={(e) => setT(i, { quota: Math.max(0, Number(e.target.value) || 0) })} aria-label="Quota" title={perCat ? "Produits max pour cette recherche" : "Plafond facultatif (0 = sans limite)"} />
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setC({ targets: targets.filter((_, j) => j !== i) })} aria-label="Retirer"><X className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setC({ targets: [...targets, newTarget(targets.length)] })}><Plus className="h-3 w-3" />Ajouter une catégorie / recherche</Button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="col-span-2 space-y-1">
            <Label className="text-[11px]">Mode de remplissage</Label>
            <Select value={perCat ? "per_category" : "global"} onValueChange={(v) => setC({ quotaMode: v as any })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="per_category">Quota par catégorie</SelectItem><SelectItem value="global">Quota global (ordre de priorité)</SelectItem></SelectContent>
            </Select>
          </div>
          <NumIn label={perCat ? "Maximum total par exécution" : "Produits par exécution"} value={draft.maxNew} min={1} onChange={(v) => setDraft({ ...draft, maxNew: Math.max(1, v ?? 1) })} />
          <div className="space-y-1">
            <Label className="text-[11px]">Fréquence</Label>
            <Select value={String(c.frequencyDays ?? 1)} onValueChange={(v) => setC({ frequencyDays: Number(v) })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(FREQ).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <NumIn label="Heure (Dakar)" value={draft.hourUtc} onChange={(v) => setDraft({ ...draft, hourUtc: Math.max(0, Math.min(23, v ?? 0)) })} />
          <NumIn label="Stock minimum" value={c.minStock} onChange={(v) => setC({ minStock: v })} />
          <NumIn label="Prix maximum (USD)" value={c.maxPrice} onChange={(v) => setC({ maxPrice: v })} />
          <NumIn label="Poids maximum (kg)" value={c.maxWeightKg} onChange={(v) => setC({ maxWeightKg: v })} />
          <NumIn label="Images minimum" value={c.minImages} onChange={(v) => setC({ minImages: v })} />
        </div>
        <label className="flex items-center gap-2 text-xs"><Checkbox checked disabled />Nouveaux produits uniquement (vérifié sur le catalogue réel)</label>

        <div className="flex gap-2">
          <Button size="sm" onClick={onSave}>{draft.id ? "Enregistrer" : "Activer"}</Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Annuler</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RunReport({ jobId }: { jobId: string }) {
  const fn = useServerFn(getCjJobReport);
  const { data } = useQuery({ queryKey: ["cj-report", jobId], queryFn: () => fn({ data: { jobId } }), refetchInterval: 10000 });
  if (!data) return <p className="text-muted-foreground">Chargement du rapport…</p>;
  if (!data.targets.length) return <p className="text-muted-foreground">Rapport détaillé indisponible pour cette exécution.</p>;
  return (
    <div className="space-y-2 border-t pt-3">
      {data.targets.map((t: any) => (
        <div key={t.label} className="rounded-md border p-2">
          <p className="font-semibold">{t.label}</p>
          <div className="mt-1 grid grid-cols-3 gap-1 sm:grid-cols-6">
            <R l="Objectif" v={t.goal ?? "—"} /><R l="Trouvés" v={t.found} /><R l="Nouveaux" v={t.fresh} />
            <R l="Déjà importés" v={t.existing} /><R l="Importés" v={t.imported} /><R l="Exclus" v={t.skipped + t.failed} />
          </div>
          {Object.keys(t.reasons).length > 0 && <p className="mt-1 text-muted-foreground">Raisons : {Object.entries(t.reasons).map(([r, n]) => `${r} (${n})`).join(" · ")}</p>}
          {t.pending > 0 && <p className="text-muted-foreground">{t.pending} en cours d'import…</p>}
          {t.exhausted && t.goal && t.imported < t.goal && <p className="text-muted-foreground">Pas assez de résultats pertinents : passage à la recherche suivante.</p>}
        </div>
      ))}
    </div>
  );
}

function R({ l, v }: { l: string; v: number | string }) {
  return <div><p className="text-[10px] text-muted-foreground">{l}</p><p className="font-semibold">{v}</p></div>;
}
