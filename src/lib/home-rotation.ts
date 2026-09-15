/**
 * Rotation marketing de l'accueil.
 *
 * Objectif : les visiteurs réguliers ne voient pas toujours les mêmes produits
 * dans le même ordre, tout en conservant la pertinence (on tourne à l'intérieur
 * d'un vivier déjà trié par pertinence, on ne mélange jamais au hasard).
 */

const VISIT_KEY = "dk-home-visit";

let cachedSeed: number | null = null;

/** Compteur de visite, incrémenté une fois par session de navigation. */
export function getRotationSeed(): number {
  if (cachedSeed !== null) return cachedSeed;
  if (typeof window === "undefined") return 0;
  try {
    const already = sessionStorage.getItem(VISIT_KEY);
    if (already) {
      cachedSeed = Number(already) || 0;
      return cachedSeed;
    }
    const next = (Number(localStorage.getItem(VISIT_KEY) || "0") || 0) + 1;
    localStorage.setItem(VISIT_KEY, String(next));
    sessionStorage.setItem(VISIT_KEY, String(next));
    cachedSeed = next;
    return next;
  } catch {
    return 0;
  }
}

/** Hash stable d'une chaîne (pour varier l'offset d'une section à l'autre). */
function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Sélectionne `count` éléments dans un vivier trié, avec un décalage déterministe
 * dépendant de la visite et de la section. Les premiers éléments du vivier
 * (les plus pertinents) restent régulièrement mis en avant.
 */
export function rotateSelect<T>(pool: T[], count: number, sectionKey: string, seed = getRotationSeed()): T[] {
  if (pool.length <= count) return pool;
  const offset = (seed + hash(sectionKey)) % pool.length;
  const out: T[] = [];
  for (let i = 0; i < count; i++) out.push(pool[(offset + i) % pool.length]!);
  return out;
}

/** Retire les éléments déjà affichés ailleurs (anti-répétition entre sections). */
export function excludeSeen<T>(items: T[], seen: Set<string>, keyOf: (item: T) => string): T[] {
  return items.filter((it) => !seen.has(keyOf(it)));
}
