import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Sparkles, Play, RotateCcw, FlaskConical, Save, RefreshCw } from "lucide-react";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createSensitiveRule, getSensitiveOverview, runSensitiveBatch, setSensitiveManual, toggleSensitiveRule,
} from "@/lib/sensitive.functions";
import {
  getVisionDashboard, listSensitiveImages, requeueVision, restorePrompt, runVisionNow, savePrompt, setImageManual,
  testTextPrompt, testVisionPrompt, updateVisionSettings,
} from "@/lib/sensitive-vision.functions";
import { ClassifyMenu, SOURCE_LABEL, STATUS_LABEL, StatusPill, statusOf } from "@/components/admin/sensitive/SensitiveControls";

export const Route = createFileRoute("/admin/sensitive-images")({
  head: () => ({
    meta: [
      { title: "Images sensibles — KawZone admin" },
      { name: "description", content: "Contrôle image par image des images sensibles du catalogue KawZone." },
      { property: "og:title", content: "Images sensibles — KawZone admin" },
      { property: "og:description", content: "Contrôle image par image des images sensibles du catalogue KawZone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <PermissionGate perm="categories"><Page /></PermissionGate>,
});

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["sensitive-overview"] });
    qc.invalidateQueries({ queryKey: ["sensitive-images"] });
    qc.invalidateQueries({ queryKey: ["sensitive-admin"] });
  };
}

