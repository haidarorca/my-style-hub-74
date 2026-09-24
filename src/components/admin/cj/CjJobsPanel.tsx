import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pause, Play, X, RotateCcw, ChevronDown, ChevronUp, RefreshCw, PackageOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { listCjJobs, getCjJobItems, controlCjJob, pumpCjJob, syncAllCjProducts } from "@/lib/cj-center.functions";

const STATUS_FR: Record<string, string> = {
  pending: "En attente", discovering: "Recherche de produits", running: "En cours", paused: "En pause",
  cancelled: "Annulé", completed: "Terminé", failed: "Échec",
};
const ITEM_FR: Record<string, string> = {
  PENDING: "En attente", PROCESSING: "En cours", SUCCESS: "Importé", ALREADY_EXISTS: "Déjà existant",
  SYNCED: "Synchronisé", FAILED: "Erreur", SKIPPED: "Ignoré (critères)",
};
const PARTS: Array<[string, string]> = [["stock", "Stock"], ["price", "Prix d'achat"], ["images", "Images"], ["variants", "Variantes"], ["data", "Données produit"]];

export function CjJobsPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCjJobs);
  const controlFn = useServerFn(controlCjJob);
  const pumpFn = useServerFn(pumpCjJob);
  const syncAllFn = useServerFn(syncAllCjProducts);
  const [open, setOpen] = useState<string | null>(null);
  const [parts, setParts] = useState<string[]>(["stock", "price"]);
  const [busy, setBusy] = useState<string | null>(null);

  const { data } = useQuery({ queryKey: ["cj-jobs"], queryFn: () => listFn(), refetchInterval: 4000 });
  const jobs: any[] = data?.jobs ?? [];

  // Relais : tant que la page est ouverte, fait avancer les imports en cours
  // si le traitement d'arrière-plan ne démarre pas.
  const activeId = jobs.find((j) => ["pending", "running", "discovering"].includes(j.status))?.id as string | undefined;
  const pumping = useRef(false);
  useEffect(() => {
    if (!activeId) return;
    let stop = false;
    const loop = async () => {
      if (pumping.current) return;
      pumping.current = true;
      try {
        while (!stop) {
          const r: any = await pumpFn({ data: { jobId: activeId } });
          qc.invalidateQueries({ queryKey: ["cj-jobs"] });
          if (!r || r.state === "done" || r.state === "stopped") break;
          if (r.state === "rate_limited" || !r.processed) await new Promise((res) => setTimeout(res, 5000));
        }
      } catch (e) {
        console.error("[cj pump]", e);
      } finally {
        pumping.current = false;
      }
    };
    loop();
    return () => { stop = true; };
  }, [activeId]);

  async function act(jobId: string, action: any) {
    setBusy(jobId + action);
    try {
      if (action === "pump") {
        const r = await pumpFn({ data: { jobId } });
        toast.success(`${r.processed} produit(s) traité(s)`);
      } else {
        await controlFn({ data: { jobId, action } });
      }
      qc.invalidateQueries({ queryKey: ["cj-jobs"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <details className="rounded-md border bg-card">
        <summary className="cursor-pointer list-none p-4 text-sm font-semibold">Synchroniser le catalogue existant</summary>
        <div className="space-y-3 border-t p-4">
          <div className="flex flex-wrap gap-3 text-xs">
            {PARTS.map(([k, l]) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={parts.includes(k)}
                  onChange={(e) => setParts(e.target.checked ? [...parts, k] : parts.filter((p) => p !== k))} />
                {l}
              </label>
            ))}
          </div>
          <Button size="sm" variant="outline" disabled={!parts.length || busy === "syncall"} onClick={async () => {
            setBusy("syncall");
            try { await syncAllFn({ data: { syncParts: parts } }); toast.success("Synchronisation lancée en arrière-plan"); qc.invalidateQueries({ queryKey: ["cj-jobs"] }); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); } finally { setBusy(null); }
          }}>
            <RefreshCw className="mr-2 h-3 w-3" /> Synchroniser tout
          </Button>
          <p className="text-xs text-muted-foreground">Met à jour les données choisies sans recréer les produits ni changer leur publication.</p>
        </div>
      </details>

      {jobs.length === 0 && <div className="grid min-h-56 place-items-center text-center"><div><PackageOpen className="mx-auto mb-3 h-9 w-9 text-muted-foreground" /><p className="font-medium">Aucun import pour l'instant</p><p className="text-sm text-muted-foreground">Les imports lancés depuis Explorer apparaîtront ici.</p></div></div>}
      {jobs.map((j) => {
        const done = j.n_success + j.n_exists + j.n_synced + j.n_failed + j.n_skipped;
        const pct = j.total ? Math.round((done / j.total) * 100) : 0;
        const active = ["pending", "running", "discovering"].includes(j.status);
        return (
          <Card key={j.id}>
            <CardContent className="space-y-2 p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{j.name}</p>
                  <p className="text-xs text-muted-foreground">{new Date(j.created_at).toLocaleString("fr-FR")} · {j.kind === "sync" ? "Synchronisation" : "Import"}{j.target_count ? ` · ${j.target_count} produits` : ""}</p>
                </div>
                <Badge variant={j.status === "completed" ? "secondary" : j.status === "paused" || j.status === "cancelled" ? "outline" : "default"}>
                  {STATUS_FR[j.status] ?? j.status}
                </Badge>
              </div>
              <Progress value={pct} className="h-2" />
              <p className="text-sm font-semibold">{done.toLocaleString("fr-FR")} / {j.total.toLocaleString("fr-FR")} <span className="font-normal text-muted-foreground">({pct} %)</span></p>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <Stat l="Importés" v={j.n_success} />
                <Stat l="Déjà existants" v={j.n_exists} />
                <Stat l="Erreurs" v={j.n_failed} bad />
                <Stat l="En cours / attente" v={j.n_processing + j.n_pending} />
              </div>
              {j.last_error && <p className="text-[11px] text-destructive">Dernière erreur : {j.last_error}</p>}
              <div className="flex flex-wrap gap-2">
                {active && <Button size="sm" variant="outline" onClick={() => act(j.id, "pause")}><Pause className="mr-1 h-3 w-3" />Pause</Button>}
                {j.status === "paused" && <Button size="sm" variant="outline" onClick={() => act(j.id, "resume")}><Play className="mr-1 h-3 w-3" />Reprendre</Button>}
                {(active || j.status === "paused") && <Button size="sm" variant="outline" onClick={() => act(j.id, "cancel")}><X className="mr-1 h-3 w-3" />Annuler</Button>}
                {j.n_failed > 0 && j.status !== "cancelled" && <Button size="sm" variant="outline" onClick={() => act(j.id, "retry_failed")}><RotateCcw className="mr-1 h-3 w-3" />Réessayer les erreurs</Button>}
                <Button size="sm" variant="ghost" onClick={() => setOpen(open === j.id ? null : j.id)}>
                  {open === j.id ? <ChevronUp className="mr-1 h-3 w-3" /> : <ChevronDown className="mr-1 h-3 w-3" />} Voir les détails
                </Button>
              </div>
              {open === j.id && <JobItems jobId={j.id} />}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Stat({ l, v, bad }: { l: string; v: number; bad?: boolean }) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <p className="text-muted-foreground">{l}</p>
      <p className={`font-semibold ${bad && v > 0 ? "text-destructive" : ""}`}>{v}</p>
    </div>
  );
}

function JobItems({ jobId }: { jobId: string }) {
  const itemsFn = useServerFn(getCjJobItems);
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const { data } = useQuery({
    queryKey: ["cj-job-items", jobId, status, page],
    queryFn: () => itemsFn({ data: { jobId, status, page } }),
    refetchInterval: 5000,
  });
  return (
    <div className="space-y-2 border-t pt-2">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {[null, ...Object.keys(ITEM_FR)].map((s) => (
          <Button key={s ?? "all"} size="sm" variant={status === s ? "default" : "outline"} className="h-7 text-[11px]" onClick={() => { setStatus(s); setPage(0); }}>
            {s ? ITEM_FR[s] : "Tous"}
          </Button>
        ))}
      </div>
      {(data?.items ?? []).map((it: any) => (
        <div key={it.id} className="flex gap-2 border-b pb-1.5 text-[11px] last:border-0">
          {it.image ? <img src={it.image} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded object-cover" /> : <div className="h-9 w-9 shrink-0 rounded bg-muted" />}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{it.name ?? it.pid}</p>
            <p className="text-muted-foreground">{ITEM_FR[it.status] ?? it.status}{it.attempts > 1 ? ` · ${it.attempts} essais` : ""}</p>
            {it.error && <p className="text-destructive">{it.error}</p>}
            {Array.isArray(it.missing) && it.missing.length > 0 && <p className="text-warning">Manque : {it.missing.join(" · ")}</p>}
            <details className="mt-1 text-muted-foreground"><summary className="cursor-pointer">Informations techniques</summary><p className="break-all pt-1">PID {it.pid}</p></details>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{data?.count ?? 0} élément(s)</span>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-7" disabled={page === 0} onClick={() => setPage(page - 1)}>Préc.</Button>
          <Button size="sm" variant="outline" className="h-7" disabled={(page + 1) * 50 >= (data?.count ?? 0)} onClick={() => setPage(page + 1)}>Suiv.</Button>
        </div>
      </div>
    </div>
  );
}
