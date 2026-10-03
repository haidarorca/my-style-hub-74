// Indicateur unique de qualité / compatibilité KawZone pour un produit CJ.
// Sert directement à la décision de publication (même règle partout).

export type QualityLevel = "conforme" | "a_completer" | "bloque";

/** Raisons qui empêchent toute publication (le produit ne peut pas être vendu). */
const BLOCKING = [/image/i, /^nom absent/i, /prix d'achat absent/i, /aucune variante/i, /fournisseur visible/i];

export function qualityFromReasons(reasons: string[] | null | undefined): { level: QualityLevel; blocking: string[]; toComplete: string[] } {
  const r = reasons ?? [];
  const blocking = r.filter((x) => BLOCKING.some((re) => re.test(x)));
  const toComplete = r.filter((x) => !blocking.includes(x));
  return { level: blocking.length ? "bloque" : toComplete.length ? "a_completer" : "conforme", blocking, toComplete };
}

/** Pour un résultat de recherche CJ (données partielles de la liste). */
export function qualityFromHit(h: { name?: string | null; image?: string | null; price?: number | null; sku?: string | null; weightKg?: number | null; missing?: string[] }): { level: QualityLevel; reasons: string[] } {
  const reasons: string[] = [];
  if (!h.image) reasons.push("Image principale absente");
  if (!h.name) reasons.push("Nom absent");
  if (h.price == null) reasons.push("Prix d'achat absent");
  if (!h.sku) reasons.push("Référence (SKU) absente");
  if (h.weightKg == null || !(h.weightKg > 0)) reasons.push("Poids à vérifier");
  for (const m of h.missing ?? []) if (!reasons.some((x) => x.toLowerCase().includes(m.toLowerCase()))) reasons.push(m);
  return { level: qualityFromReasons(reasons).level, reasons };
}

export const QUALITY_LABEL: Record<QualityLevel, string> = { conforme: "🟢 Conforme", a_completer: "🟠 À compléter", bloque: "🔴 Bloqué" };
