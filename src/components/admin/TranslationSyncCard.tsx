import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { syncTranslations } from "@/lib/sync-translations.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Languages, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type Report = Awaited<ReturnType<typeof syncTranslations>>;

export function TranslationSyncCard() {
  const sync = useServerFn(syncTranslations);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<Report | null>(null);

  const onClick = async () => {
    setRunning(true);
    setReport(null);
    setProgress(8);
    // Smooth fake progress while the batch runs
    const tick = setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.max(1, Math.round((90 - p) / 12)) : p));
    }, 600);
    try {
      const r = await sync();
      setReport(r);
      const total = r.products.translated + r.categories.translated + r.countries.translated + r.shops.translated;
      toast.success("Synchronisation et traductions terminées avec succès", {
        description: `${total} élément${total > 1 ? "s" : ""} traduit${total > 1 ? "s" : ""}`,
      });
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

  return (
    <Card className="border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
            <Languages className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Synchronisation multilingue</div>
            <div className="text-xs text-muted-foreground">
              Traduit automatiquement les nouveaux produits, catégories, pays et boutiques en EN et AR
            </div>
          </div>
          <Button size="sm" onClick={onClick} disabled={running}>
            {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Languages className="mr-1 h-4 w-4" />}
            {running ? "En cours…" : "Synchroniser"}
          </Button>
        </div>

        {(running || progress > 0) && (
          <Progress value={progress} className="h-2" />
        )}

        {report && (
          <div className="space-y-2 rounded-md border bg-card/50 p-3 text-xs">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              Traductions mises à jour avec succès
            </div>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
              <ReportRow label="Produits traduits" value={report.products.translated} />
              <ReportRow label="Produits déjà à jour" value={report.products.skipped} />
              <ReportRow label="Catégories traduites" value={report.categories.translated} />
              <ReportRow label="Catégories déjà à jour" value={report.categories.skipped} />
              <ReportRow label="Pays traduits" value={report.countries.translated} />
              <ReportRow label="Boutiques traduites" value={report.shops.translated} />
              <ReportRow
                label="Erreurs"
                value={report.products.errors + report.categories.errors + report.countries.errors + report.shops.errors}
                muted={false}
              />
              <ReportRow label="Durée" value={`${Math.round(report.durationMs / 100) / 10}s`} />
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReportRow({ label, value, muted = true }: { label: string; value: number | string; muted?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </li>
  );
}
