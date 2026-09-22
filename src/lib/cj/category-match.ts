// ═══════════════════════════════════════════════════════════════
// Correspondance automatique catégorie CJ (anglais) → catégorie KawZone
// (français). Module PUR : aucune dépendance base de données.
//
// Principe : chaque segment du chemin CJ est traduit en mots-clés
// français, puis comparé aux noms des catégories KawZone, en descendant
// niveau par niveau. Aucune invention : si un niveau ne correspond à
// rien, on s'arrête et le reste est « à attribuer ».
// ═══════════════════════════════════════════════════════════════

export interface FlatCategory {
  id: string;
  name: string;
  parent_id: string | null;
  level: number;
}

export interface CategoryMatch {
  /** Catégorie KawZone la plus profonde trouvée (ou null). */
  categoryId: string | null;
  /** Chaîne des identifiants, du niveau 1 vers le bas. */
  chainIds: string[];
  /** Chaîne des noms, du niveau 1 vers le bas. */
  chainNames: string[];
  /** Nombre de segments CJ non résolus. */
  unresolved: string[];
}

/** Dictionnaire anglais → mots-clés français (minuscule, sans accent). */
const DICT: Record<string, string[]> = {
  "women's clothing": ["mode femme", "femme"],
  "womens clothing": ["mode femme", "femme"],
  women: ["mode femme", "femme"],
  "men's clothing": ["mode homme", "homme"],
  "mens clothing": ["mode homme", "homme"],
  men: ["mode homme", "homme"],
  underwears: ["lingerie", "sous-vetements", "sous vetements"],
  underwear: ["lingerie", "sous-vetements", "sous vetements"],
  lingerie: ["lingerie"],
  bras: ["soutiens-gorge", "soutien-gorge", "brassieres", "lingerie"],
  bra: ["soutiens-gorge", "soutien-gorge", "lingerie"],
  panties: ["culottes", "lingerie"],
  dresses: ["robes"],
  dress: ["robes"],
  skirts: ["jupes"],
  pants: ["pantalons"],
  trousers: ["pantalons"],
  jeans: ["jeans"],
  leggings: ["leggings"],
  shorts: ["shorts"],
  tops: ["tops femme", "tops"],
  "t-shirts": ["t-shirts"],
  tshirts: ["t-shirts"],
  blouses: ["blouses"],
  sweaters: ["pulls & cardigans", "pulls"],
  hoodies: ["pulls & cardigans", "pulls"],
  jackets: ["vestes femme", "vestes"],
  coats: ["vestes femme", "vestes"],
  shoes: ["chaussures"],
  sneakers: ["sneakers"],
  boots: ["bottes"],
  sandals: ["sandales"],
  heels: ["talons"],
  bags: ["sacs"],
  handbags: ["sacs a main", "sacs"],
  backpacks: ["sacs a dos"],
  jewelry: ["bijoux"],
  rings: ["bagues"],
  necklaces: ["colliers"],
  bracelets: ["bracelets"],
  earrings: ["boucles d'oreilles"],
  watches: ["montres"],
  beauty: ["beaute"],
  "health & beauty": ["beaute & sante", "beaute"],
  makeup: ["maquillage"],
  perfume: ["parfums"],
  wigs: ["perruques"],
  "hair extensions": ["extensions"],
  "hair care": ["soins capillaires"],
  electronics: ["electronique"],
  "consumer electronics": ["electronique"],
  "phone accessories": ["accessoires telephone"],
  audio: ["audio"],
  "computer & office": ["bureau & fournitures", "informatique"],
  "home & garden": ["maison & decoration", "maison"],
  home: ["maison & decoration", "maison"],
  kitchen: ["cuisine"],
  furniture: ["meubles"],
  "toys & games": ["jeux & jouets", "jouets"],
  toys: ["jeux & jouets", "jouets"],
  "sports & outdoors": ["sport & fitness", "sport"],
  sports: ["sport & fitness", "sport"],
  fitness: ["fitness", "cardio"],
  "baby & kids": ["enfants & bebe"],
  baby: ["enfants & bebe"],
  kids: ["enfants & bebe"],
  "pet supplies": ["animaux"],
  pets: ["animaux"],
  automotive: ["auto & moto"],
  "auto parts": ["auto & moto"],
  luggage: ["bagagerie & voyage"],
  travel: ["bagagerie & voyage"],
  "tools & hardware": ["bricolage & jardin"],
  garden: ["bricolage & jardin"],
  food: ["alimentation & boissons"],
  beverages: ["boissons"],
  books: ["livres & medias"],
  stationery: ["bureau & fournitures"],
};

export function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[&']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function keywordsFor(segment: string): string[] {
  const raw = segment.trim().toLowerCase();
  const direct = DICT[raw];
  const out = new Set<string>();
  if (direct) direct.forEach((k) => out.add(normalizeLabel(k)));
  // Mots isolés du segment (« Women's Clothing » → women, clothing).
  for (const word of normalizeLabel(raw).split(" ")) {
    if (!word || word.length < 3) continue;
    const d = DICT[word];
    if (d) d.forEach((k) => out.add(normalizeLabel(k)));
    out.add(word);
  }
  out.add(normalizeLabel(raw));
  return [...out].filter(Boolean);
}

function scoreCandidate(catName: string, keywords: string[]): number {
  const n = normalizeLabel(catName);
  let best = 0;
  for (const k of keywords) {
    if (!k) continue;
    if (n === k) best = Math.max(best, 100);
    else if (n.startsWith(k) || k.startsWith(n)) best = Math.max(best, 70);
    else if (n.includes(k) || k.includes(n)) best = Math.max(best, 55);
  }
  return best;
}

/** Découpe « A > B > C » (ou « A / B ») en segments. */
export function splitCjPath(path: string | null | undefined): string[] {
  if (!path) return [];
  return path
    .split(/>|\/|\|/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Tente de faire correspondre un chemin CJ à l'arbre KawZone.
 * Descend niveau par niveau ; s'arrête dès qu'un segment n'a pas
 * d'équivalent suffisamment proche (score ≥ 55).
 */
export function matchCjCategoryPath(
  cjPath: string | null | undefined,
  categories: FlatCategory[],
): CategoryMatch {
  const segments = splitCjPath(cjPath);
  const result: CategoryMatch = {
    categoryId: null,
    chainIds: [],
    chainNames: [],
    unresolved: [],
  };
  if (!segments.length || !categories.length) {
    result.unresolved = segments;
    return result;
  }

  let parentId: string | null = null;
  let segIndex = 0;

  while (segIndex < segments.length) {
    const seg = segments[segIndex]!;
    const keywords = keywordsFor(seg);
    const pool = categories.filter((c) => (c.parent_id ?? null) === parentId);
    let best: { cat: FlatCategory; score: number } | null = null;
    for (const cat of pool) {
      const score = scoreCandidate(cat.name, keywords);
      if (score >= 55 && (!best || score > best.score)) best = { cat, score };
    }
    if (!best) break;
    result.chainIds.push(best.cat.id);
    result.chainNames.push(best.cat.name);
    result.categoryId = best.cat.id;
    parentId = best.cat.id;
    segIndex += 1;
  }

  result.unresolved = segments.slice(segIndex);
  return result;
}
