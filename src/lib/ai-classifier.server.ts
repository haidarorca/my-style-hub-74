/**
 * ai-classifier.server.ts
 * -----------------------
 * Helpers serveur pour la classification produit -> catégorie EXISTANTE.
 * L'IA n'a JAMAIS le droit de créer / renommer / supprimer une catégorie.
 */

export interface CatNode {
  id: string;
  name: string;
  level: number;
  parent_id: string | null;
  name_i18n?: Record<string, string> | null;
}

export interface CatPath {
  id: string; // id du noeud le plus profond (celui appliqué au produit)
  level1: { id: string; name: string } | null;
  level2: { id: string; name: string } | null;
  level3: { id: string; name: string } | null;
  label: string; // "Agriculture > Irrigation > Pompes solaires"
  tokens: string[];
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Synonymes / traductions fréquents (fr <-> en) pour le pré-filtrage lexical. */
const SYNONYMS: Record<string, string[]> = {
  pompe: ["pump", "pompes", "pumping", "motopompe"],
  pump: ["pompe", "pompes"],
  solaire: ["solar", "photovoltaique", "pv", "panneau"],
  solar: ["solaire", "photovoltaique", "pv"],
  eau: ["water", "hydraulique", "hydro"],
  water: ["eau", "hydraulique"],
  irrigation: ["arrosage", "goutte", "aspersion", "irrigate"],
  arrosage: ["irrigation", "watering"],
  semence: ["graine", "seed", "semences", "graines"],
  graine: ["semence", "seed"],
  engrais: ["fertilizer", "fertilisant", "npk", "amendement"],
  tracteur: ["tractor", "motoculteur"],
  outil: ["tool", "outillage", "materiel"],
  elevage: ["livestock", "betail", "animal", "animaux"],
  volaille: ["poultry", "poulet", "poule", "aviculture"],
  poisson: ["fish", "pisciculture", "aquaculture"],
  panneau: ["panel", "module", "solaire"],
  batterie: ["battery", "accumulateur"],
  moteur: ["motor", "engine", "groupe"],
  tuyau: ["hose", "pipe", "tube", "canalisation"],
  serre: ["greenhouse", "tunnel"],
  bache: ["tarp", "film", "plastique"],
  machine: ["machinery", "equipement", "equipment", "materiel"],
  transformation: ["processing", "moulin", "broyeur"],
  stockage: ["storage", "silo", "conservation"],
  vaccin: ["vaccine", "veterinaire", "medicament"],
  aliment: ["feed", "nourriture", "provende", "food"],
};

const STOP = new Set([
  "de","la","le","les","des","du","un","une","et","pour","avec","en","sur","au","aux","d","l",
  "the","of","for","with","and","a","an","to","in","kg","cm","mm","w","v","pcs","set","new",
]);

export function tokenize(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export function expandTokens(tokens: string[]): Set<string> {
  const out = new Set<string>();
  for (const t of tokens) {
    out.add(t);
    // singulier/pluriel naïf
    if (t.endsWith("s") && t.length > 3) out.add(t.slice(0, -1));
    else out.add(`${t}s`);
    for (const syn of SYNONYMS[t] ?? []) out.add(syn);
  }
  return out;
}

function levenshtein(a: string, b: string): number {
  const m: number[][] = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0]![j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i]![j] =
        b.charAt(i - 1) === a.charAt(j - 1)
          ? m[i - 1]![j - 1]!
          : Math.min(m[i - 1]![j - 1]! + 1, m[i]![j - 1]! + 1, m[i - 1]![j]! + 1);
    }
  }
  return m[b.length]![a.length]!;
}

/** Tolérance aux fautes d'orthographe. */
function fuzzyHit(token: string, target: Set<string>): boolean {
  if (target.has(token)) return true;
  if (token.length < 5) return false;
  for (const t of target) {
    if (Math.abs(t.length - token.length) > 2) continue;
    if (levenshtein(token, t) <= (token.length > 7 ? 2 : 1)) return true;
  }
  return false;
}

/** Construit tous les chemins "feuille" de l'arbre existant. */
export function buildPaths(nodes: CatNode[]): CatPath[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hasChild = new Set(nodes.map((n) => n.parent_id).filter(Boolean) as string[]);
  const paths: CatPath[] = [];

  for (const n of nodes) {
    if (hasChild.has(n.id)) continue; // uniquement les feuilles
    const chain: CatNode[] = [n];
    let cur = n;
    while (cur.parent_id) {
      const p = byId.get(cur.parent_id);
      if (!p) break;
      chain.unshift(p);
      cur = p;
    }
    const lvl = (l: number) => {
      const c = chain.find((x) => x.level === l);
      return c ? { id: c.id, name: c.name } : null;
    };
    const label = chain.map((c) => c.name).join(" > ");
    paths.push({
      id: n.id,
      level1: lvl(1),
      level2: lvl(2),
      level3: lvl(3),
      label,
      tokens: [...expandTokens(tokenize(label))],
    });
  }
  return paths;
}

export interface ScoredPath extends CatPath {
  score: number;
}

/**
 * Pré-filtrage lexical : ne conserve qu'un petit nombre de candidats
 * pour rester rapide même avec plusieurs milliers de catégories.
 */
export function preselect(
  paths: CatPath[],
  productText: string,
  boosts: Map<string, number>,
  limit = 30,
): ScoredPath[] {
  const pTokens = [...expandTokens(tokenize(productText))];
  const scored: ScoredPath[] = paths.map((p) => {
    const set = new Set(p.tokens);
    let score = 0;
    for (const t of pTokens) {
      if (fuzzyHit(t, set)) score += t.length > 4 ? 2 : 1;
    }
    // priorité aux catégories profondes plus précises
    if (p.level3) score += 0.5;
    score += boosts.get(p.id) ?? 0;
    return { ...p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const positives = scored.filter((s) => s.score > 0);
  return (positives.length > 0 ? positives : scored).slice(0, limit);
}
