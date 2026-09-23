import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Play, Trash2, Pencil, CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { listCjSchedules, saveCjSchedule, deleteCjSchedule, runCjScheduleNow, type Criteria } from "@/lib/cj-center.functions";
import { CriteriaForm, EMPTY_CRITERIA } from "./CriteriaForm";

type Draft = { id: string | null; name: string; enabled: boolean; hourUtc: number; maxNew: number; criteria: Criteria };
const NEW: Draft = { id: null, name: "", enabled: true, hourUtc: 2, maxNew: 100, criteria: { ...EMPTY_CRITERIA, requireImages: true, requireWeight: true, requireDimensions: true } };

export function CjSchedulesPanel({ categories }: { categories: Array<{ id: string; path: string }> }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listCjSchedules);
  const saveFn = useServerFn(saveCjSchedule);
  const delFn = useServerFn(deleteCjSchedule);
  const runFn = useServerFn(runCjScheduleNow);
  const [draft, setDraft] = useState<Draft | null>(null);
  const { data } = useQuery({ queryKey: ["cj-schedules"], queryFn: () => listFn() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["cj-schedules"] });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b pb-4"><div className="min-w-0"><h2 className="font-semibold">Imports automatiques</h2><p className="text-sm text-muted-foreground">Recherchez et importez de nouveaux produits chaque jour.</p></div>{!draft && <Button size="sm" onClick={() => setDraft({ ...NEW })}><Plus className="h-4 w-4" />Nouvelle règle</Button>}</div>
      {draft && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{draft.id ? "Modifier la règle" : "Nouvelle règle"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="col-span-2 space-y-1">
                <Label className="text-[11px]">Nom</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="ex. Irrigation quotidienne" className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Heure (Dakar)</Label>
                <Input type="number" min={0} max={23} value={draft.hourUtc} onChange={(e) => setDraft({ ...draft, hourUtc: Number(e.target.value) })} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Max nouveaux / jour</Label>
                <Input type="number" min={1} max={5000} value={draft.maxNew} onChange={(e) => setDraft({ ...draft, maxNew: Number(e.target.value) })} className="h-9" />
              </div>
            </div>
            <CriteriaForm value={draft.criteria} onChange={(c) => setDraft({ ...draft, criteria: c })} categories={categories} />
            <div className="flex gap-2">
              <Button size="sm" onClick={async () => {
                if (!draft.criteria.keyword && !draft.criteria.categoryId) { toast.error("Indiquez au moins un mot-clé ou une catégorie."); return; }
                try { await saveFn({ data: draft }); toast.success("Règle enregistrée"); setDraft(null); refresh(); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
              }}>Enregistrer</Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Annuler</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {(data?.schedules ?? []).map((s: any) => (
        <Card key={s.id} className="overflow-hidden">
          <CardContent className="space-y-4 p-4 text-xs">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{s.name}</p><p className="mt-1 flex items-center gap-1 text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" />Tous les jours à {String(s.hour_utc).padStart(2, "0")}:00 · {s.max_new} produits maximum</p></div><Badge variant={s.enabled ? "secondary" : "outline"}>{s.enabled ? "Active" : "Désactivée"}</Badge></div>
            <div className="grid gap-1 rounded-md bg-muted/40 p-3 text-muted-foreground sm:grid-cols-2">
              <p>Recherche : <span className="font-medium text-foreground">{s.criteria?.keyword ? `« ${s.criteria.keyword} »` : "Catégorie sélectionnée"}</span></p>
              <p>Nouveaux uniquement</p>
              {s.criteria?.maxPrice != null && <p>Prix ≤ {s.criteria.maxPrice} USD</p>}
              {s.criteria?.minStock != null && <p>Stock ≥ {s.criteria.minStock}</p>}
            </div>
            <p className="text-muted-foreground">Prochaine exécution : {s.enabled ? `demain à ${String(s.hour_utc).padStart(2, "0")}:00` : "désactivée"}</p>
            <div className="flex flex-wrap gap-1 border-t pt-3">
              <Button size="sm" variant="outline" onClick={async () => { try { await runFn({ data: { id: s.id } }); toast.success("Import lancé — voir l'onglet Imports"); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); } }}><Play className="mr-1 h-3 w-3" />Lancer</Button>
              <Button size="sm" variant="outline" onClick={async () => { await saveFn({ data: { id: s.id, name: s.name, enabled: !s.enabled, hourUtc: s.hour_utc, maxNew: s.max_new, criteria: s.criteria } }); refresh(); }}>{s.enabled ? "Désactiver" : "Activer"}</Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft({ id: s.id, name: s.name, enabled: s.enabled, hourUtc: s.hour_utc, maxNew: s.max_new, criteria: { ...EMPTY_CRITERIA, ...s.criteria } })}><Pencil className="h-3 w-3" /></Button>
              <Button size="sm" variant="ghost" onClick={async () => { if (confirm("Supprimer cette règle ?")) { await delFn({ data: { id: s.id } }); refresh(); } }}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
