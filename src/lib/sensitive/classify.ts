/**
 * Classification « images sensibles » — moteur local (pur, testable).
 * Principe : un mot seul ne décide jamais. On combine
 *   hiérarchie de catégorie  +  nom  +  description  (+ règles apprises).
 * En cas de doute → l'IA ; si l'IA doute → « À vérifier ».
 * `audience` = genre qui PEUT voir l'image (masquée pour l'autre).
 */

export type Gender = "homme" | "femme";
export type Decision = "sensitive" | "normal" | "review";

export interface ClassifyInput {
  name: string;
  description?: string | null;
  categoryId?: string | null;
  categoryPath: string[]; // ["Vêtements", "Sous-vêtements", "Homme"]
}

export interface LearnedRule {
  id: string;
  term: string; // terme normalisé ou "*" (toute la catégorie)
  category_id: string;
  decision: "sensitive" | "normal";
  audience: Gender | null;
}

export type LocalResult =
  | {
      kind: "final";
      decision: Decision;
      audience: Gender | null;
      confidence: "high" | "medium";
      reason: string;
      concepts: string[];
      term: string | null;
      ruleId?: string;
    }
  | { kind: "ai"; why: string; term: string | null; concepts: string[] };

export function norm(s: string | null | undefined): string {
  return ` ${String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

const has = (text: string, phrase: string) => text.includes(` ${phrase} `);

/** Termes de sous-vêtements/lingerie (FR/EN, variantes). Jamais décisifs seuls. */
export const UNDERWEAR_TERMS: Record<string, string[]> = {
  boxer: ["boxer", "boxers", "boxer brief", "boxer briefs"],
  slip: ["slip", "slips", "calecon", "calecons", "brief", "briefs", "trunks"],
  culotte: ["culotte", "culottes", "panties", "panty", "knickers", "shorty", "shortys", "hipster"],
  string: ["string", "strings", "thong", "thongs", "tanga", "g string"],
  "soutien-gorge": ["soutien gorge", "soutiens gorge", "soutif", "bra", "bras", "brassiere", "bralette", "push up"],
  lingerie: ["lingerie", "nuisette", "babydoll", "baby doll", "corset", "bustier", "porte jarretelle", "porte jarretelles", "garter", "guepiere", "teddy lingerie"],
  "sous-vêtement": ["sous vetement", "sous vetements", "underwear", "undergarment", "undergarments", "lingerie set", "shapewear", "gaine"],
  "maillot de bain": ["maillot de bain", "maillots de bain", "bikini", "bikinis", "swimsuit", "swimsuits", "swimwear", "monokini"],
};

const CAT_UNDERWEAR = ["sous vetement", "sous vetements", "lingerie", "underwear", "maillot de bain", "maillots de bain", "swimwear", "bikini", "sleepwear sexy"];
const CAT_APPAREL = ["vetement", "vetements", "mode", "clothing", "apparel", "habillement", "fashion", "pret a porter", "lingerie"];
const CAT_UNRELATED = ["animal", "animaux", "animalerie", "pet", "pets", "chien", "chiens", "chat", "chats", "jouet", "jouets", "toy", "toys", "auto", "voiture", "moto", "electronique", "informatique", "telephone", "cuisine", "jardin", "bricolage", "outil", "outils", "agriculture", "papeterie", "decoration"];
const G_MEN = ["homme", "hommes", "men", "man", "mens", "male", "masculin", "garcon", "garcons", "boy", "boys", "monsieur"];
const G_WOMEN = ["femme", "femmes", "women", "woman", "womens", "lady", "ladies", "female", "feminin", "feminine", "dame", "dames", "fille", "filles", "girl", "girls"];

export function findTerms(text: string): { concepts: string[]; terms: string[] } {
  const concepts: string[] = [];
  const terms: string[] = [];
  for (const [concept, list] of Object.entries(UNDERWEAR_TERMS)) {
    for (const t of list) {
      if (has(text, t)) {
        if (!concepts.includes(concept)) concepts.push(concept);
        terms.push(t);
      }
    }
  }
  return { concepts, terms };
}

export function genderOf(text: string): Gender | "both" | null {
  const m = G_MEN.some((w) => has(text, w));
  const f = G_WOMEN.some((w) => has(text, w));
  if (m && f) return "both";
  return m ? "homme" : f ? "femme" : null;
}

const anyIn = (text: string, list: string[]) => list.some((w) => has(text, w));

export function classifyLocal(input: ClassifyInput, rules: LearnedRule[] = []): LocalResult {
  const name = norm(input.name);
  const desc = norm(input.description);
  const cat = norm(input.categoryPath.join(" "));
  const inName = findTerms(name);
  const inDesc = findTerms(desc);
  const term = inName.terms[0] ?? null;
  const concepts = [...new Set([...inName.concepts, ...inDesc.concepts])];

  // 0. Règles apprises (catégorie exacte + terme dans le nom)
  if (input.categoryId) {
    const r =
      rules.find((x) => x.category_id === input.categoryId && x.term !== "*" && has(name, x.term)) ??
      rules.find((x) => x.category_id === input.categoryId && x.term === "*");
    if (r) {
      return {
        kind: "final", decision: r.decision, audience: r.audience, confidence: "high",
        reason: `Règle apprise : « ${r.term === "*" ? "toute la catégorie" : r.term} » dans ${input.categoryPath.join(" > ")}`,
        concepts, term: r.term === "*" ? term : r.term, ruleId: r.id,
      };
    }
  }

  const underwearCat = anyIn(cat, CAT_UNDERWEAR);
  const apparelCat = underwearCat || anyIn(cat, CAT_APPAREL);
  const unrelatedCat = !apparelCat && anyIn(cat, CAT_UNRELATED);

  // 1. Catégorie sans rapport : un mot comme « boxer » ne déclenche rien.
  if (unrelatedCat) {
    return {
      kind: "final", decision: "normal", audience: null, confidence: "high",
      reason: inName.terms.length
        ? `« ${term} » ignoré : catégorie sans rapport (${input.categoryPath.join(" > ")})`
        : "Catégorie sans rapport avec les vêtements",
      concepts: [], term: null,
    };
  }

  const gCat = genderOf(cat);
  const gName = genderOf(name);
  const gDesc = genderOf(desc);

  // 2. Catégorie sous-vêtements / lingerie / maillots
  if (underwearCat) {
    const g = gCat === "homme" || gCat === "femme" ? gCat : null;
    if (g) {
      const nameContra = gName && gName !== g;
      const descContra = gDesc && gDesc !== g && gDesc !== "both" && !gName;
      if (nameContra || descContra) {
        return { kind: "ai", why: "Genre contradictoire entre catégorie et texte", term, concepts };
      }
      return {
        kind: "final", decision: "sensitive", audience: g, confidence: "high",
        reason: `Catégorie ${input.categoryPath.join(" > ")}${term ? ` + « ${term} »` : ""}`,
        concepts: concepts.length ? concepts : ["sous-vêtement"], term,
      };
    }
    if ((gName === "homme" || gName === "femme") && inName.terms.length) {
      return {
        kind: "final", decision: "sensitive", audience: gName, confidence: "medium",
        reason: `Catégorie sous-vêtements + « ${term} » + genre « ${gName} » dans le nom`,
        concepts, term,
      };
    }
    return { kind: "ai", why: "Catégorie sous-vêtements sans genre clair", term, concepts };
  }

  // 3. Autre vêtement : féminin/masculin ≠ sensible. Terme dans le nom → IA.
  if (inName.terms.length) {
    return { kind: "ai", why: `« ${term} » hors catégorie sous-vêtements`, term, concepts };
  }
  if (apparelCat && inDesc.concepts.length >= 2) {
    return { kind: "ai", why: "Description évoquant plusieurs sous-vêtements", term: inDesc.terms[0] ?? null, concepts };
  }
  return {
    kind: "final", decision: "normal", audience: null, confidence: apparelCat ? "medium" : "high",
    reason: apparelCat ? "Vêtement sans indice de sous-vêtement" : "Aucun indice sensible",
    concepts: [], term: null,
  };
}

/** Conversion de la réponse IA (hidden_for) vers audience (qui peut voir). */
export function fromAi(ai: {
  sensitive: boolean;
  hidden_for: "male" | "female" | "none";
  confidence: "high" | "medium" | "low";
}): { decision: Decision; audience: Gender | null } {
  if (ai.confidence === "low") return { decision: "review", audience: null };
  if (!ai.sensitive) return { decision: "normal", audience: null };
  if (ai.hidden_for === "female") return { decision: "sensitive", audience: "homme" };
  if (ai.hidden_for === "male") return { decision: "sensitive", audience: "femme" };
  return { decision: "review", audience: null };
}
