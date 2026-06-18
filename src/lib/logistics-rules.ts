// ═══════════════════════════════════════════════════════════════
// RÈGLES LOGISTIQUES UNIQUES — Kawzone
//
// Source de vérité pour décider :
//   - si un article doit emprunter le circuit international (pesée, fret)
//   - si on peut afficher une estimation de transport au client
//   - si le produit déclenche le circuit "calcul après pesée"
//
// Les anciennes règles basées sur `requires_international_shipping` et
// `vendor_mode === 'commission'` sont obsolètes.
//
// Règle unique :
//   is_international   = destination_country_id ≠ vendor.source_country_id
//   needs_weighing     = is_international ET product.weight_kg IS NULL
//   can_estimate_ship  = is_international ET product.weight_kg IS NOT NULL
//
// Cas local (source = destination) → JAMAIS de circuit pesée, JAMAIS d'import.
// Cas international + poids connu  → estimation transport disponible.
// Cas international + poids inconnu → "Transport calculé après réception et pesée".
// ═══════════════════════════════════════════════════════════════

export interface LogisticsProduct {
  weight_kg?: number | null;
  vendor?: { source_country_id?: string | null } | null;
}

export interface LogisticsContext {
  destinationCountryId: string | null | undefined;
  vendorSourceCountryId: string | null | undefined;
  productWeightKg: number | null | undefined;
}

export function isInternational(ctx: LogisticsContext): boolean {
  if (!ctx.destinationCountryId) return false;
  if (!ctx.vendorSourceCountryId) return false;
  return ctx.destinationCountryId !== ctx.vendorSourceCountryId;
}

/** Le colis devra passer par le hub pour pesée et calcul des frais. */
export function needsWeighing(ctx: LogisticsContext): boolean {
  return isInternational(ctx) && (ctx.productWeightKg == null || ctx.productWeightKg <= 0);
}

/** Le client peut voir une estimation transport (poids déclaré par le vendeur). */
export function canEstimateShipping(ctx: LogisticsContext): boolean {
  return isInternational(ctx) && !!ctx.productWeightKg && ctx.productWeightKg > 0;
}

/** Helper panier : prend un item enrichi (products.profiles.source_country_id). */
export function itemNeedsWeighing(item: any, destinationCountryId: string | null | undefined): boolean {
  return needsWeighing({
    destinationCountryId,
    vendorSourceCountryId: item?.products?.profiles?.source_country_id ?? null,
    productWeightKg: item?.products?.weight_kg ?? null,
  });
}

export function itemIsInternational(item: any, destinationCountryId: string | null | undefined): boolean {
  return isInternational({
    destinationCountryId,
    vendorSourceCountryId: item?.products?.profiles?.source_country_id ?? null,
    productWeightKg: item?.products?.weight_kg ?? null,
  });
}
