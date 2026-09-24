/**
 * Images sensibles — analyse admin (règles locales → IA → apprentissage).
 * Indépendant : ne touche qu'aux tables product_image_sensitivity et
 * sensitive_image_rules.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./admin-auth.core";
import { classifyLocal, findTerms, fromAi, norm, type Gender, type LearnedRule } from "./sensitive/classify";

const MODEL = "openai/gpt-6-astra";
const LEARN_MIN = 3;

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function categoryPaths(sb: any) {
  const { data } = await sb.from("categories").select("id, name, parent_id");
  const byId = new Map<string, any>((data ?? []).map((c: any) => [c.id, c]));
  const cache = new Map<string, string[]>();
  return (id: string | null | undefined): string[] => {
    if (!id) return [];
    if (cache.has(id)) return cache.get(id)!;
    const path: string[] = [];
    let cur = byId.get(id);
    let guard = 0;
    while (cur && guard++ < 10) {
      path.unshift(cur.name);
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    cache.set(id, path);
    return path;
  };
}

type AiItem = { id: string; sensitive: boolean; hidden_for: "male" | "female" | "none"; confidence: "high" | "medium" | "low"; reason: string; detected_concepts: string[] };

export async function askAi(items: Array<{ id: string; category: string; name: string; description: string; material: string }>): Promise<AiItem[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Assistant IA non configuré");
  const prompt = `Tu aides une marketplace à respecter des règles religieuses d'affichage d'images.
Pour chaque produit, décide si ses photos risquent de montrer un corps en sous-vêtement, lingerie ou maillot de bain (image « sensible »).
Règles :
- Base-toi sur le CONTEXTE complet (catégorie + nom + description), jamais sur un mot isolé. « boxer » pour chien, « string lights », short de boxe = NON sensible.
- Un vêtement féminin ou masculin ordinaire (robe, t-shirt, pantalon) n'est PAS sensible.
- Si sensible : hidden_for = genre à qui l'image doit être CACHÉE, c'est-à-dire le genre OPPOSÉ à celui qui porte le produit (sous-vêtement homme → hidden_for "female" ; lingerie femme → hidden_for "male").
- Si le genre du porteur ne peut pas être déterminé, ou si les indices se contredisent : confidence "low". N'invente jamais.
- reason : courte justification en français.
Produits (JSON) :
${JSON.stringify(items)}`;

  const schema = {
    type: "object", additionalProperties: false, required: ["results"],
    properties: {
      results: {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          required: ["id", "sensitive", "hidden_for", "confidence", "reason", "detected_concepts"],
          properties: {
            id: { type: "string" },
            sensitive: { type: "boolean" },
            hidden_for: { type: "string", enum: ["male", "female", "none"] },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            reason: { type: "string" },
            detected_concepts: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  };

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: MODEL,
      input: prompt,
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: "sensitivity", strict: true, schema } },
    }),
  });
  if (!res.ok || !res.body) {
    if (res.status === 402) throw new Error("Crédits IA épuisés. Ajoutez des crédits pour continuer.");
    if (res.status === 429) throw new Error("Limite IA atteinte, réessayez dans un instant.");
    const t = await res.text().catch(() => "");
    throw new Error(`Erreur IA (${res.status}) ${t.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const p = line.slice(5).trim();
      if (!p || p === "[DONE]") continue;
      try {
        const ev = JSON.parse(p);
        if (ev.type === "response.output_text.delta") out += ev.delta ?? "";
        if (ev.type === "error" || ev.type === "response.failed") throw new Error("Erreur IA");
      } catch (e) {
        if (e instanceof Error && e.message === "Erreur IA") throw e;
      }
    }
  }
  try {
    return (JSON.parse(out).results ?? []) as AiItem[];
  } catch {
    return [];
  }
}

/** Apprentissage : ≥3 décisions IA sûres et concordantes (terme + catégorie) → règle. */
async function learnFromAi(sb: any, pairs: Array<{ term: string; categoryId: string }>) {
  let created = 0;
  const seen = new Set<string>();
  for (const { term, categoryId } of pairs) {
    const k = `${term}|${categoryId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const { data } = await sb
      .from("product_image_sensitivity")
      .select("decision, audience, confidence, products!inner(category_id)")
      .eq("source", "AI")
      .eq("matched_term", term)
      .eq("products.category_id", categoryId);
    const rows = (data ?? []) as any[];
    if (rows.length < LEARN_MIN) continue;
    const first = rows[0];
    const consistent = rows.every(
      (r) => r.decision === first.decision && r.audience === first.audience && r.confidence === "high" && r.decision !== "review",
    );
    if (!consistent) continue;
    const { error } = await sb.from("sensitive_image_rules").upsert(
      { term, category_id: categoryId, decision: first.decision, audience: first.audience, origin: "AI", active: true },
      { onConflict: "term,category_id", ignoreDuplicates: true },
    );
    if (!error) created++;
  }
  return created;
}

export const runSensitiveBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const sb = await admin();
    const pathOf = await categoryPaths(sb);
    const { data: ruleRows } = await sb.from("sensitive_image_rules").select("id, term, category_id, decision, audience").eq("active", true);
    const rules = (ruleRows ?? []) as LearnedRule[];

    const { data: pending, error } = await (sb as any).rpc("sensitive_pending_products", { _limit: 40 });
    if (error) throw new Error(error.message);
    const list = (pending ?? []) as Array<{ id: string; name: string; description: string | null; category_id: string | null; material: string | null; input_hash: string }>;

    const rows: any[] = [];
    const toAi: Array<(typeof list)[number] & { term: string | null; concepts: string[] }> = [];
    const ruleHits = new Map<string, number>();
    for (const p of list) {
      const r = classifyLocal({ name: p.name, description: p.description, categoryId: p.category_id, categoryPath: pathOf(p.category_id) }, rules);
      if (r.kind === "final") {
        rows.push({
          product_id: p.id, decision: r.decision, audience: r.audience, source: "RULE", confidence: r.confidence,
          reason: r.reason, concepts: r.concepts, matched_term: r.term, rule_id: r.ruleId ?? null,
          input_hash: p.input_hash, analyzed_at: new Date().toISOString(),
        });
        if (r.ruleId) ruleHits.set(r.ruleId, (ruleHits.get(r.ruleId) ?? 0) + 1);
      } else toAi.push({ ...p, term: r.term, concepts: r.concepts });
    }

    let aiError: string | null = null;
    let aiCount = 0;
    if (toAi.length) {
      const chunks: (typeof toAi)[] = [];
      for (let i = 0; i < toAi.length; i += 12) chunks.push(toAi.slice(i, i + 12));
      try {
        const answers = (
          await Promise.all(
            chunks.map((ch) =>
              askAi(ch.map((p) => ({
                id: p.id,
                category: pathOf(p.category_id).join(" > ") || "(aucune)",
                name: p.name,
                description: norm(p.description).trim().slice(0, 800),
                material: p.material ?? "",
              }))),
            ),
          )
        ).flat();
        const byId = new Map(answers.map((a) => [a.id, a]));
        for (const p of toAi) {
          const a = byId.get(p.id);
          const m = a ? fromAi(a) : { decision: "review" as const, audience: null };
          aiCount++;
          rows.push({
            product_id: p.id, decision: m.decision, audience: m.audience, source: "AI",
            confidence: a?.confidence ?? "low", reason: a?.reason?.slice(0, 300) ?? "Réponse IA absente — à vérifier",
            concepts: a?.detected_concepts?.slice(0, 8) ?? p.concepts, matched_term: p.term, rule_id: null,
            input_hash: p.input_hash, analyzed_at: new Date().toISOString(),
          });
        }
      } catch (e) {
        aiError = e instanceof Error ? e.message : "Erreur IA";
      }
    }

    if (rows.length) {
      const { error: upErr } = await sb.from("product_image_sensitivity").upsert(rows, { onConflict: "product_id" });
      if (upErr) throw new Error(upErr.message);
    }
    for (const [id, n] of ruleHits) {
      const r = await sb.from("sensitive_image_rules").select("hits").eq("id", id).single();
      await sb.from("sensitive_image_rules").update({ hits: ((r.data as any)?.hits ?? 0) + n }).eq("id", id);
    }
    const learned = await learnFromAi(
      sb,
      toAi.filter((p) => p.term && p.category_id).map((p) => ({ term: p.term!, categoryId: p.category_id! })),
    );
    const { data: remaining } = await (sb as any).rpc("sensitive_pending_count");
    return {
      processed: rows.length,
      byRule: rows.length - aiCount,
      byAi: aiCount,
      learned,
      remaining: Number(remaining ?? 0),
      aiError,
    };
  });

export const getSensitiveOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      decision: z.enum(["all", "sensitive", "normal", "review", "femme", "homme"]).default("all"),
      source: z.enum(["all", "RULE", "AI", "MANUAL"]).default("all"),
      page: z.number().int().min(0).default(0),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const sb = await admin();
    const pathOf = await categoryPaths(sb);
    const count = async (f: (q: any) => any) => {
      const { count: n } = await f(sb.from("product_image_sensitivity").select("product_id", { count: "exact", head: true }));
      return n ?? 0;
    };
    const [analyzed, sensitive, hideF, hideH, normal, review, pendingRes] = await Promise.all([
      count((q) => q),
      count((q) => q.eq("decision", "sensitive")),
      count((q) => q.eq("decision", "sensitive").eq("audience", "homme")),
      count((q) => q.eq("decision", "sensitive").eq("audience", "femme")),
      count((q) => q.eq("decision", "normal")),
      count((q) => q.eq("decision", "review")),
      (sb as any).rpc("sensitive_pending_count"),
    ]);

    let q: any = sb
      .from("product_image_sensitivity")
      .select("product_id, decision, audience, source, confidence, reason, matched_term, analyzed_at, products!inner(name, category_id)")
      .order("analyzed_at", { ascending: false })
      .range(data.page * 50, data.page * 50 + 49);
    if (data.decision === "femme" || data.decision === "homme") q = q.eq("decision", "sensitive").eq("audience", data.decision);
    else if (data.decision !== "all") q = q.eq("decision", data.decision);
    if (data.source !== "all") q = q.eq("source", data.source);
    const { data: items } = await q;

    // Suggestions : corrections manuelles concordantes → proposer une règle
    const { data: manual } = await sb
      .from("product_image_sensitivity")
      .select("decision, audience, matched_term, products!inner(category_id)")
      .eq("source", "MANUAL")
      .neq("decision", "review")
      .limit(2000);
    const { data: existing } = await sb.from("sensitive_image_rules").select("term, category_id");
    const exists = new Set((existing ?? []).map((r: any) => `${r.term}|${r.category_id}`));
    const groups = new Map<string, { term: string; categoryId: string; decision: string; audience: Gender | null; count: number; conflict: boolean }>();
    for (const m of (manual ?? []) as any[]) {
      const cat = m.products?.category_id;
      if (!cat) continue;
      const term = m.matched_term || "*";
      const k = `${term}|${cat}`;
      const g = groups.get(k);
      if (!g) groups.set(k, { term, categoryId: cat, decision: m.decision, audience: m.audience, count: 1, conflict: false });
      else {
        g.count++;
        if (g.decision !== m.decision || g.audience !== m.audience) g.conflict = true;
      }
    }
    const suggestions = [...groups.values()]
      .filter((g) => g.count >= LEARN_MIN && !g.conflict && !exists.has(`${g.term}|${g.categoryId}`))
      .map((g) => ({ ...g, category: pathOf(g.categoryId).join(" > ") }));

    const { data: ruleList } = await sb
      .from("sensitive_image_rules")
      .select("id, term, category_id, decision, audience, origin, hits, active")
      .order("created_at", { ascending: false })
      .limit(200);

    return {
      stats: { analyzed, sensitive, hideF, hideH, normal, review, pending: Number(pendingRes.data ?? 0) },
      items: ((items ?? []) as any[]).map((r) => ({
        productId: r.product_id,
        name: r.products?.name ?? "",
        category: pathOf(r.products?.category_id).join(" > "),
        decision: r.decision as "sensitive" | "normal" | "review",
        audience: r.audience as Gender | null,
        source: r.source as "RULE" | "AI" | "MANUAL",
        confidence: r.confidence as string | null,
        reason: r.reason as string | null,
      })),
      suggestions,
      rules: ((ruleList ?? []) as any[]).map((r) => ({ ...r, category: pathOf(r.category_id).join(" > ") })),
    };
  });

export const setSensitiveManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ productId: z.string().uuid(), choice: z.enum(["femme", "homme", "normal"]) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const sb = await admin();
    const { data: p } = await sb.from("products").select("id, name, description, category_id").eq("id", data.productId).single();
    if (!p) throw new Error("Produit introuvable");
    const { data: h } = await sb.from("product_image_sensitivity").select("matched_term").eq("product_id", p.id).maybeSingle();
    const term = (h as any)?.matched_term ?? findTerms(norm(p.name)).terms[0] ?? null;
    // Empreinte identique à la fonction SQL (md5 nom|description|catégorie)
    const { createHash } = await import("crypto");
    const input_hash = createHash("md5")
      .update(`${p.name ?? ""}|${p.description ?? ""}|${p.category_id ?? ""}`)
      .digest("hex");
    const row = {
      product_id: p.id,
      decision: data.choice === "normal" ? "normal" : "sensitive",
      audience: data.choice === "normal" ? null : data.choice,
      source: "MANUAL",
      confidence: "high",
      reason: "Correction administrateur",
      matched_term: term,
      rule_id: null,
      input_hash,
      analyzed_at: new Date().toISOString(),
    };
    const { error } = await sb.from("product_image_sensitivity").upsert(row, { onConflict: "product_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createSensitiveRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      term: z.string().min(1).max(60),
      categoryId: z.string().uuid(),
      decision: z.enum(["sensitive", "normal"]),
      audience: z.enum(["femme", "homme"]).nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const sb = await admin();
    const { error } = await sb.from("sensitive_image_rules").upsert(
      { term: data.term, category_id: data.categoryId, decision: data.decision, audience: data.audience, origin: "MANUAL", active: true },
      { onConflict: "term,category_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleSensitiveRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const sb = await admin();
    await sb.from("sensitive_image_rules").update({ active: data.active }).eq("id", data.id);
    return { ok: true };
  });
