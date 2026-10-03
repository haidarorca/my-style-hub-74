/** Générateur de règles de sensibilité (admin). 🤖 IA propose · ✋ admin décide · 🛡️ système applique. */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, FlaskConical, Hand, Loader2, Pencil, Play, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  aiAnalyzeScope, applyBuilderRule, getRuleBuilderData, previewBuilderRule, saveBuilderRule, setBuilderRuleStatus,
} from "@/lib/sensitive-rules.functions";

type Draft = {
  id: string | null; name: string; category_id: string | null; scope: "exact" | "branch"; keywords: string[]; exclusions: string[];
  fields: Array<"name" | "designation" | "description" | "variants" | "attributes">; source_lang: string; match_mode: "contains" | "word" | "phrase" | "prefix";
  combine: "any" | "all"; classification: string; protection: "hide" | "blur" | "placeholder"; priority: number;
};
const EMPTY: Draft = { id: null, name: "", category_id: null, scope: "branch", keywords: [], exclusions: [], fields: ["name", "designation"], source_lang: "all", match_mode: "word", combine: "any", classification: "femme", protection: "placeholder", priority: 0 };
const FIELDS: Array<[Draft["fields"][number], string]> = [["name", "Nom"], ["designation", "Désignation"], ["description", "Description"], ["variants", "Variantes"], ["attributes", "Attributs"]];
const LANGS: Array<[string, string]> = [["all", "Toutes les langues"], ["en", "Anglais"], ["zh", "Chinois"], ["fr", "Français"], ["ar", "Arabe"], ["es", "Espagnol"]];
const MODES: Array<[string, string]> = [["word", "Mot exact (pluriels inclus)"], ["contains", "Contient le mot"], ["phrase", "Phrase exacte"], ["prefix", "Commence par"]];
const PROT: Array<[Draft["protection"], string]> = [["placeholder", "Image neutre"], ["hide", "Masquer l'image"], ["blur", "Flouter l'image"]];
const ICON: Record<string, string> = { femme: "🔴", homme: "🔵", normal: "🟢", review: "🟠" };

function toPayload(d: Draft) {
  const { id, ...rest } = d;
  return { ...rest, id, source_lang: d.source_lang === "all" ? null : d.source_lang };
}

function Tags({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [t, setT] = useState("");
  const add = () => {
    const parts = t.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...value, ...parts])]);
    setT("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border p-2">
      {value.map((k) => (
        <span key={k} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
          {k}<button type="button" aria-label={`Retirer ${k}`} onClick={() => onChange(value.filter((x) => x !== k))}><X className="h-3 w-3" /></button>
        </span>
      ))}
      <Input value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        placeholder={placeholder} className="h-7 w-44 border-0 px-1 shadow-none focus-visible:ring-0" />
      <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={add}><Plus className="h-3 w-3" /> Ajouter</Button>
    </div>
  );
}

