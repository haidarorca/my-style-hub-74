// ═══════════════════════════════════════════════════════════════
// RÈGLES LOGISTIQUES UNIQUES — Kawzone
//
// Source de vérité pour décider :
//   - si un article doit emprunter le circuit international (pesée, fret)
//   - si on peut afficher une estimation de transport au client
//   - si le produit déclenche le circuit "calcul après pesée"
//   - quel statut de poids attribuer (inconnu / déclaré / vérifié)
//
// Règle internationale :
//   is_international   = destination_country_id ≠ vendor.source_country_id
//   needs_weighing     = is_international ET product.weight_kg IS NULL
//   can_estimate_ship  = is_international ET product.weight_kg IS NOT NULL
//
// Statut de poids (cockpit + UI) :
//   "unknown"  : poids non renseigné par le vendeur → workflow pesée classique
//   "declared" : poids renseigné par le vendeur, pas encore vérifié par l'agent
//   "verified" : poids réel mesuré par l'agent (ou validé conforme au déclaré)
//
// Cas local (source = destination) → JAMAIS de circuit pesée, JAMAIS d'import.
// ═══════════════════════════════════════════════════════════════

export type WeightStatus = "unknown" | "declared" | "verified" | "anomaly";

/** Tolérance par défaut entre poids déclaré et poids réel mesuré. */
export const WEIGHT_TOLERANCE_PCT = 0.10;
export const WEIGHT_TOLERANCE_KG = 0.5;

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

// ───────────────────────── Estimation transport ─────────────────────────

export interface CartItemDims {
  weight_kg: number | null | undefined;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  quantity: number;
}

/** Poids volumétrique standard fret aérien : L×W×H / 5000 (cm → kg). */
export function volumetricWeight(length_cm?: number | null, width_cm?: number | null, height_cm?: number | null): number {
  const l = Number(length_cm ?? 0);
  const w = Number(width_cm ?? 0);
  const h = Number(height_cm ?? 0);
  if (l <= 0 || w <= 0 || h <= 0) return 0;
  return (l * w * h) / 5000;
}

/** Poids facturable = max(réel, volumétrique). */
export function chargeableWeight(item: CartItemDims): number {
  const real = Number(item.weight_kg ?? 0);
  const vol = volumetricWeight(item.length_cm, item.width_cm, item.height_cm);
  return Math.max(real, vol);
}

/**
 * Estimation transport pour une liste d'items partageant le même service.
 * Retourne null si certains items n'ont pas de poids déclaré (impossible d'estimer).
 */
export function estimateShipping(
  items: CartItemDims[],
  pricePerKg: number | null | undefined,
): number | null {
  if (!pricePerKg || pricePerKg <= 0) return null;
  let total = 0;
  for (const it of items) {
    const w = chargeableWeight(it);
    if (w <= 0) return null; // un seul item sans poids → pas d'estimation fiable
    total += w * (it.quantity ?? 1);
  }
  return Math.round(total * Number(pricePerKg));
}

// ───────────────────────── Statut de poids (cockpit) ─────────────────────────

export interface WeightStatusInput {
  /** Poids réel mesuré côté entrepôt. */
  realWeightKg?: number | null;
  /** Poids déclaré par le vendeur (somme des items). */
  declaredWeightKg?: number | null;
  /** Indique que le colis est international. */
  isInternational?: boolean;
}

export function getWeightStatus(input: WeightStatusInput): WeightStatus {
  if (!input.isInternational) return "verified";
  const real = Number(input.realWeightKg ?? 0);
  const declared = Number(input.declaredWeightKg ?? 0);
  if (real > 0 && declared > 0 && !isWeightConsistent(declared, real)) return "anomaly";
  if (real > 0) return "verified";
  if (declared > 0) return "declared";
  return "unknown";
}

export function weightStatusLabel(s: WeightStatus): string {
  switch (s) {
    case "verified": return "Poids vérifié";
    case "declared": return "Poids déclaré";
    case "unknown":  return "Poids inconnu";
    case "anomaly":  return "Anomalie poids";
    default:         return "Poids";
  }
}

/** Classes Tailwind statiques (compatible purge). */
export function weightStatusBadgeClass(s: WeightStatus): string {
  switch (s) {
    case "verified": return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "declared": return "bg-blue-100 text-blue-700 border-blue-200";
    case "unknown":  return "bg-amber-100 text-amber-700 border-amber-200";
    case "anomaly":  return "bg-red-100 text-red-700 border-red-300";
    default:         return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

/** Tolérance : un écart ≤ 10% (et ≤ 0.5 kg) entre déclaré et réel est considéré conforme. */
export function isWeightConsistent(declaredKg: number | null | undefined, realKg: number | null | undefined): boolean {
  const d = Number(declaredKg ?? 0);
  const r = Number(realKg ?? 0);
  if (d <= 0 || r <= 0) return false;
  const diff = Math.abs(d - r);
  return diff <= Math.max(WEIGHT_TOLERANCE_KG, d * WEIGHT_TOLERANCE_PCT);
}

/** Détails d'anomalie pour affichage UI (banner agent + cockpit). */
export interface WeightAnomalyInfo {
  isAnomaly: boolean;
  diffKg: number;
  diffPct: number; // signé : positif = réel > déclaré
}

export function getWeightAnomaly(
  declaredKg: number | null | undefined,
  realKg: number | null | undefined,
): WeightAnomalyInfo {
  const d = Number(declaredKg ?? 0);
  const r = Number(realKg ?? 0);
  if (d <= 0 || r <= 0) return { isAnomaly: false, diffKg: 0, diffPct: 0 };
  const diffKg = r - d;
  const diffPct = diffKg / d;
  return { isAnomaly: !isWeightConsistent(d, r), diffKg, diffPct };
}

