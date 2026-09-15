/**
 * Merchandising de la page d'accueil.
 *
 * Trois règles, appliquées dans cet ordre pour chaque section :
 *   1. Exclusion  — un produit marqué « Exclure de la page d'accueil » n'apparaît
 *                   dans aucune section automatique (il reste dans le catalogue,
 *                   la recherche, sa catégorie et sa boutique).
 *   2. Priorité   — un produit avec une priorité manuelle (1 = le plus fort)
 *                   passe devant le classement automatique.
 *   3. Position   — un produit avec une position forcée est inséré à cette
 *                   place ; les autres sont décalés, jamais dupliqués.
 *
 * La déduplication est GLOBALE : un identifiant déjà affiché dans une section
 * précédente est retiré du vivier des sections suivantes. Aucune section n'est
 * jamais complétée artificiellement : si le vivier unique est plus court que la
 * cible, la section affiche moins de produits — ou rien du tout.
 */

import { rotateSelect } from "@/lib/home-rotation";

export interface MerchProduct {
  id: string;
  home_priority?: number | null;
  home_position?: number | null;
  home_excluded?: boolean | null;
}

/** Retire les produits exclus de la vitrine par l'administrateur. */
export function withoutExcluded<T extends MerchProduct>(pool: T[]): T[] {
  return pool.filter((p) => !p.home_excluded);
}

/** Retire les produits déjà affichés ailleurs sur la page d'accueil. */
export function withoutSeen<T extends { id: string }>(pool: T[], seen: Set<string>): T[] {
  return pool.filter((p) => !seen.has(p.id));
}

/** Insère les produits à position forcée sans jamais créer de doublon. */
function applyForcedPositions<T extends MerchProduct>(list: T[]): T[] {
  const forced = list
    .filter((p) => typeof p.home_position === "number" && p.home_position! > 0)
    .sort((a, b) => (a.home_position ?? 0) - (b.home_position ?? 0));
  if (forced.length === 0) return list;

  const forcedIds = new Set(forced.map((p) => p.id));
  const out = list.filter((p) => !forcedIds.has(p.id));
  for (const p of forced) {
    const index = Math.min(Math.max((p.home_position ?? 1) - 1, 0), out.length);
    out.splice(index, 0, p);
  }
  return out;
}

/**
 * Sélectionne au plus `count` produits d'un vivier :
 * priorités manuelles d'abord, puis rotation marketing sur le reste,
 * puis application des positions forcées.
 */
export function selectSectionProducts<T extends MerchProduct>(
  pool: T[],
  count: number,
  sectionKey: string,
  { rotate = true }: { rotate?: boolean } = {},
): T[] {
  if (count <= 0 || pool.length === 0) return [];

  const pinned = pool
    .filter((p) => typeof p.home_priority === "number" && p.home_priority! > 0)
    .sort((a, b) => (a.home_priority ?? 99) - (b.home_priority ?? 99));
  const pinnedIds = new Set(pinned.map((p) => p.id));
  const rest = pool.filter((p) => !pinnedIds.has(p.id));

  const head = pinned.slice(0, count);
  const need = count - head.length;
  const tail = need > 0 ? (rotate ? rotateSelect(rest, need, sectionKey) : rest.slice(0, need)) : [];

  return applyForcedPositions([...head, ...tail]);
}

/** Petit utilitaire : marque une liste comme affichée. */
export function markSeen(seen: Set<string>, items: Array<{ id: string }>): void {
  for (const it of items) seen.add(it.id);
}
