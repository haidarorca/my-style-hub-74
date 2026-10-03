/**
 * Générateur de règles de sensibilité : CRUD, test (prévisualisation), application, analyse IA.
 * L'IA PROPOSE (statut « proposed ») ; seul l'administrateur active une règle.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./admin-auth.core";
import { matchRule, normText, type BuilderRule } from "./sensitive/rules-engine";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

const RuleInput = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().max(120).default(""),
  category_id: z.string().uuid().nullable(),
  scope: z.enum(["exact", "branch"]).default("branch"),
  keywords: z.array(z.string().min(1).max(80)).max(60).default([]),
  exclusions: z.array(z.string().min(1).max(80)).max(60).default([]),
  fields: z.array(z.enum(["name", "designation", "description", "variants", "attributes"])).min(1).default(["name", "designation"]),
  source_lang: z.string().max(5).nullable().default(null),
  match_mode: z.enum(["contains", "word", "phrase", "prefix"]).default("word"),
  combine: z.enum(["any", "all"]).default("any"),
  classification: z.string().min(1).max(30),
  protection: z.enum(["hide", "blur", "placeholder"]).default("placeholder"),
  priority: z.number().int().min(0).max(99).default(0),
}).refine((r) => r.category_id || r.keywords.length, { message: "Choisissez une catégorie ou au moins un mot." });
type RuleIn = z.infer<typeof RuleInput>;

function toRule(r: RuleIn, origin: "AI" | "MANUAL" = "MANUAL"): BuilderRule {
  return { ...r, id: r.id ?? "draft", source_lang: r.source_lang && r.source_lang !== "all" ? r.source_lang : null, origin, fields: r.fields as BuilderRule["fields"] };
}

export const getRuleBuilderData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const sb = await admin();
    const { loadTree } = await import("./sensitive/rules.server");
    const { rows, tree, label } = await loadTree(sb);
    const [{ data: rules }, { data: classes }] = await Promise.all([
      sb.from("sensitive_image_rules").select("*").order("updated_at", { ascending: false }).limit(500),
      sb.from("sensitive_classifications").select("*").order("position"),
    ]);
    return {
      categories: rows.map((c) => ({ id: c.id, name: c.name, parent_id: c.parent_id, depth: tree.depth(c.id) })),
      classifications: (classes ?? []) as Array<{ key: string; label: string; decision: string; audience: string | null }>,
      rules: ((rules ?? []) as any[]).map((r) => ({ ...r, category: r.category_id ? label(r.category_id) : "Toutes catégories" })),
    };
  });

export const saveBuilderRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ rule: RuleInput, status: z.enum(["active", "inactive"]) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const sb = await admin();
    const r = data.rule;
    const row = {
      engine: "builder", name: r.name || null, category_id: r.category_id, scope: r.scope, keywords: r.keywords, exclusions: r.exclusions,
      fields: r.fields, source_lang: r.source_lang && r.source_lang !== "all" ? r.source_lang : null, match_mode: r.match_mode, combine: r.combine,
      classification: r.classification, protection: r.protection, priority: r.priority, status: data.status,
      // Toute création / modification par l'admin = règle manuelle (✋).
      origin: "MANUAL", decision: r.classification === "normal" ? "normal" : r.classification === "review" ? "review" : "sensitive",
      audience: r.classification === "femme" || r.classification === "homme" ? r.classification : null,
      term: null, updated_at: new Date().toISOString(), created_by: context.userId,
    };
    if (r.id) {
      const { error } = await sb.from("sensitive_image_rules").update(row).eq("id", r.id).eq("engine", "builder");
      if (error) throw new Error(error.message);
      return { id: r.id };
    }
    const { data: ins, error } = await sb.from("sensitive_image_rules").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id as string };
  });

/** Active / désactive / refuse / supprime. Désactiver ou supprimer libère les produits (re-évalués automatiquement). */
export const setBuilderRuleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), action: z.enum(["active", "inactive", "rejected", "delete"]) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const sb = await admin();
    if (data.action !== "active") {
      await sb.from("product_image_sensitivity").delete().eq("rule_id", data.id).neq("source", "MANUAL");
    }
    if (data.action === "delete") await sb.from("sensitive_image_rules").delete().eq("id", data.id);
    else await sb.from("sensitive_image_rules").update({ status: data.action, updated_at: new Date().toISOString() }).eq("id", data.id);
    return { ok: true };
  });

/** Test d'une règle (même non enregistrée) — une page de candidats ; le client enchaîne via `next`. */
export const previewBuilderRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ rule: RuleInput, after: z.string().uuid().nullable() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const sb = await admin();
    const { loadTree, candidatePage } = await import("./sensitive/rules.server");
    const { tree, label } = await loadTree(sb);
    const rule = toRule(data.rule);
    const page = await candidatePage(sb, rule, tree, data.after, 1000);
    let products = 0, images = 0, manualProtected = 0;
    const examples: any[] = [];
    const matchedIds: string[] = [];
    for (const p of page) {
      const m = matchRule(p, rule, tree);
      if (!m.matched) continue;
      products++; images += p.image_count; matchedIds.push(p.id);
      if (examples.length < 20) examples.push({ id: p.id, name: p.name, category: label(p.category_id), term: m.term, image: p.image_url, lang: p.source_lang });
    }
    for (let i = 0; i < matchedIds.length; i += 200) {
      const { count } = await sb.from("product_image_sensitivity").select("product_id", { count: "exact", head: true })
        .eq("source", "MANUAL").in("product_id", matchedIds.slice(i, i + 200));
      manualProtected += count ?? 0;
    }
    return { products, images, manualProtected, examples, scanned: page.length, next: page.length === 1000 ? page[page.length - 1].id : null };
  });

