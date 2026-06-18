// ═══════════════════════════════════════════════════════════════
// LINE KIND — Source de vérité unique des 3 catégories de ligne.
//
// Chaque ligne de panier / order_item appartient à exactement UNE
// de ces 3 catégories. Toute la logique métier (panier, checkout,
// sous-commandes, workflow, finances) doit s'aligner dessus.
//
//   LOCAL                  : vendor.source_country = destination
//                            → JAMAIS de fret, JAMAIS de pesée.
//   IMPORT_KNOWN_WEIGHT    : international + product.weight_kg > 0
//                            → fret FIGÉ au checkout, payé une fois,
//                              vérification poids interne uniquement.
//   IMPORT_UNKNOWN_WEIGHT  : international + (weight null OR <= 0)
//                            → fret CALCULÉ APRÈS pesée, paiement
//                              complémentaire client.
//
// La catégorie est figée au checkout dans
// `order_items.customization.__line_kind` pour rester immuable même
// si le poids du produit change après la commande.
// ═══════════════════════════════════════════════════════════════

export type LineKind = "LOCAL" | "IMPORT_KNOWN_WEIGHT" | "IMPORT_UNKNOWN_WEIGHT";

export const LINE_KIND_LABELS: Record<LineKind, string> = {
  LOCAL: "Local",
  IMPORT_KNOWN_WEIGHT: "Import · poids déclaré",
  IMPORT_UNKNOWN_WEIGHT: "Import · poids inconnu",
};

export const LINE_KIND_SHORT: Record<LineKind, string> = {
  LOCAL: "Local",
  IMPORT_KNOWN_WEIGHT: "Poids déclaré",
  IMPORT_UNKNOWN_WEIGHT: "Poids inconnu",
};

/** Classes Tailwind statiques (compatibles purge). */
export const LINE_KIND_BADGE: Record<LineKind, string> = {
  LOCAL: "bg-emerald-100 text-emerald-800 border-emerald-200",
  IMPORT_KNOWN_WEIGHT: "bg-blue-100 text-blue-800 border-blue-200",
  IMPORT_UNKNOWN_WEIGHT: "bg-orange-100 text-orange-800 border-orange-200",
};

export interface LineKindContext {
  destinationCountryId: string | null | undefined;
  vendorSourceCountryId: string | null | undefined;
  productWeightKg: number | null | undefined;
}

export function getLineKind(ctx: LineKindContext): LineKind {
  const src = ctx.vendorSourceCountryId ?? null;
  const dst = ctx.destinationCountryId ?? null;
  // Pas d'info de pays vendeur → on traite comme local (zero fret, zero pesée).
  if (!src || !dst || src === dst) return "LOCAL";
  const w = Number(ctx.productWeightKg ?? 0);
  return w > 0 ? "IMPORT_KNOWN_WEIGHT" : "IMPORT_UNKNOWN_WEIGHT";
}

/** Helper panier : item enrichi avec `products.profiles.source_country_id`. */
export function getCartItemLineKind(
  item: any,
  destinationCountryId: string | null | undefined,
): LineKind {
  return getLineKind({
    destinationCountryId,
    vendorSourceCountryId: item?.products?.profiles?.source_country_id ?? null,
    productWeightKg: item?.products?.weight_kg ?? null,
  });
}

/** Lit la catégorie figée au checkout sur un order_item, avec fallback de calcul. */
export function readOrderItemLineKind(
  item: { customization?: any; quantity?: number },
  fallback?: LineKindContext,
): LineKind {
  const stamped = item?.customization?.__line_kind as LineKind | undefined;
  if (stamped === "LOCAL" || stamped === "IMPORT_KNOWN_WEIGHT" || stamped === "IMPORT_UNKNOWN_WEIGHT") {
    return stamped;
  }
  if (fallback) return getLineKind(fallback);
  return "LOCAL";
}

/** Clé stable d'une sous-commande dans la table `sub_order_states` et `order_shipment_assessments`. */
export function subOrderKey(vendorId: string | null | undefined, kind: LineKind): string {
  return `${vendorId ?? "unknown"}::${kind}`;
}

export function parseSubOrderKey(key: string | null | undefined): { vendorId: string | null; kind: LineKind | null } {
  if (!key) return { vendorId: null, kind: null };
  const [v, k] = key.split("::");
  const kind = (k === "LOCAL" || k === "IMPORT_KNOWN_WEIGHT" || k === "IMPORT_UNKNOWN_WEIGHT") ? k : null;
  return { vendorId: v || null, kind };
}
