import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Globe, Loader2, Pause, Play, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { TRANSLATION_LANGS, TRANSLATION_SCOPES, type TranslationScope } from "@/lib/translation/langs";
import { controlTranslation, getTranslationJobs, previewTranslation, startTranslation } from "@/lib/translation/center.functions";

type Bucket = { total: number; pending: number; translated: number; skipped: number; errors: number; done: boolean };
type Job = {
  id: string; status: string; langs: string[]; scopes: TranslationScope[]; current_scope: string | null;
  stats: Record<string, Bucket>; pause_reason: string | null; last_error: string | null;
  created_at: string; finished_at: string | null;
};

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  queued: { label: "En attente", variant: "secondary" },
  running: { label: "En cours", variant: "default" },
  paused: { label: "En pause", variant: "outline" },
  cancelled: { label: "Annulée", variant: "outline" },
  done: { label: "Terminée", variant: "secondary" },
  error: { label: "Erreur", variant: "destructive" },
};
const scopeLabel = (s: string) => TRANSLATION_SCOPES.find((x) => x.id === s)?.label ?? s;

/** Centre de traduction : bouton « Traduire les contenus » du tableau de bord admin. */
export function TranslationSyncCard() {
  const qc = useQueryClient();
  const fetchJobs = useServerFn(getTranslationJobs);
  const preview = useServerFn(previewTranslation);
  const start = useServerFn(startTranslation);
  const control = useServerFn(controlTranslation);

  const [open, setOpen] = useState(false);
  const [langs, setLangs] = useState<string[]>(TRANSLATION_LANGS.map((l) => l.code));
  const [scopes, setScopes] = useState<string[]>(TRANSLATION_SCOPES.map((s) => s.id));
  const [counts, setCounts] = useState<Record<string, { pending: number; total: number }> | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: jobs = [] } = useQuery({
    queryKey: ["translation-jobs"],
    queryFn: () => fetchJobs() as Promise<Job[]>,
    refetchInterval: (q) => ((q.state.data as Job[] | undefined)?.some((j) => j.status === "running" || j.status === "queued") ? 4000 : false),
  });
  const active = jobs.find((j) => ["queued", "running", "paused"].includes(j.status));
  const last = active ?? jobs[0];

  useEffect(() => {
    if (!open || langs.length === 0) { setCounts(null); return; }
    let cancel = false;
    setLoadingCounts(true);
    preview({ data: { langs } })
      .then((c) => { if (!cancel) setCounts(c as any); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Estimation impossible"))
      .finally(() => { if (!cancel) setLoadingCounts(false); });
    return () => { cancel = true; };
  }, [open, langs.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (arr: string[], v: string, set: (a: string[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const launch = async () => {
    setBusy(true);
    try {
      await start({ data: { langs, scopes } });
      toast.success("Traduction lancée", { description: "Elle continue en arrière-plan, même si vous fermez le navigateur." });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["translation-jobs"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lancement impossible");
    } finally { setBusy(false); }
  };

  const act = async (action: "pause" | "resume" | "cancel") => {
    if (!active) return;
    await control({ data: { id: active.id, action } });
    qc.invalidateQueries({ queryKey: ["translation-jobs"] });
  };

  const totals = last ? last.scopes.reduce((a, s) => {
    const b = last.stats[s]; if (!b) return a;
    a.pending += b.pending; a.processed += b.translated + b.skipped + b.errors; return a;
  }, { pending: 0, processed: 0 }) : { pending: 0, processed: 0 };
  const pct = last ? (last.status === "done" ? 100 : totals.pending ? Math.min(99, Math.round((totals.processed / totals.pending) * 100)) : 0) : 0;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Globe className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Centre de traduction</div>
            <div className="text-xs text-muted-foreground">Produits, variantes, catégories, pays, boutiques, bannières — uniquement ce qui manque ou a changé</div>
          </div>
        </div>
        <Button className="w-full" onClick={() => setOpen(true)} disabled={!!active}>
          <Globe className="mr-2 h-4 w-4" /> 🌐 Traduire les contenus
        </Button>

        {last && (
          <div className="space-y-2 rounded-md border bg-card p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant={STATUS[last.status]?.variant ?? "secondary"}>{STATUS[last.status]?.label ?? last.status}</Badge>
                <span className="text-muted-foreground">{last.langs.map((l) => l.toUpperCase()).join(" · ")}</span>
                {last.status === "running" && last.current_scope && <span className="text-muted-foreground">— {scopeLabel(last.current_scope)}</span>}
              </div>
              {active && (
                <div className="flex gap-1">
                  {active.status === "paused"
                    ? <Button size="sm" variant="outline" className="h-7" onClick={() => act("resume")}><Play className="mr-1 h-3 w-3" />Reprendre</Button>
                    : <Button size="sm" variant="outline" className="h-7" onClick={() => act("pause")}><Pause className="mr-1 h-3 w-3" />Pause</Button>}
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => act("cancel")}><X className="mr-1 h-3 w-3" />Annuler</Button>
                </div>
              )}
            </div>
            <Progress value={pct} className="h-2" />
            {last.pause_reason && last.status === "paused" && <p className="text-muted-foreground">{last.pause_reason}</p>}
            {last.last_error && active && <p className="text-muted-foreground">Dernier incident : {last.last_error} (reprise automatique)</p>}
            <div className="overflow-hidden rounded-md border">
              <table className="w-full">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">Contenu</th>
                    <th className="px-2 py-1 text-right font-medium">À traiter</th>
                    <th className="px-2 py-1 text-right font-medium">Traduits</th>
                    <th className="px-2 py-1 text-right font-medium">Déjà à jour</th>
                    <th className="px-2 py-1 text-right font-medium">Erreurs</th>
                    <th className="px-2 py-1 text-right font-medium">État</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {last.scopes.map((s) => {
                    const b = last.stats[s] ?? { pending: 0, translated: 0, skipped: 0, errors: 0, done: false, total: 0 };
                    return (
                      <tr key={s}>
                        <td className="px-2 py-1">{scopeLabel(s)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{b.pending}</td>
                        <td className="px-2 py-1 text-right font-semibold tabular-nums">{b.translated}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{Math.max(0, b.total - b.pending) + b.skipped}</td>
                        <td className={`px-2 py-1 text-right tabular-nums ${b.errors ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{b.errors}</td>
                        <td className="px-2 py-1 text-right text-muted-foreground">{b.done ? "Fini" : last.current_scope === s && last.status === "running" ? "En cours" : "En attente"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {last.status === "done" && last.finished_at && (
              <p className="text-muted-foreground">Terminée le {new Date(last.finished_at).toLocaleString("fr-FR")}. Les éléments en erreur seront retentés au prochain lancement.</p>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>🌐 Traduire les contenus</DialogTitle>
            <DialogDescription>Seuls les contenus manquants ou modifiés sont traduits. Les traductions saisies à la main ne sont jamais écrasées.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Langues</p>
              <div className="grid grid-cols-3 gap-2">
                {TRANSLATION_LANGS.map((l) => (
                  <label key={l.code} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm">
                    <Checkbox checked={langs.includes(l.code)} onCheckedChange={() => toggle(langs, l.code, setLangs)} />
                    <span>{l.flag} {l.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Contenus</p>
                {loadingCounts && <span className="flex items-center text-xs text-muted-foreground"><RefreshCw className="mr-1 h-3 w-3 animate-spin" />Calcul…</span>}
              </div>
              <div className="space-y-1.5">
                {TRANSLATION_SCOPES.map((s) => {
                  const c = counts?.[s.id];
                  return (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm">
                      <Checkbox checked={scopes.includes(s.id)} onCheckedChange={() => toggle(scopes, s.id, setScopes)} />
                      <span className="flex-1">{s.label}</span>
                      {c && (
                        <span className="text-xs text-muted-foreground">
                          <b className="text-foreground">{c.pending.toLocaleString("fr-FR")}</b> à traduire · {(c.total - c.pending).toLocaleString("fr-FR")} à jour
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
            <Button className="w-full" onClick={launch} disabled={busy || langs.length === 0 || scopes.length === 0}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Lancer la traduction
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