/** Applique une règle active au catalogue existant (page par page). */
export const applyBuilderRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), after: z.string().uuid().nullable() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const sb = await admin();
    const { loadTree, candidatePage, loadActiveRules, writeRuleDecisions } = await import("./sensitive/rules.server");
    const { data: r } = await sb.from("sensitive_image_rules").select("*").eq("id", data.id).single();
    if (!r || r.status !== "active") throw new Error("Activez la règle avant de l'appliquer.");
    if (!data.after) await sb.from("product_image_sensitivity").delete().eq("rule_id", data.id).neq("source", "MANUAL");
    const { tree } = await loadTree(sb);
    const rules = await loadActiveRules(sb);
    // Champs nécessaires à TOUTES les règles actives (pour départager correctement).
    const fields = [...new Set(rules.flatMap((x) => x.fields))] as BuilderRule["fields"];
    const page = await candidatePage(sb, { ...r, fields }, tree, data.after, 1000);
    const hits = page.filter((p) => matchRule(p, r as BuilderRule, tree).matched);
    const written = await writeRuleDecisions(sb, hits, rules, tree);
    const next = page.length === 1000 ? page[page.length - 1].id : null;
    if (!next) {
      const { count } = await sb.from("product_image_sensitivity").select("product_id", { count: "exact", head: true }).eq("rule_id", data.id);
      await sb.from("sensitive_image_rules").update({ matched_count: count ?? 0 }).eq("id", data.id);
    }
    return { written, next };
  });

/** 🤖 Analyse IA d'un périmètre → PROPOSITION de règle (aucune décision écrite sur les produits). */
export const aiAnalyzeScope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ rule: RuleInput, limit: z.number().int().min(12).max(240).default(96) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const sb = await admin();
    const { loadTree, candidatePage } = await import("./sensitive/rules.server");
    const { askAi } = await import("./sensitive.functions");
    const { tree, label } = await loadTree(sb);
    const rule = toRule({ ...data.rule, fields: ["name", "designation", "description", "variants", "attributes"] });
    const all = (await candidatePage(sb, rule, tree, null, 1000)).filter((p) => matchRule(p, rule, tree).matched);
    const sample = all.slice(0, data.limit);
    if (!sample.length) throw new Error("Aucun produit dans ce périmètre.");
    const chunks: (typeof sample)[] = [];
    for (let i = 0; i < sample.length; i += 12) chunks.push(sample.slice(i, i + 12));
    const answers = (await Promise.all(chunks.map((ch) => askAi(sb, ch.map((p) => ({
      id: p.id, category: label(p.category_id), name: p.name ?? "", designation: p.designation ?? "",
      description: normText(p.description).trim().slice(0, 600), variants: (p.variants ?? "").slice(0, 300),
      material: (p.attributes ?? "").slice(0, 200), source_language: p.source_lang ?? "auto",
    })) as any)))).flat();
    const byId = new Map(answers.map((a) => [a.id, a]));
    const counts: Record<string, number> = { femme: 0, homme: 0, normal: 0, review: 0 };
    const sensConcepts = new Map<string, number>(); const normConcepts = new Set<string>();
    let images = 0;
    const samples: any[] = [];
    for (const p of sample) {
      const a = byId.get(p.id);
      const k = !a || a.confidence === "low" ? "review" : !a.sensitive ? "normal" : a.hidden_for === "female" ? "homme" : a.hidden_for === "male" ? "femme" : "review";
      counts[k]++;
      if (k === "femme" || k === "homme") { images += p.image_count; for (const c of a?.detected_concepts ?? []) { const n = normText(c).trim(); if (n) sensConcepts.set(n, (sensConcepts.get(n) ?? 0) + 1); } }
      if (k === "normal") for (const c of a?.detected_concepts ?? []) normConcepts.add(normText(c).trim());
      if (samples.length < 20) samples.push({ id: p.id, name: p.name, category: label(p.category_id), image: p.image_url, result: k, reason: a?.reason ?? "" });
    }
    const known = new Set(data.rule.keywords.map((k) => normText(k).trim()));
    const newTerms = [...sensConcepts.entries()].filter(([t]) => !known.has(t) && !normConcepts.has(t)).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t);
    const ambiguous = [...sensConcepts.keys()].filter((t) => normConcepts.has(t)).slice(0, 10);
    const proposedClass = counts.femme >= counts.homme ? (counts.femme ? "femme" : "review") : "homme";
    const proposal = { analyzed: sample.length, scopeTotal: all.length, images, counts, newTerms, ambiguous, samples, at: new Date().toISOString() };
    const keywords = [...new Set([...data.rule.keywords, ...newTerms.slice(0, 6)])];
    const { data: ins, error } = await sb.from("sensitive_image_rules").insert({
      engine: "builder", origin: "AI", status: "proposed", name: data.rule.name || `Proposition IA — ${label(data.rule.category_id) || keywords.slice(0, 3).join(", ")}`,
      category_id: data.rule.category_id, scope: data.rule.scope, keywords, exclusions: data.rule.exclusions, fields: data.rule.fields,
      source_lang: rule.source_lang, match_mode: data.rule.match_mode, combine: "any", classification: proposedClass, protection: data.rule.protection,
      priority: data.rule.priority, decision: proposedClass === "review" ? "review" : "sensitive", audience: proposedClass === "review" ? null : proposedClass,
      proposal, created_by: context.userId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id as string, ...proposal, proposedClass, keywords };
  });
