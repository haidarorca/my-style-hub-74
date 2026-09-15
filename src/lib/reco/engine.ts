/**
 * Moteur de recommandations Diakounda — logique de sélection partagée.
 *
 * Une seule source de vérité : toutes les surfaces (accueil, catégorie,
 * recherche, fiche produit, panier) passent par ce module pour diversifier,
 * faire tourner et dédoublonner les recommandations.
 */

const ANON_KEY = "dk-anon-id";

/** Identifiant anonyme stable (visiteur non connecté). */
export function getAnonId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/** Contexte d'appel du moteur (sert de clé de rotation et de pondération). */
export type RecoContext =
  | "home"
  | "category"
  | "search"
  | "product"
  | "cart"
  | "account";

export interface Scored {
  id: string;
  categoryId: string | null;
  score: number;
}

/** Poids comportemental par type d'événement. */
export const EVENT_WEIGHTS: Record<string, number> = {
  view: 1,
  dwell: 1,
  card_click: 1.5,
  search: 2,
  category_view: 2,
  reco_click: 2,
  add_to_cart: 5,
  remove_from_cart: -2,
  favorite: 6,
  purchase: 10,
};

/** Hash stable d'une chaîne (rotation déterministe). */
function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Graine de rotation : change chaque jour et selon le visiteur. */
export function rotationSeed(context: string): number {
  const day = Math.floor(Date.now() / 86_400_000);
  const who = getAnonId() ?? "anon";
  return (day + hash(who) + hash(context)) % 9973;
}

/**
 * Diversifie une liste triée : au maximum `maxPerCategory` produits d'une même
 * (sous-)catégorie, tout en conservant l'ordre de pertinence.
 */
export function diversify<T extends Scored>(items: T[], maxPerCategory = 2): T[] {
  const used = new Map<string, number>();
  const kept: T[] = [];
  const overflow: T[] = [];
  for (const it of items) {
    const key = it.categoryId ?? "_";
    const n = used.get(key) ?? 0;
    if (n < maxPerCategory) {
      used.set(key, n + 1);
      kept.push(it);
    } else {
      overflow.push(it);
    }
  }
  return [...kept, ...overflow];
}

/**
 * Applique une légère rotation déterministe sur les candidats de queue afin
 * que deux visites successives ne montrent pas exactement la même sélection.
 * Le haut du classement (les plus pertinents) reste stable.
 */
export function rotate<T>(items: T[], limit: number, context: string, keepTop = 2): T[] {
  if (items.length <= limit) return items.slice(0, limit);
  const top = items.slice(0, Math.min(keepTop, limit));
  const rest = items.slice(top.length);
  const need = limit - top.length;
  const offset = rotationSeed(context) % rest.length;
  const picked: T[] = [];
  for (let i = 0; i < need; i++) picked.push(rest[(offset + i) % rest.length]!);
  return [...top, ...picked];
}

/** Retire les produits déjà affichés ailleurs sur l'écran. */
export function excludeIds<T extends { id: string }>(items: T[], exclude: Iterable<string>): T[] {
  const set = new Set(exclude);
  return items.filter((i) => !set.has(i.id));
}

/** Pipeline complet : exclusion → diversification → rotation → coupe. */
export function selectRecommendations<T extends Scored>(
  candidates: T[],
  { limit, context, exclude = [], maxPerCategory = 2 }: {
    limit: number;
    context: string;
    exclude?: Iterable<string>;
    maxPerCategory?: number;
  },
): T[] {
  const filtered = excludeIds(candidates, exclude);
  const diversified = diversify(filtered, maxPerCategory);
  return rotate(diversified, limit, context);
}
