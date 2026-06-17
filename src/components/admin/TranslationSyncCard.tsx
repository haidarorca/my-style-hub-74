import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { syncTranslations } from "@/lib/sync-translations.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Languages, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Report = Awaited<ReturnType<typeof syncTranslations>>;

type Scope = "all" | "products" | "categories" | "countries" | "shops" | "banners" | "settings";

const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: "all", label: "Tout" },
  { id: "products", label: "Produits" },
  { id: "categories", label: "Catégories" },
  { id: "countries", label: "Pays" },
  { id: "shops", label: "Boutiques" },
  { id: "banners", label: "Bannières" },
  { id: "settings", label: "Paramètres" },
];

const BUCKETS: Array<{ key: keyof Pick<Report, "products" | "categories" | "countries" | "shops" | "banners" | "settings">; label: string }> = [
  { key: "products", label: "Produits" },
  { key: "categories", label: "Catégories" },
  { key: "countries", label: "Pays" },
  { key: "shops", label: "Boutiques" },
  { key: "banners", label: "Bannières" },
  { key: "settings", label: "Paramètres du site" },
];

export function TranslationSyncCard() {
  const sync = useServerFn(syncTranslations);
  const [scope, setScope] = useState<Scope>("all");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<Report | null>(null);

  const onClick = async () => {
    setRunning(true);
    setReport(null);
    setProgress(8);
    const tick = setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.max(1, Math.round((90 - p) / 12)) : p));
    }, 600);
    try {
      const r = await sync({ data: { scope } });
      setReport(r);
      const total = BUCKETS.reduce((acc, b) => acc + r[b.key].translated, 0);
      const errors = BUCKETS.reduce((acc, b) => acc + r[b.key].errors, 0);
      const pending = BUCKETS.reduce((acc, b) => acc + r[b.key].pending, 0);
      if (errors > 0) {
        toast.warning(`Synchronisation terminée avec ${errors} erreur${errors > 1 ? "s" : ""}`, {
          description: `${total} élément${total > 1 ? "s" : ""} traduit${total > 1 ? "s" : ""}${pending > 0 ? ` · ${pending} en attente` : ""}`,
        });
      } else if (total === 0) {
        toast.success("Tout est déjà à jour", {
          description: "Aucun nouvel élément à traduire",
        });
      } else {
        toast.success("Traductions mises à jour", {
          description: `${total} élément${total > 1 ? "s" : ""} traduit${total > 1 ? "s" : ""}${pending > 0 ? ` · ${pending} en attente — relancez pour finir` : ""}`,
        });
      }
    } catch (e) {
      toast.error("Échec de la synchronisation", {
        description: e instanceof Error ? e.message : "Erreur inconnue",
      });
    } finally {
      clearInterval(tick);
      setProgress(100);
      setRunning(false);
      setTimeout(() => setProgress(0), 1200);
    }
  };

  const totalErrors = report ? BUCKETS.reduce((a, b) => a + report[b.key].errors, 0) : 0;
  const totalPending = report ? BUCKETS.reduce((a, b) => a + report[b.key].pending, 0) : 0;

  return (
    <Card className="border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
            <Languages className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Centre de traduction multilingue</div>
            <div className="text-xs text-muted-foreground">
              FR · EN · AR — détecte automatiquement les nouveaux contenus et corrige ceux non traduits
            </div>
          </div>
          <Button size="sm" onClick={onClick} disabled={running}>
            {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Languages className="mr-1 h-4 w-4" />}
            {running ? "En cours…" : "Synchroniser"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScope(s.id)}
              disabled={running}
              className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                scope === s.id
                  ? "border-violet-500 bg-violet-500 text-white"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {(running || progress > 0) && <Progress value={progress} className="h-2" />}

        {report && (
          <div className="space-y-2 rounded-md border bg-card/50 p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {totalErrors > 0 ? (
                  <><AlertTriangle className="h-4 w-4 text-amber-600" /> Synchronisation terminée avec avertissements</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Synchronisation terminée</>
                )}
              </div>
              <div className="text-muted-foreground">
                Portée : <Badge variant="secondary" className="ml-1">{SCOPES.find((s) => s.id === report.scope)?.label ?? report.scope}</Badge>
              </div>
            </div>

            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">Type</th>
                    <th className="px-2 py-1 text-right font-medium">Traduits</th>
                    <th className="px-2 py-1 text-right font-medium">À jour</th>
                    <th className="px-2 py-1 text-right font-medium">Erreurs</th>
                    <th className="px-2 py-1 text-right font-medium">En attente</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {BUCKETS.map((b) => {
                    const v = report[b.key];
                    return (
                      <tr key={b.key}>
                        <td className="px-2 py-1">{b.label}</td>
                        <td className="px-2 py-1 text-right font-semibold tabular-nums">{v.translated}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{v.skipped}</td>
                        <td className={`px-2 py-1 text-right tabular-nums ${v.errors > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{v.errors}</td>
                        <td className={`px-2 py-1 text-right tabular-nums ${v.pending > 0 ? "font-semibold text-amber-600" : "text-muted-foreground"}`}>{v.pending}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-muted-foreground">
              <span>Durée : {(report.durationMs / 1000).toFixed(1)}s</span>
              {totalPending > 0 && (
                <span className="text-amber-600">Relancez pour traiter les {totalPending} élément{totalPending > 1 ? "s" : ""} restant{totalPending > 1 ? "s" : ""}</span>
              )}
            </div>

            {report.errorSamples.length > 0 && (
              <details className="rounded-md border bg-destructive/5 p-2">
                <summary className="cursor-pointer text-xs font-semibold text-destructive">
                  {report.errorSamples.length} erreur{report.errorSamples.length > 1 ? "s" : ""} (extrait)
                </summary>
                <ul className="mt-1.5 space-y-0.5 pl-2 text-[11px] text-destructive">
                  {report.errorSamples.map((m, i) => <li key={i}>• {m}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