export function RuleBuilder() {
  const qc = useQueryClient();
  const fetchData = useServerFn(getRuleBuilderData);
  const save = useServerFn(saveBuilderRule);
  const setStatus = useServerFn(setBuilderRuleStatus);
  const preview = useServerFn(previewBuilderRule);
  const apply = useServerFn(applyBuilderRule);
  const analyze = useServerFn(aiAnalyzeScope);
  const { data } = useQuery({ queryKey: ["sensitive-admin", "builder"], queryFn: () => fetchData() });
  const [d, setD] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const [test, setTest] = useState<null | { products: number; images: number; manualProtected: number; examples: any[]; done: boolean }>(null);
  const [ai, setAi] = useState<any>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["sensitive-admin"] }); qc.invalidateQueries({ queryKey: ["sensitive-images"] }); qc.invalidateQueries({ queryKey: ["sensitive-overview"] }); };

  const cats = data?.categories ?? [];
  const chain = useMemo(() => {
    const byId = new Map(cats.map((c) => [c.id, c]));
    const out: string[] = [];
    let cur = d.category_id ? byId.get(d.category_id) : undefined;
    while (cur) { out.unshift(cur.id); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
    return out;
  }, [cats, d.category_id]);
  const levelOptions = (lvl: number) => cats.filter((c) => (lvl === 0 ? !c.parent_id : c.parent_id === chain[lvl - 1])).sort((a, b) => a.name.localeCompare(b.name));
  const pickLevel = (lvl: number, v: string) => setD({ ...d, category_id: v === "none" ? (lvl === 0 ? null : chain[lvl - 1]) : v });
  const classLabel = (k: string) => data?.classifications.find((c) => c.key === k)?.label ?? k;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); } finally { setBusy(null); }
  };
  const doTest = () => run("test", async () => {
    let after: string | null = null; const acc = { products: 0, images: 0, manualProtected: 0, examples: [] as any[], done: false };
    for (let i = 0; i < 80; i++) {
      const r: any = await preview({ data: { rule: toPayload(d), after } });
      acc.products += r.products; acc.images += r.images; acc.manualProtected += r.manualProtected;
      acc.examples = [...acc.examples, ...r.examples].slice(0, 20);
      setTest({ ...acc });
      if (!r.next) { acc.done = true; break; }
      after = r.next;
    }
    setTest({ ...acc });
  });
  const applyAll = async (id: string) => {
    let after: string | null = null; let n = 0;
    for (let i = 0; i < 100; i++) {
      const r: any = await apply({ data: { id, after } });
      n += r.written; if (!r.next) break; after = r.next;
    }
    toast.success(`Règle appliquée : ${n} produit(s) classé(s). Les décisions manuelles n'ont pas été touchées.`);
  };
  const doSave = (status: "active" | "inactive") => run(status, async () => {
    if (status === "active" && !test) throw new Error("Testez la règle avant de l'activer.");
    const r = await save({ data: { rule: toPayload(d), status } });
    if (status === "active") await applyAll(r.id); else toast.success("Règle enregistrée (inactive).");
    setD(EMPTY); setTest(null); refresh();
  });
  const doAi = () => run("ai", async () => {
    const r = await analyze({ data: { rule: toPayload(d), limit: 96 } });
    setAi(r); toast.success("Analyse IA terminée — proposition en attente de votre décision."); refresh();
  });
  const edit = (r: any) => {
    setD({ id: r.id, name: r.name ?? "", category_id: r.category_id, scope: r.scope, keywords: r.keywords ?? [], exclusions: r.exclusions ?? [], fields: r.fields ?? ["name"],
      source_lang: r.source_lang ?? "all", match_mode: r.match_mode, combine: r.combine, classification: r.classification ?? "femme", protection: r.protection, priority: r.priority ?? 0 });
    setTest(null); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const act = (r: any, action: "active" | "inactive" | "rejected" | "delete") => run(r.id, async () => {
    if (action === "delete" && !confirm("Supprimer cette règle ? Les produits concernés seront ré-analysés automatiquement.")) return;
    await setStatus({ data: { id: r.id, action } });
    if (action === "active") await applyAll(r.id); else toast.success("Règle mise à jour.");
    refresh();
  });

  const builderRules = (data?.rules ?? []).filter((r: any) => r.engine === "builder");
  const proposals = builderRules.filter((r: any) => r.status === "proposed");
  const others = builderRules.filter((r: any) => r.status !== "proposed");
  const legacy = (data?.rules ?? []).filter((r: any) => r.engine !== "builder");

  return (
    <div className="space-y-4 pt-3">
      <p className="text-xs text-muted-foreground">🤖 L'IA observe et propose · ✋ vous décidez · 🛡️ le système applique vos règles aux produits actuels et futurs. Ordre de priorité : décision manuelle directe &gt; règle manuelle &gt; règle IA validée &gt; analyse IA &gt; défaut. Les données des produits et les images originales ne sont jamais modifiées.</p>

      <Card>
        <CardHeader><CardTitle className="text-base">{d.id ? "Modifier la règle" : "Nouvelle règle"}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Input placeholder="Nom de la règle (ex. Maillots de bain femme)" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          <div className="grid gap-2 sm:grid-cols-3">
            {["Famille", "Sous-famille", "Sous-sous-famille"].map((l, lvl) => {
              const opts = levelOptions(lvl);
              const disabled = lvl > 0 && !chain[lvl - 1];
              return (
                <label key={l} className="space-y-1"><span className="text-xs text-muted-foreground">{l}</span>
                  <Select value={chain[lvl] ?? "none"} onValueChange={(v) => pickLevel(lvl, v)} disabled={disabled || !opts.length}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-80">
                      <SelectItem value="none">{lvl === 0 ? "Toutes catégories" : "— Tout le niveau au-dessus —"}</SelectItem>
                      {opts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              );
            })}
          </div>
          {d.category_id && (
            <div className="flex flex-wrap gap-4 text-xs">
              {(["exact", "branch"] as const).map((s) => (
                <label key={s} className="flex items-center gap-1.5"><input type="radio" checked={d.scope === s} onChange={() => setD({ ...d, scope: s })} />
                  {s === "exact" ? "Cette catégorie uniquement" : "Cette catégorie + toutes ses sous-catégories"}</label>
              ))}
            </div>
          )}
          <div className="space-y-1"><span className="text-xs text-muted-foreground">Mots déclencheurs (laisser vide = toute la catégorie)</span>
            <Tags value={d.keywords} onChange={(v) => setD({ ...d, keywords: v })} placeholder="bikini, lingerie…" /></div>
          <div className="space-y-1"><span className="text-xs text-muted-foreground">Exclusions (expressions qui annulent un mot)</span>
            <Tags value={d.exclusions} onChange={(v) => setD({ ...d, exclusions: v })} placeholder="string lights…" /></div>
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="text-muted-foreground">Chercher dans :</span>
            {FIELDS.map(([k, l]) => (
              <label key={k} className="flex items-center gap-1.5">
                <Checkbox checked={d.fields.includes(k)} onCheckedChange={(c) => setD({ ...d, fields: c ? [...d.fields, k] : d.fields.filter((f) => f !== k) })} /> {l}
              </label>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Sel label="Langue source" value={d.source_lang} onChange={(v) => setD({ ...d, source_lang: v })} opts={LANGS} />
            <Sel label="Correspondance" value={d.match_mode} onChange={(v) => setD({ ...d, match_mode: v as Draft["match_mode"] })} opts={MODES} />
            <Sel label="Mots requis" value={d.combine} onChange={(v) => setD({ ...d, combine: v as Draft["combine"] })} opts={[["any", "Au moins un des mots"], ["all", "Tous les mots"]]} />
            <Sel label="Classification" value={d.classification} onChange={(v) => setD({ ...d, classification: v })}
              opts={(data?.classifications ?? []).map((c) => [c.key, `${ICON[c.key] ?? "⚪"} ${c.label}`] as [string, string])} />
            <Sel label="Protection" value={d.protection} onChange={(v) => setD({ ...d, protection: v as Draft["protection"] })} opts={PROT} />
            <label className="space-y-1"><span className="text-xs text-muted-foreground">Priorité (0-99)</span>
              <Input type="number" min={0} max={99} value={d.priority} onChange={(e) => setD({ ...d, priority: Math.max(0, Math.min(99, Number(e.target.value) || 0)) })} /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-1" disabled={!!busy} onClick={doTest}>{busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} Tester la règle</Button>
            <Button variant="outline" className="gap-1" disabled={!!busy} onClick={doAi}>{busy === "ai" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />} Analyser avec l'IA</Button>
            <Button variant="secondary" className="gap-1" disabled={!!busy} onClick={() => doSave("inactive")}><Save className="h-4 w-4" /> Enregistrer (inactive)</Button>
            <Button className="gap-1" disabled={!!busy || !test} onClick={() => doSave("active")}>{busy === "active" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Activer et appliquer</Button>
            {d.id && <Button variant="ghost" onClick={() => { setD(EMPTY); setTest(null); }}>Annuler</Button>}
          </div>
          {test && (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="font-semibold">{test.products} produit(s) concerné(s) · {test.images} image(s){test.done ? "" : " (comptage en cours…)"}</p>
              <p className="text-xs text-muted-foreground">Classification appliquée : {ICON[d.classification]} {classLabel(d.classification)}{test.manualProtected ? ` · ${test.manualProtected} produit(s) gardent leur décision manuelle` : ""}</p>
              <Examples items={test.examples.map((e) => ({ ...e, result: d.classification }))} classLabel={classLabel} />
            </div>
          )}
        </CardContent>
      </Card>

      {ai && (
        <Card className="border-primary/40">
          <CardHeader><CardTitle className="text-base">🤖 Analyse terminée</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{ai.analyzed} produit(s) analysé(s) sur {ai.scopeTotal} dans le périmètre · {ai.images} image(s) des produits jugés sensibles</p>
            <p>🔴 {ai.counts.femme} Sensible Femme · 🔵 {ai.counts.homme} Sensible Homme · 🟢 {ai.counts.normal} Normal · 🟠 {ai.counts.review} À vérifier</p>
            {ai.newTerms.length > 0 && <p>Nouveaux termes détectés : {ai.newTerms.join(" · ")}</p>}
            {ai.ambiguous.length > 0 && <p className="text-warning">Termes ambigus : {ai.ambiguous.join(" · ")}</p>}
            <p className="text-xs text-muted-foreground">La proposition apparaît ci-dessous dans « Règles proposées par l'IA ». Rien n'est appliqué tant que vous ne l'acceptez pas.</p>
          </CardContent>
        </Card>
      )}

      {proposals.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">🤖 Règles proposées par l'IA</h3>
          {proposals.map((r: any) => (
            <Card key={r.id} className="border-primary/30"><CardContent className="space-y-2 p-3 text-sm">
              <RuleSummary r={r} classLabel={classLabel} />
              {r.proposal && <p className="text-xs">Analyse : {r.proposal.analyzed} produits · 🔴 {r.proposal.counts?.femme} · 🔵 {r.proposal.counts?.homme} · 🟢 {r.proposal.counts?.normal} · 🟠 {r.proposal.counts?.review}{r.proposal.ambiguous?.length ? ` · ambigus : ${r.proposal.ambiguous.join(", ")}` : ""}</p>}
              {r.proposal?.samples && <details><summary className="cursor-pointer text-xs underline">Voir les produits</summary><Examples items={r.proposal.samples} classLabel={classLabel} /></details>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-1" onClick={() => edit(r)}><Pencil className="h-3 w-3" /> Modifier la règle</Button>
                <Button size="sm" className="gap-1" disabled={busy === r.id} onClick={() => act(r, "active")}>{busy === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Accepter la règle</Button>
                <Button size="sm" variant="ghost" onClick={() => act(r, "rejected")}>Refuser</Button>
              </div>
            </CardContent></Card>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Règles du générateur</h3>
        {others.length === 0 && <p className="text-xs text-muted-foreground">Aucune règle pour l'instant.</p>}
        {others.map((r: any) => (
          <div key={r.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3 text-sm">
            <RuleSummary r={r} classLabel={classLabel} />
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => edit(r)} aria-label="Modifier"><Pencil className="h-3.5 w-3.5" /></Button>
              {r.status === "active"
                ? <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy === r.id} onClick={() => act(r, "inactive")}>Désactiver</Button>
                : <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy === r.id} onClick={() => act(r, "active")}>Activer</Button>}
              <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => act(r, "delete")} aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        ))}
      </section>

      {legacy.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">Règles apprises historiques ({legacy.length})</summary>
          <div className="mt-2 space-y-1">
            {legacy.map((r: any) => (
              <p key={r.id} className="text-xs">{r.origin === "AI" ? "🤖" : "✋"} {r.term === "*" ? "Toute la catégorie" : `« ${r.term} »`} · {r.category} → {r.decision === "sensitive" ? `Sensible ${r.audience}` : r.decision} {r.active ? "" : "(inactive)"}</p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function Sel({ label, value, onChange, opts }: { label: string; value: string; onChange: (v: string) => void; opts: Array<[string, string]> }) {
  return (
    <label className="space-y-1"><span className="text-xs text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{opts.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </label>
  );
}

function RuleSummary({ r, classLabel }: { r: any; classLabel: (k: string) => string }) {
  const st: Record<string, string> = { active: "Active", inactive: "Inactive", proposed: "Proposée", rejected: "Refusée" };
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="font-medium">{r.origin === "AI" ? <Bot className="mr-1 inline h-3.5 w-3.5" /> : <Hand className="mr-1 inline h-3.5 w-3.5" />}{r.name || "Règle sans nom"} <span className="text-xs text-muted-foreground">· {st[r.status]}{r.matched_count != null ? ` · ${r.matched_count} produit(s)` : ""}</span></p>
      <p className="text-xs text-muted-foreground">{r.category}{r.category_id ? (r.scope === "exact" ? " (seule)" : " (+ sous-catégories)") : ""} · langue : {r.source_lang ?? "toutes"} · {ICON[r.classification] ?? ""} {classLabel(r.classification)}</p>
      {r.keywords?.length > 0 && <p className="text-xs">Mots : {r.keywords.join(", ")}{r.exclusions?.length ? ` · exclusions : ${r.exclusions.join(", ")}` : ""}</p>}
    </div>
  );
}

function Examples({ items, classLabel }: { items: any[]; classLabel: (k: string) => string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((e) => (
        <a key={e.id} href={`/product/${e.id}`} target="_blank" rel="noreferrer" className="flex gap-2 rounded border bg-card p-1.5 text-xs hover:border-primary">
          {e.image ? <img src={e.image} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded bg-muted object-contain" /> : <div className="h-14 w-14 shrink-0 rounded bg-muted" />}
          <div className="min-w-0">
            <p className="line-clamp-2 font-medium">{e.name}</p>
            <p className="line-clamp-1 text-[10px] text-muted-foreground">{e.category}</p>
            <p className="text-[10px]">{e.term ? `Mot : « ${e.term} » · ` : ""}{ICON[e.result] ?? ""} {classLabel(e.result)}</p>
          </div>
        </a>
      ))}
    </div>
  );
}
