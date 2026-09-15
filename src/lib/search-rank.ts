/**
 * Scoring de pertinence pour la recherche du site.
 * Ordre voulu : Code/SKU exact > début de nom > nom contient > désignation/mots-clés.
 */

export function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export interface RankableProduct {
  name?: string | null;
  designation?: string | null;
  code?: string | null;
  sku?: string | null;
}

/** Score de 0 (aucune correspondance) à 100 (code exact). Plus haut = plus pertinent. */
export function scoreProduct(p: RankableProduct, rawTerm: string): number {
  const term = normalize(rawTerm);
  if (!term) return 0;
  const name = normalize(p.name);
  const desig = normalize(p.designation);
  const code = normalize(p.code);
  const sku = normalize(p.sku);

  if (code && code === term) return 100;
  if (sku && sku === term) return 95;
  if (code.startsWith(term) || sku.startsWith(term)) return 85;
  if (name === term) return 80;
  if (name.startsWith(term)) return 70;

  const words = term.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((w) => name.includes(w))) return 60;
  if (name.includes(term)) return 55;
  if (desig.startsWith(term)) return 40;
  if (desig.includes(term)) return 30;
  if (words.length > 1 && words.every((w) => `${name} ${desig}`.includes(w))) return 20;
  return 5;
}

/** Trie une liste par pertinence décroissante (tri stable pour les égalités). */
export function rankBy<T>(items: T[], score: (item: T) => number): T[] {
  return items
    .map((item, i) => ({ item, i, s: score(item) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.item);
}

/** Score simple pour un libellé (catégorie, boutique). */
export function scoreLabel(label: string | null | undefined, rawTerm: string): number {
  const term = normalize(rawTerm);
  const l = normalize(label);
  if (!term || !l) return 0;
  if (l === term) return 100;
  if (l.startsWith(term)) return 70;
  if (l.includes(term)) return 50;
  const words = term.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((w) => l.includes(w))) return 40;
  return 5;
}
