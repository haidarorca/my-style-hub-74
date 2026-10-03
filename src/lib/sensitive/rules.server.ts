/** Accès serveur du générateur de règles (service role, après contrôle admin). */
import { buildCategoryTree, classToDecision, pickWinner, sqlPatterns, type BuilderRule, type RuleProduct } from "./rules-engine";

export async function loadTree(sb: any) {
  const { data } = await sb.from("categories").select("id, name, parent_id");
  const rows = (data ?? []) as Array<{ id: string; name: string; parent_id: string | null }>;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const tree = buildCategoryTree(rows);
  const label = (id: string | null | undefined) => tree.ancestors(id).reverse().map((i) => byId.get(i)?.name ?? "?").join(" > ");
  return { rows, tree, label };
}

export async function loadActiveRules(sb: any): Promise<BuilderRule[]> {
  const { data } = await sb.from("sensitive_image_rules").select("*").eq("engine", "builder").eq("status", "active");
  return (data ?? []) as BuilderRule[];
}

/** Une page de produits candidats (présélection SQL), triés par id. */
export async function candidatePage(sb: any, rule: Pick<BuilderRule, "category_id" | "scope" | "keywords" | "fields">, tree: ReturnType<typeof buildCategoryTree>, after: string | null, limit = 1000) {
  const catIds = rule.category_id ? (rule.scope === "exact" ? [rule.category_id] : tree.descendants(rule.category_id)) : null;
  const { data, error } = await sb.rpc("sensitive_rule_candidates", {
    _cat_ids: catIds, _patterns: sqlPatterns(rule.keywords), _fields: rule.fields.length ? rule.fields : ["name", "designation"],
    _after: after, _limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<RuleProduct & { image_url: string | null; image_count: number }>;
}

/** Écrit la décision gagnante des règles pour des produits (jamais sur une décision MANUELLE). */
export async function writeRuleDecisions(sb: any, products: RuleProduct[], rules: BuilderRule[], tree: ReturnType<typeof buildCategoryTree>) {
  if (!products.length) return 0;
  const ids = products.map((p) => p.id);
  const manual = new Set<string>();
  const base = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200);
    const { data: m } = await sb.from("product_image_sensitivity").select("product_id").eq("source", "MANUAL").in("product_id", part);
    for (const r of m ?? []) manual.add(r.product_id);
    const { data: ps } = await sb.from("products").select("id, name, description, category_id").in("id", part);
    for (const p of ps ?? []) base.set(p.id, p);
  }
  const { createHash } = await import("crypto");
  const rows: any[] = [];
  for (const p of products) {
    if (manual.has(p.id)) continue;
    const w = pickWinner(p, rules, tree);
    if (!w) continue;
    const b = base.get(p.id) ?? p;
    const d = classToDecision(w.rule.classification);
    rows.push({
      product_id: p.id, decision: d.decision, audience: d.audience, source: "RULE", confidence: "high",
      reason: `Règle « ${w.rule.name || "sans nom"} »${w.term ? ` — mot « ${w.term} »` : ""}`,
      concepts: [], matched_term: w.term, rule_id: w.rule.id, protection: w.rule.protection,
      input_hash: createHash("md5").update(`${b.name ?? ""}|${b.description ?? ""}|${b.category_id ?? ""}`).digest("hex"),
      analyzed_at: new Date().toISOString(),
    });
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("product_image_sensitivity").upsert(rows.slice(i, i + 500), { onConflict: "product_id" });
    if (error) throw new Error(error.message);
  }
  return rows.length;
}
