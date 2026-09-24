import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createSensitiveRule, getSensitiveOverview, runSensitiveBatch, setSensitiveManual, toggleSensitiveRule,
} from "@/lib/sensitive.functions";

export const Route = createFileRoute("/admin/sensitive-images")({
  head: () => ({
    meta: [
      { title: "Images sensibles — KawZone admin" },
      { name: "description", content: "Analyse et contrôle des images sensibles du catalogue KawZone." },
      { property: "og:title", content: "Images sensibles — KawZone admin" },
      { property: "og:description", content: "Analyse et contrôle des images sensibles du catalogue KawZone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <PermissionGate perm="categories"><Page /></PermissionGate>,
});

const SRC: Record<string, string> = { RULE: "Règle", AI: "IA", MANUAL: "Manuel" };

function decisionLabel(d: string, a: string | null) {
  if (d === "sensitive") return a === "homme" ? "Masqué pour Femme" : "Masqué pour Homme";
  if (d === "review") return "À vérifier";
  return "Normal";
}

function Page() {
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getSensitiveOverview);
  const runBatch = useServerFn(runSensitiveBatch);
  const setManual = useServerFn(setSensitiveManual);
  const addRule = useServerFn(createSensitiveRule);
  const toggleRule = useServerFn(toggleSensitiveRule);
  const [decision, setDecision] = useState<"all" | "sensitive" | "normal" | "review" | "femme" | "homme">("all");
  const [source, setSource] = useState<"all" | "RULE" | "AI" | "MANUAL">("all");
  const [page, setPage] = useState(0);
  const [running, setRunning] = useState<null | { done: number; ai: number; learned: number }>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["sensitive-overview", decision, source, page],
    queryFn: () => fetchOverview({ data: { decision, source, page } }),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["sensitive-overview"] });
    qc.invalidateQueries({ queryKey: ["sensitive-images"] });
  };

  const analyze = async () => {
    let st = { done: 0, ai: 0, learned: 0 };
    setRunning(st);
    try {
      for (let i = 0; i < 500; i++) {
        const r = await runBatch();
        st = { done: st.done + r.processed, ai: st.ai + r.byAi, learned: st.learned + r.learned };
        setRunning(st);
        if (r.aiError) { toast.error(r.aiError); break; }
        if (r.remaining === 0 || r.processed === 0) break;
      }
      toast.success(`${st.done} produit(s) analysé(s) · ${st.ai} par l'IA · ${st.learned} règle(s) apprise(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setRunning(null);
      refresh();
    }
  };

  const correct = async (productId: string, choice: "femme" | "homme" | "normal") => {
    try { await setManual({ data: { productId, choice } }); toast.success("Décision corrigée."); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  };

  const s = data?.stats;
  const tiles = s ? [
    ["Produits analysés", s.analyzed], ["Produits sensibles", s.sensitive], ["Masqués pour Femme", s.hideF],
    ["Masqués pour Homme", s.hideH], ["Produits normaux", s.normal], ["À vérifier", s.review],
  ] : [];

  return (
    <div className="space-y-4 p-3 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck className="h-5 w-5 text-primary" /> Analyse des images sensibles</h1>
        <Button onClick={analyze} disabled={!!running} className="gap-2">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {running ? `Analyse… ${running.done} traité(s)` : "Analyser les nouveaux produits avec IA"}
        </Button>
      </div>
      {s && <p className="text-sm text-muted-foreground">{s.pending} produit(s) nouveau(x) ou modifié(s) en attente d'analyse. Les produits déjà analysés et inchangés ne sont jamais renvoyés à l'IA.</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([l, v]) => (
          <Card key={l as string}><CardContent className="p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-semibold">{v as number}</p></CardContent></Card>
        ))}
      </div>

      {(data?.suggestions ?? []).map((g) => (
        <Card key={`${g.term}|${g.categoryId}`} className="border-primary/30">
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <span>{g.count} produits similaires ({g.term === "*" ? "toute la catégorie" : `« ${g.term} »`} · {g.category}) ont été corrigés en « {decisionLabel(g.decision, g.audience)} ». Créer une règle pour les prochains produits ?</span>
            <Button size="sm" onClick={async () => { await addRule({ data: { term: g.term, categoryId: g.categoryId, decision: g.decision as "sensitive" | "normal", audience: g.audience } }); toast.success("Règle créée."); refresh(); }}>Créer la règle</Button>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Décisions</CardTitle>
          <div className="flex gap-2">
            <Select value={decision} onValueChange={(v) => { setDecision(v as typeof decision); setPage(0); }}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes décisions</SelectItem>
                <SelectItem value="sensitive">Sensibles</SelectItem>
                <SelectItem value="homme">Masqués pour Femme</SelectItem>
                <SelectItem value="femme">Masqués pour Homme</SelectItem>
                <SelectItem value="review">À vérifier</SelectItem>
                <SelectItem value="normal">Normaux</SelectItem>
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={(v) => { setSource(v as typeof source); setPage(0); }}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes sources</SelectItem>
                <SelectItem value="RULE">Règle</SelectItem>
                <SelectItem value="AI">IA</SelectItem>
                <SelectItem value="MANUAL">Manuel</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
          {(data?.items ?? []).map((it) => (
            <div key={it.productId} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{it.name}</p>
                  <p className="text-xs text-muted-foreground">{it.category || "Sans catégorie"}</p>
                  {it.reason && <p className="mt-1 text-xs">{it.reason}</p>}
                </div>
                <div className="text-right text-xs">
                  <p className="font-semibold">{decisionLabel(it.decision, it.audience)}</p>
                  <p className="text-muted-foreground">{SRC[it.source]}{it.confidence ? ` · ${it.confidence}` : ""}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <Button size="sm" variant={it.decision === "sensitive" && it.audience === "homme" ? "default" : "outline"} onClick={() => correct(it.productId, "homme")}>Sensible pour femme</Button>
                <Button size="sm" variant={it.decision === "sensitive" && it.audience === "femme" ? "default" : "outline"} onClick={() => correct(it.productId, "femme")}>Sensible pour homme</Button>
                <Button size="sm" variant={it.decision === "normal" ? "default" : "outline"} onClick={() => correct(it.productId, "normal")}>Non sensible</Button>
              </div>
            </div>
          ))}
          <div className="flex justify-between pt-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</Button>
            <Button size="sm" variant="outline" disabled={(data?.items.length ?? 0) < 50} onClick={() => setPage(page + 1)}>Suivant</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Règles apprises</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(data?.rules ?? []).length === 0 && <p className="text-muted-foreground">Aucune règle apprise pour l'instant.</p>}
          {(data?.rules ?? []).map((r: any) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
              <span>{r.term === "*" ? "Toute la catégorie" : `« ${r.term} »`} · {r.category} → {decisionLabel(r.decision, r.audience)} <span className="text-xs text-muted-foreground">({SRC[r.origin]}, {r.hits} utilisation(s))</span></span>
              <Button size="sm" variant="outline" onClick={async () => { await toggleRule({ data: { id: r.id, active: !r.active } }); refresh(); }}>{r.active ? "Désactiver" : "Activer"}</Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