function Page() {
  return (
    <div className="space-y-4 p-3 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck className="h-5 w-5 text-primary" /> Catalogue → Images sensibles</h1>
        <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">OPENAI DIRECT · votre compte OpenAI</span>
      </div>
      <Tabs defaultValue="images">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="images">Images</TabsTrigger>
          <TabsTrigger value="products">Produits</TabsTrigger>
          <TabsTrigger value="openai">OpenAI & statistiques</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
          <TabsTrigger value="rules">Règles</TabsTrigger>
        </TabsList>
        <TabsContent value="images"><ImagesTab /></TabsContent>
        <TabsContent value="products"><ProductsTab /></TabsContent>
        <TabsContent value="openai"><OpenAiTab /></TabsContent>
        <TabsContent value="prompts"><PromptsTab /></TabsContent>
        <TabsContent value="rules"><RulesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Images ---------------- */
function ImagesTab() {
  const list = useServerFn(listSensitiveImages);
  const setImg = useServerFn(setImageManual);
  const requeue = useServerFn(requeueVision);
  const refresh = useRefresh();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "normal" | "homme" | "femme" | "review">("all");
  const [source, setSource] = useState<"all" | "MANUAL" | "RULE_VALIDATED" | "VISION" | "AI" | "RULE" | "NONE">("all");
  const [vision, setVision] = useState<"all" | "PENDING" | "PROCESSING" | "COMPLETED" | "ERROR" | "SKIPPED">("all");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => { setQ(search); setPage(0); }, 350); return () => clearTimeout(t); }, [search]);
  const { data, isLoading } = useQuery({
    queryKey: ["sensitive-admin", "images", q, categoryId, status, source, vision, page],
    queryFn: () => list({ data: { search: q, categoryId: categoryId === "all" ? null : categoryId, status, source, vision, page } }),
  });
  const act = async (id: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(id);
    try { await fn(); toast.success(msg); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); } finally { setBusy(null); }
  };
  return (
    <div className="space-y-3 pt-3">
      <p className="text-xs text-muted-foreground">Les administrateurs voient toujours les images complètes, même celles masquées pour les clients.</p>
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Rechercher un produit…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
        <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setPage(0); }}>
          <SelectTrigger className="w-60"><SelectValue placeholder="Catégorie" /></SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value="all">Toutes catégories</SelectItem>
            {(data?.categories ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(v as typeof status); setPage(0); }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="normal">Non sensible</SelectItem>
            <SelectItem value="homme">Sensible — Homme</SelectItem>
            <SelectItem value="femme">Sensible — Femme</SelectItem>
            <SelectItem value="review">À vérifier</SelectItem>
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={(v) => { setSource(v as typeof source); setPage(0); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes sources</SelectItem>
            {Object.entries(SOURCE_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={vision} onValueChange={(v) => { setVision(v as typeof vision); setPage(0); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">File Vision : tout</SelectItem>
            {["PENDING", "PROCESSING", "COMPLETED", "ERROR", "SKIPPED"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
      {data && <p className="text-xs text-muted-foreground">{data.total} image(s)</p>}
      {data && data.items.length === 0 && <p className="text-sm text-muted-foreground">Aucune image pour ces filtres. Les images apparaissent ici après analyse d'un produit potentiellement sensible, ou dès qu'un administrateur ouvre sa fiche.</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {(data?.items ?? []).map((im: any) => {
          const st = statusOf(im.final_decision, im.final_audience);
          return (
            <Card key={im.id} className="overflow-hidden">
              <a href={`/product/${im.product_id}`} target="_blank" rel="noreferrer">
                <img src={im.image_url} alt={im.productName} loading="lazy" className="aspect-square w-full bg-muted object-contain" />
              </a>
              <CardContent className="space-y-1 p-2 text-xs">
                <p className="line-clamp-2 font-medium">{im.productName}</p>
                <p className="line-clamp-1 text-[10px] text-muted-foreground">{im.category || "Sans catégorie"}</p>
                <StatusPill status={st} />
                <p className="text-[10px]">Source : <b>{SOURCE_LABEL[im.final_source] ?? im.final_source}</b></p>
                <p className="text-[10px] text-muted-foreground">
                  Vision : {im.vision_status}
                  {im.vision_decision ? ` → ${STATUS_LABEL[statusOf(im.vision_decision, im.vision_audience)]} (${im.vision_confidence})` : ""}
                  {im.vision_cached ? " · cache" : ""}{im.vision_prompt_version ? ` · prompt v${im.vision_prompt_version}` : ""}
                </p>
                {im.vision_reason && <p className="line-clamp-2 text-[10px]">{im.vision_reason}</p>}
                {im.manual_decision && <p className="text-[10px] text-primary">Décision manuelle : {STATUS_LABEL[statusOf(im.manual_decision, im.manual_audience)]}</p>}
                {im.last_error && <p className="text-[10px] text-destructive">{im.last_error}</p>}
                <div className="flex flex-wrap gap-1 pt-1">
                  <ClassifyMenu current={st} busy={busy === im.id} allowAuto={!!im.manual_decision}
                    onChoose={(c) => act(im.id, () => setImg({ data: { id: im.id, choice: c } }), c === "auto" ? "Décision manuelle retirée." : `${STATUS_LABEL[c]} (Manuel)`)} />
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy === `v${im.id}`}
                    onClick={() => act(`v${im.id}`, () => requeue({ data: { imageId: im.id } }), "Ajoutée à la file Vision.")}>
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="flex justify-between">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</Button>
        <Button size="sm" variant="outline" disabled={(data?.items.length ?? 0) < 48} onClick={() => setPage(page + 1)}>Suivant</Button>
      </div>
    </div>
  );
}

/* ---------------- Produits (analyse texte) ---------------- */
function ProductsTab() {
  const refresh = useRefresh();
  const fetchOverview = useServerFn(getSensitiveOverview);
  const runBatch = useServerFn(runSensitiveBatch);
  const setManual = useServerFn(setSensitiveManual);
  const addRule = useServerFn(createSensitiveRule);
  const [decision, setDecision] = useState<"all" | "sensitive" | "normal" | "review" | "femme" | "homme">("all");
  const [source, setSource] = useState<"all" | "RULE" | "AI" | "MANUAL">("all");
  const [page, setPage] = useState(0);
  const [running, setRunning] = useState<null | { done: number; ai: number; learned: number; vision: number }>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["sensitive-overview", decision, source, page],
    queryFn: () => fetchOverview({ data: { decision, source, page } }),
  });
  const analyze = async () => {
    let st = { done: 0, ai: 0, learned: 0, vision: 0 };
    setRunning(st);
    try {
      for (let i = 0; i < 500; i++) {
        const r = await runBatch();
        st = { done: st.done + r.processed, ai: st.ai + r.byAi, learned: st.learned + r.learned, vision: st.vision + (r.queuedForVision ?? 0) };
        setRunning(st);
        if (r.aiError) { toast.error(r.aiError); break; }
        if (r.remaining === 0 || r.processed === 0) break;
      }
      toast.success(`${st.done} produit(s) · ${st.ai} par OpenAI texte · ${st.vision} image(s) en file Vision · ${st.learned} règle(s)`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setRunning(null); refresh(); }
  };
  const correct = async (productId: string, choice: "femme" | "homme" | "normal" | "review" | "auto") => {
    try { await setManual({ data: { productId, choice } }); toast.success("Décision enregistrée (Manuel)."); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  };
  const s = data?.stats;
  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {s && <p className="text-sm text-muted-foreground">{s.pending} produit(s) nouveau(x) ou modifié(s) en attente. Seuls les produits potentiellement sensibles partent vers Vision.</p>}
        <Button onClick={analyze} disabled={!!running} className="gap-2">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {running ? `Analyse… ${running.done}` : "Analyser les nouveaux produits"}
        </Button>
      </div>
      {s && (
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
          {[["Analysés", s.analyzed], ["Sensibles", s.sensitive], ["Sensible — Homme", s.hideF], ["Sensible — Femme", s.hideH], ["Normaux", s.normal], ["À vérifier", s.review]].map(([l, v]) => (
            <Card key={l as string}><CardContent className="p-3"><p className="text-[11px] text-muted-foreground">{l}</p><p className="text-xl font-semibold">{v as number}</p></CardContent></Card>
          ))}
        </div>
      )}
      {(data?.suggestions ?? []).map((g) => (
        <Card key={`${g.term}|${g.categoryId}`} className="border-primary/30">
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <span>{g.count} produits ({g.term === "*" ? "toute la catégorie" : `« ${g.term} »`} · {g.category}) corrigés en « {STATUS_LABEL[statusOf(g.decision, g.audience)]} ». Créer une règle ?</span>
            <Button size="sm" onClick={async () => { await addRule({ data: { term: g.term, categoryId: g.categoryId, decision: g.decision as "sensitive" | "normal", audience: g.audience } }); toast.success("Règle créée."); refresh(); }}>Créer la règle</Button>
          </CardContent>
        </Card>
      ))}
      <div className="flex gap-2">
        <Select value={decision} onValueChange={(v) => { setDecision(v as typeof decision); setPage(0); }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes décisions</SelectItem>
            <SelectItem value="sensitive">Sensibles</SelectItem>
            <SelectItem value="homme">Sensible — Homme</SelectItem>
            <SelectItem value="femme">Sensible — Femme</SelectItem>
            <SelectItem value="review">À vérifier</SelectItem>
            <SelectItem value="normal">Non sensibles</SelectItem>
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={(v) => { setSource(v as typeof source); setPage(0); }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes sources</SelectItem>
            <SelectItem value="RULE">Règle</SelectItem>
            <SelectItem value="AI">IA texte</SelectItem>
            <SelectItem value="MANUAL">Manuel</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
      {(data?.items ?? []).map((it) => {
        const st = statusOf(it.decision, it.audience);
        return (
          <div key={it.productId} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3 text-sm">
            <div className="min-w-0">
              <a className="font-medium hover:underline" href={`/product/${it.productId}`} target="_blank" rel="noreferrer">{it.name}</a>
              <p className="text-xs text-muted-foreground">{it.category || "Sans catégorie"}</p>
              {it.reason && <p className="mt-1 text-xs">{it.reason}</p>}
            </div>
            <div className="flex flex-col items-end gap-1 text-xs">
              <StatusPill status={st} />
              <span className="text-muted-foreground">{it.source === "AI" ? "IA texte" : it.source === "MANUAL" ? "Manuel" : "Règle"}{it.confidence ? ` · ${it.confidence}` : ""}</span>
              <ClassifyMenu current={st} allowAuto={it.source === "MANUAL"} onChoose={(c) => correct(it.productId, c)} />
            </div>
          </div>
        );
      })}
      <div className="flex justify-between">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</Button>
        <Button size="sm" variant="outline" disabled={(data?.items.length ?? 0) < 50} onClick={() => setPage(page + 1)}>Suivant</Button>
      </div>
    </div>
  );
}

/* ---------------- OpenAI & stats ---------------- */
function OpenAiTab() {
  const dash = useServerFn(getVisionDashboard);
  const save = useServerFn(updateVisionSettings);
  const runNow = useServerFn(runVisionNow);
  const refresh = useRefresh();
  const { data, isLoading } = useQuery({ queryKey: ["sensitive-admin", "dashboard"], queryFn: () => dash(), refetchInterval: 30_000 });
  const [form, setForm] = useState<null | { vision_hourly_limit: number; text_model: string; vision_model: string; vision_enabled: boolean }>(null);
  const [running, setRunning] = useState(false);
  useEffect(() => { if (data?.settings && !form) setForm({ vision_hourly_limit: data.settings.vision_hourly_limit, text_model: data.settings.text_model, vision_model: data.settings.vision_model, vision_enabled: data.settings.vision_enabled }); }, [data, form]);
  if (isLoading || !data) return <Loader2 className="mt-3 h-5 w-5 animate-spin" />;
  const s = data.stats;
  const tiles: Array<[string, number]> = [
    ["Produits analysés", s.productsAnalyzed], ["Images analysées (Vision)", s.imagesAnalyzed], ["Appels OpenAI", s.apiCalls],
    ["Appels évités (cache)", s.cached], ["Erreurs", s.callErrors], ["429 reçus", s.rateLimited], ["Retries", s.retries],
    ["Images en attente", s.pending + s.processing], ["Images en erreur", s.errors], ["Images normales", s.normal],
    ["Sensibles — Homme", s.homme], ["Sensibles — Femme", s.femme], ["À vérifier", s.review], ["Appels Vision (1 h)", s.lastHour],
  ];
  const paused = data.settings?.paused_reason || (data.settings?.paused_until && new Date(data.settings.paused_until) > new Date());
  return (
    <div className="space-y-3 pt-3">
      <Card className="border-primary/40">
        <CardContent className="space-y-1 p-3 text-sm">
          <p className="font-semibold">Fournisseur : OPENAI DIRECT</p>
          <p className="text-xs text-muted-foreground">Point d'accès : {data.endpoint} — facturé sur votre compte OpenAI, aucun crédit IA Lovable.</p>
          <p className="text-xs">Clé OpenAI (serveur) : {data.keyConfigured ? <b className="text-success">configurée</b> : <b className="text-destructive">manquante</b>} — jamais affichée.</p>
          {paused && <p className="text-xs text-destructive">En pause : {data.settings?.paused_reason ?? `jusqu'à ${new Date(data.settings!.paused_until!).toLocaleTimeString()} (limite 429)`}</p>}
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {tiles.map(([l, v]) => <Card key={l}><CardContent className="p-3"><p className="text-[11px] text-muted-foreground">{l}</p><p className="text-xl font-semibold">{v}</p></CardContent></Card>)}
      </div>
      {form && (
        <Card>
          <CardHeader><CardTitle className="text-base">Réglages Vision</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span>Limite :</span>
              {[5, 10, 30, 100].map((n) => (
                <Button key={n} size="sm" variant={form.vision_hourly_limit === n ? "default" : "outline"} onClick={() => setForm({ ...form, vision_hourly_limit: n })}>{n} images/heure</Button>
              ))}
              <Input type="number" min={1} max={1000} className="w-24" value={form.vision_hourly_limit} onChange={(e) => setForm({ ...form, vision_hourly_limit: Math.max(1, Number(e.target.value) || 1) })} />
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="space-y-1"><span className="text-xs text-muted-foreground">Modèle texte</span><Input value={form.text_model} onChange={(e) => setForm({ ...form, text_model: e.target.value.trim() })} /></label>
              <label className="space-y-1"><span className="text-xs text-muted-foreground">Modèle Vision</span><Input value={form.vision_model} onChange={(e) => setForm({ ...form, vision_model: e.target.value.trim() })} /></label>
              <label className="flex items-center gap-2 pt-5"><Switch checked={form.vision_enabled} onCheckedChange={(v) => setForm({ ...form, vision_enabled: v })} /> Vision activée</label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="gap-1" onClick={async () => { try { await save({ data: { ...form, resume: false } }); toast.success("Réglages enregistrés."); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); } }}><Save className="h-4 w-4" /> Enregistrer</Button>
              {paused && <Button variant="outline" onClick={async () => { await save({ data: { ...form, resume: true } }); toast.success("File relancée."); refresh(); }}>Reprendre après pause</Button>}
              <Button variant="outline" className="gap-1" disabled={running} onClick={async () => {
                setRunning(true);
                try { const r = await runNow(); toast.success(`${r.processed} traitée(s) · ${r.apiCalls} appel(s) · ${r.cached} depuis le cache${r.stopped ? ` · ${r.stopped}` : ""}`); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
                finally { setRunning(false); refresh(); }
              }}>{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Traiter la file maintenant</Button>
            </div>
            <p className="text-xs text-muted-foreground">La file continue seule en arrière-plan (toutes les 5 minutes), même site fermé, dans la limite horaire. Une erreur 429 met la file en pause au lieu de réessayer en boucle.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ---------------- Prompts ---------------- */
function PromptsTab() {
  const dash = useServerFn(getVisionDashboard);
  const { data } = useQuery({ queryKey: ["sensitive-admin", "dashboard"], queryFn: () => dash() });
  if (!data) return <Loader2 className="mt-3 h-5 w-5 animate-spin" />;
  return (
    <div className="grid gap-3 pt-3 lg:grid-cols-2">
      <PromptEditor kind="text" title="Prompt OpenAI — Analyse des nouveaux produits (texte seul)" prompts={data.prompts.filter((p: any) => p.kind === "text")} />
      <PromptEditor kind="vision" title="Prompt OpenAI Vision — Vérification des images sensibles" prompts={data.prompts.filter((p: any) => p.kind === "vision")} />
    </div>
  );
}

function PromptEditor({ kind, title, prompts }: { kind: "text" | "vision"; title: string; prompts: any[] }) {
  const active = prompts.find((p) => p.is_active);
  const [content, setContent] = useState<string>(active?.content ?? "");
  const [note, setNote] = useState("");
  const [t1, setT1] = useState(kind === "text" ? "Boxer homme coton" : "");
  const [t2, setT2] = useState(kind === "text" ? "Vêtements > Sous-vêtements > Homme" : "");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useRefresh();
  const save = useServerFn(savePrompt);
  const restore = useServerFn(restorePrompt);
  const testT = useServerFn(testTextPrompt);
  const testV = useServerFn(testVisionPrompt);
  useEffect(() => { setContent(active?.content ?? ""); }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const test = async () => {
    setBusy(true); setResult(null);
    try {
      setResult(kind === "text"
        ? await testT({ data: { content, name: t1, category: t2, description: "" } })
        : await testV({ data: { content, imageUrl: t1, context: t2 } }));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); } finally { setBusy(false); refresh(); }
  };
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle><p className="text-xs text-muted-foreground">Version active : v{active?.version ?? "—"}</p></CardHeader>
      <CardContent className="space-y-2">
        <Textarea rows={12} value={content} onChange={(e) => setContent(e.target.value)} className="font-mono text-xs" />
        <Input placeholder="Note de version (optionnel)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button size="sm" className="gap-1" disabled={content === active?.content || content.length < 20} onClick={async () => {
          try { const r = await save({ data: { kind, content, note } }); toast.success(`Version v${r.version} enregistrée et active.`); setNote(""); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
        }}><Save className="h-3.5 w-3.5" /> Enregistrer comme nouvelle version</Button>
        <div className="space-y-1 rounded-lg border p-2">
          <p className="text-xs font-semibold">Tester (prompt de l'éditeur, non enregistré)</p>
          <Input placeholder={kind === "text" ? "Nom du produit" : "URL de l'image"} value={t1} onChange={(e) => setT1(e.target.value)} />
          <Input placeholder={kind === "text" ? "Catégorie" : "Contexte (nom produit, catégorie)"} value={t2} onChange={(e) => setT2(e.target.value)} />
          <Button size="sm" variant="outline" className="gap-1" disabled={busy || !t1} onClick={test}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />} Tester</Button>
          {result && <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-[11px]">{JSON.stringify(result, null, 2)}</pre>}
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold">Versions</p>
          {prompts.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs">
              <span>v{p.version} · {new Date(p.created_at).toLocaleString()} {p.note ? `· ${p.note}` : ""} {p.is_active && <b className="text-primary">(active)</b>}</span>
              {!p.is_active && <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs" onClick={async () => { await restore({ data: { id: p.id } }); toast.success(`v${p.version} restaurée.`); refresh(); }}><RotateCcw className="h-3 w-3" /> Restaurer</Button>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Règles ---------------- */
function RulesTab() {
  const fetchOverview = useServerFn(getSensitiveOverview);
  const toggleRule = useServerFn(toggleSensitiveRule);
  const refresh = useRefresh();
  const { data } = useQuery({ queryKey: ["sensitive-overview", "all", "all", 0], queryFn: () => fetchOverview({ data: { decision: "all", source: "all", page: 0 } }) });
  return (
    <div className="space-y-2 pt-3 text-sm">
      {(data?.rules ?? []).length === 0 && <p className="text-muted-foreground">Aucune règle apprise pour l'instant.</p>}
      {(data?.rules ?? []).map((r: any) => (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
          <span>{r.term === "*" ? "Toute la catégorie" : `« ${r.term} »`} · {r.category} → {STATUS_LABEL[statusOf(r.decision, r.audience)]} <span className="text-xs text-muted-foreground">({r.origin === "AI" ? "IA" : "Manuel"}, {r.hits} utilisation(s))</span></span>
          <Button size="sm" variant="outline" onClick={async () => { await toggleRule({ data: { id: r.id, active: !r.active } }); refresh(); }}>{r.active ? "Désactiver" : "Activer"}</Button>
        </div>
      ))}
    </div>
  );
}
