/**
 * Générateur de règles de sensibilité — moteur pur (testable, sans I/O).
 * ----------------------------------------------------------------------
 * Couche ajoutée AU-DESSUS du classifieur existant (classify.ts) :
 *   1. Décision manuelle directe (produit / image)      — jamais écrasée
 *   2. Règle manuelle validée (origin MANUAL)            — ce module
 *   3. Règle automatique validée (proposée par l'IA)     — ce module
 *   4. Classification IA / règles apprises historiques   — classify.ts + IA
 *   5. Défaut (non sensible / catégorie marquée)
 * Les textes sont lus dans la langue SOURCE du produit (aucune traduction).
 */

export type MatchMode = "contains" | "word" | "phrase" | "prefix";
export type Combine = "any" | "all";
export type Protection = "hide" | "blur" | "placeholder";
export type RuleField = "name" | "designation" | "description" | "variants" | "attributes";
export type ClassKey = "femme" | "homme" | "normal" | "review" | (string & {});

export interface BuilderRule {
  id: string;
  name?: string | null;
  category_id: string | null;
  scope: "exact" | "branch";
  keywords: string[];
  exclusions: string[];
  fields: RuleField[];
  source_lang: string | null;
  match_mode: MatchMode;
  combine: Combine;
  classification: ClassKey;
  protection: Protection;
  priority: number;
  origin: "AI" | "MANUAL";
  updated_at?: string | null;
}

export interface RuleProduct {
  id: string;
  name?: string | null;
  designation?: string | null;
  description?: string | null;
  variants?: string | null;
  attributes?: string | null;
  category_id: string | null;
  source_lang?: string | null;
}

export interface CategoryTree {
  /** ancêtres d'une catégorie, elle-même incluse (du plus proche au plus lointain). */
  ancestors(id: string | null | undefined): string[];
  /** niveau 1 (famille), 2, 3… */
  depth(id: string | null | undefined): number;
}

export function buildCategoryTree(rows: Array<{ id: string; parent_id: string | null }>): CategoryTree & { descendants(id: string): string[] } {
  const parent = new Map(rows.map((r) => [r.id, r.parent_id]));
  const children = new Map<string, string[]>();
  for (const r of rows) if (r.parent_id) children.set(r.parent_id, [...(children.get(r.parent_id) ?? []), r.id]);
  const anc = (id: string | null | undefined) => {
    const out: string[] = [];
    let cur = id ?? null;
    let g = 0;
    while (cur && g++ < 12) { out.push(cur); cur = parent.get(cur) ?? null; }
    return out;
  };
  return {
    ancestors: anc,
    depth: (id) => anc(id).length,
    descendants: (id) => {
      const out = [id];
      for (let i = 0; i < out.length; i++) out.push(...(children.get(out[i]) ?? []));
      return out;
    },
  };
}

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/;
const isCjk = (s: string) => CJK.test(s);

/** Minuscules, sans accents, ponctuation → espaces. Garde les caractères non latins (chinois, arabe…). */
export function normText(s: string | null | undefined): string {
  const t = String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return t ? ` ${t} ` : " ";
}

/** Langue source : champ produit si présent, sinon détection légère sur le nom. */
export function detectLang(p: Pick<RuleProduct, "name" | "designation" | "source_lang">): string {
  const txt = `${p.name ?? ""} ${p.designation ?? ""}`;
  if (/[\u4e00-\u9fff]/.test(txt)) return "zh";
  if (/[\u0600-\u06ff]/.test(txt)) return "ar";
  if (p.source_lang) return p.source_lang.toLowerCase().slice(0, 2);
  const n = normText(txt);
  const fr = [" pour ", " avec ", " femme ", " homme ", " de ", " et ", " le ", " la ", " les ", " des "].filter((w) => n.includes(w)).length;
  const accents = /[éèêàùçôî]/i.test(txt);
  return fr >= 2 || (fr >= 1 && accents) ? "fr" : "en";
}

function variantsOf(kw: string): string[] {
  // Pluriels simples (FR/EN) : bikini → bikinis, brief → briefs, dress → dresses.
  if (isCjk(kw) || kw.includes(" ")) return [kw];
  return [kw, `${kw}s`, `${kw}es`];
}

/** Teste un mot-clé (déjà normalisé, sans espaces de bord) dans un texte normalisé. */
export function keywordHit(text: string, kw: string, mode: MatchMode): boolean {
  if (!kw) return false;
  if (isCjk(kw) || mode === "contains") return text.includes(kw);
  if (mode === "prefix") return text.includes(` ${kw}`);
  if (mode === "phrase") return text.includes(` ${kw} `);
  return variantsOf(kw).some((v) => text.includes(` ${v} `));
}

export function ruleText(p: RuleProduct, fields: RuleField[]): string {
  return normText(fields.map((f) => p[f] ?? "").join(" | "));
}

export interface RuleMatch { matched: boolean; term: string | null; reason?: string }

export function matchRule(p: RuleProduct, r: BuilderRule, tree: CategoryTree, lang = detectLang(p)): RuleMatch {
  // Catégorie
  if (r.category_id) {
    if (!p.category_id) return { matched: false, term: null, reason: "sans catégorie" };
    const ok = r.scope === "exact" ? p.category_id === r.category_id : tree.ancestors(p.category_id).includes(r.category_id);
    if (!ok) return { matched: false, term: null, reason: "hors catégorie" };
  }
  // Langue source
  if (r.source_lang && r.source_lang !== "all" && r.source_lang !== lang) return { matched: false, term: null, reason: `langue ${lang}` };
  const kws = r.keywords.map((k) => normText(k).trim()).filter(Boolean);
  if (!kws.length) return { matched: true, term: null };
  // Exclusions : les expressions exclues sont retirées du texte avant la recherche.
  let text = ruleText(p, r.fields.length ? r.fields : ["name", "designation"]);
  for (const ex of r.exclusions.map((e) => normText(e).trim()).filter(Boolean)) {
    text = text.split(isCjk(ex) ? ex : ` ${ex} `).join("  ");
  }
  const hits = kws.filter((k) => keywordHit(text, k, r.match_mode));
  if (r.combine === "all" ? hits.length === kws.length : hits.length > 0) return { matched: true, term: hits[0] ?? null };
  return { matched: false, term: null };
}

/** Score de priorité : origine > niveau de catégorie > portée > mots > langue > priorité manuelle. */
export function ruleRank(r: BuilderRule, tree: CategoryTree): number {
  const origin = r.origin === "MANUAL" ? 2 : 1;
  const depth = r.category_id ? tree.depth(r.category_id) : 0;
  return origin * 1_000_000 + depth * 10_000 + (r.scope === "exact" ? 1_000 : 0)
    + (r.keywords.length ? 500 : 0) + (r.source_lang && r.source_lang !== "all" ? 100 : 0)
    + Math.max(0, Math.min(99, r.priority || 0));
}

export interface Winner { rule: BuilderRule; term: string | null; rank: number }

export function pickWinner(p: RuleProduct, rules: BuilderRule[], tree: CategoryTree): Winner | null {
  const lang = detectLang(p);
  let best: Winner | null = null;
  for (const r of rules) {
    const m = matchRule(p, r, tree, lang);
    if (!m.matched) continue;
    const rank = ruleRank(r, tree);
    if (!best || rank > best.rank || (rank === best.rank && String(r.updated_at ?? "") > String(best.rule.updated_at ?? ""))) {
      best = { rule: r, term: m.term, rank };
    }
  }
  return best;
}

/** Classification → (decision, audience) stockés dans product_image_sensitivity. */
export function classToDecision(c: ClassKey, table?: Map<string, { decision: string; audience: string | null }>) {
  const t = table?.get(c);
  if (t) return { decision: t.decision as "sensitive" | "normal" | "review", audience: (t.audience as "homme" | "femme" | null) ?? null };
  if (c === "femme" || c === "homme") return { decision: "sensitive" as const, audience: c };
  if (c === "normal") return { decision: "normal" as const, audience: null };
  return { decision: "review" as const, audience: null };
}

/** Décision finale d'un produit selon la hiérarchie (utilisé par le moteur serveur et les tests). */
export function finalDecision(input: {
  manual?: { decision: string; audience: string | null } | null;
  rule?: Winner | null;
  fallback?: { decision: string; audience: string | null; source: "AI" | "RULE" } | null;
}): { decision: string; audience: string | null; source: "MANUAL" | "RULE" | "AI" | "DEFAULT"; ruleId?: string } {
  if (input.manual) return { ...input.manual, source: "MANUAL" };
  if (input.rule) {
    const d = classToDecision(input.rule.rule.classification);
    return { ...d, source: "RULE", ruleId: input.rule.rule.id };
  }
  if (input.fallback) return { decision: input.fallback.decision, audience: input.fallback.audience, source: input.fallback.source };
  return { decision: "normal", audience: null, source: "DEFAULT" };
}

/** Motifs LIKE pour la présélection SQL (minuscules, sans accents). */
export function sqlPatterns(keywords: string[]): string[] {
  return keywords.map((k) => normText(k).trim()).filter(Boolean).map((k) => `%${k.replace(/[%_\\]/g, "")}%`);
}
