// ═══════════════════════════════════════════════════════════════
// MOTEUR DE FRET UNIQUE — Kawzone
//
// Source de vérité pour :
//   1. résoudre les données logistiques d'une ligne (VARIANTE prioritaire,
//      jamais de mélange avec le produit parent) ;
//   2. calculer le CBM (cm → m³, sans erreur d'unité) ;
//   3. calculer le coût de transport SELON L'UNITÉ DU MODE CHOISI
//      (kg ou m³ — jamais les deux, jamais l'un à la place de l'autre) ;
//   4. produire un snapshot complet à figer sur la ligne de commande.
//
// Règle absolue : si la variante porte la moindre donnée logistique,
// on utilise UNIQUEMENT la variante. Sinon on retombe sur le produit.
// Si rien n'est exploitable → `missing`, et AUCUNE valeur inventée.
// ═══════════════════════════════════════════════════════════════

export type BillingUnit = "kg" | "m3";
export type ShippingMode = "air" | "sea" | "road" | "express" | "other";
export type LogisticsSource = "variant" | "product" | "none";

/** Règle tarifaire d'un mode de transport (table `shipping_services`). */
export interface FreightRule {
  id: string;
  name: string;
  mode?: ShippingMode | null;
  /** Unité de facturation : "kg" ou "m3". */
  pricing_unit?: BillingUnit | null;
  price_per_kg?: number | null;
  price_per_cbm?: number | null;
  /** Quantité minimale facturée (en kg ou en m³ selon l'unité). */
  min_billable_qty?: number | null;
  /** Diviseur du poids volumétrique — configurable par service. */
  volumetric_divisor?: number | null;
  /** Le mode applique-t-il le poids volumétrique ? */
  use_volumetric?: boolean | null;
  /** Frais fixes ajoutés une fois par ligne. */
  fixed_fee?: number | null;
}

export interface DimsSource {
  weight_kg?: number | string | null;
  length_cm?: number | string | null;
  width_cm?: number | string | null;
  height_cm?: number | string | null;
}

export interface ItemLogistics {
  weightKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  /** Volume unitaire en m³. */
  cbm: number | null;
  source: LogisticsSource;
  /** Champs manquants pour un calcul fiable. */
  missing: string[];
  hasWeight: boolean;
  hasDims: boolean;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** CBM = L × l × H (cm) ÷ 1 000 000 → m³, arrondi à 6 décimales. */
export function computeCbm(
  lengthCm?: number | string | null,
  widthCm?: number | string | null,
  heightCm?: number | string | null,
): number | null {
  const l = num(lengthCm);
  const w = num(widthCm);
  const h = num(heightCm);
  if (l === null || w === null || h === null) return null;
  return Math.round(((l * w * h) / 1_000_000) * 1e6) / 1e6;
}

const hasAnyLogistics = (s: DimsSource | null | undefined): boolean =>
  !!s &&
  (num(s.weight_kg) !== null ||
    num(s.length_cm) !== null ||
    num(s.width_cm) !== null ||
    num(s.height_cm) !== null);

function build(source: LogisticsSource, s: DimsSource | null | undefined): ItemLogistics {
  const weightKg = num(s?.weight_kg);
  const lengthCm = num(s?.length_cm);
  const widthCm = num(s?.width_cm);
  const heightCm = num(s?.height_cm);
  const cbm = computeCbm(lengthCm, widthCm, heightCm);
  const missing: string[] = [];
  if (weightKg === null) missing.push("poids");
  if (lengthCm === null || widthCm === null || heightCm === null) missing.push("dimensions");
  return {
    weightKg,
    lengthCm,
    widthCm,
    heightCm,
    cbm,
    source,
    missing,
    hasWeight: weightKg !== null,
    hasDims: cbm !== null,
  };
}

/**
 * Résout les données logistiques de la ligne.
 * VARIANTE prioritaire et EXCLUSIVE : dès qu'une variante porte une donnée
 * logistique, on n'emprunte plus rien au produit parent.
 */
export function resolveItemLogistics(
  product: DimsSource | null | undefined,
  variant?: DimsSource | null,
): ItemLogistics {
  if (hasAnyLogistics(variant)) return build("variant", variant);
  if (hasAnyLogistics(product)) return build("product", product);
  return {
    weightKg: null,
    lengthCm: null,
    widthCm: null,
    heightCm: null,
    cbm: null,
    source: "none",
    missing: ["poids", "dimensions"],
    hasWeight: false,
    hasDims: false,
  };
}

/** Unité de facturation effective du service (jamais devinée au hasard). */
export function billingUnitOf(rule: FreightRule): BillingUnit {
  if (rule.pricing_unit === "m3" || rule.pricing_unit === "kg") return rule.pricing_unit;
  return rule.mode === "sea" ? "m3" : "kg";
}

export interface FreightQuote {
  ok: boolean;
  /** Raison lisible quand le calcul est impossible. */
  reason: string | null;
  unit: BillingUnit;
  mode: ShippingMode;
  rate: number | null;
  /** Poids volumétrique total (kg) — 0 si le mode ne l'applique pas. */
  volumetricWeightKg: number;
  /** Poids réel total (kg). */
  realWeightKg: number;
  /** Volume total (m³). */
  totalCbm: number;
  /** Quantité réellement facturée, minimum appliqué inclus. */
  billableQty: number;
  volumetricDivisor: number;
  minBillableQty: number;
  fixedFee: number;
  cost: number;
}

/**
 * Coût de transport d'une ligne.
 * - unité "kg"  → max(poids réel, poids volumétrique si activé) × tarif/kg
 * - unité "m3"  → volume total × tarif/m³  (le tarif au kg n'est JAMAIS utilisé)
 * puis minimum facturable, puis frais fixes.
 */
export function quoteFreight(params: {
  logistics: ItemLogistics;
  quantity: number;
  rule: FreightRule;
}): FreightQuote {
  const { logistics, rule } = params;
  const qty = Math.max(1, Math.trunc(params.quantity || 1));
  const unit = billingUnitOf(rule);
  const mode = (rule.mode ?? (unit === "m3" ? "sea" : "air")) as ShippingMode;
  const divisor = num(rule.volumetric_divisor) ?? 5000;
  const minQty = Number(rule.min_billable_qty ?? 0) || 0;
  const fixedFee = Number(rule.fixed_fee ?? 0) || 0;
  const useVolumetric = rule.use_volumetric !== false && unit === "kg";

  const realWeightKg = (logistics.weightKg ?? 0) * qty;
  const totalCbm = (logistics.cbm ?? 0) * qty;
  const volumetricWeightKg =
    useVolumetric && logistics.lengthCm && logistics.widthCm && logistics.heightCm
      ? (logistics.lengthCm * logistics.widthCm * logistics.heightCm * qty) / divisor
      : 0;

  const base: Omit<FreightQuote, "ok" | "reason" | "cost" | "billableQty"> = {
    unit,
    mode,
    rate: null,
    volumetricWeightKg: Math.round(volumetricWeightKg * 1000) / 1000,
    realWeightKg: Math.round(realWeightKg * 1000) / 1000,
    totalCbm: Math.round(totalCbm * 1e6) / 1e6,
    volumetricDivisor: divisor,
    minBillableQty: minQty,
    fixedFee,
  };

  const fail = (reason: string): FreightQuote => ({
    ...base,
    ok: false,
    reason,
    billableQty: 0,
    cost: 0,
  });

  if (unit === "m3") {
    const rate = num(rule.price_per_cbm);
    if (rate === null) return fail("Tarif au m³ non configuré pour ce mode de transport.");
    if (totalCbm <= 0) return fail("Dimensions manquantes : volume (CBM) impossible à calculer.");
    const billableQty = Math.max(totalCbm, minQty);
    return {
      ...base,
      ok: true,
      reason: null,
      rate,
      billableQty: Math.round(billableQty * 1e6) / 1e6,
      cost: Math.round(billableQty * rate + fixedFee),
    };
  }

  const rate = num(rule.price_per_kg);
  if (rate === null) return fail("Tarif au kg non configuré pour ce mode de transport.");
  const chargeable = Math.max(realWeightKg, base.volumetricWeightKg);
  if (chargeable <= 0) return fail("Poids et dimensions manquants : transport incalculable.");
  const billableQty = Math.max(chargeable, minQty);
  return {
    ...base,
    ok: true,
    reason: null,
    rate,
    billableQty: Math.round(billableQty * 1000) / 1000,
    cost: Math.round(billableQty * rate + fixedFee),
  };
}

/** Snapshot logistique à figer sur `order_items` au moment de la commande. */
export function buildLineSnapshot(params: {
  logistics: ItemLogistics;
  quantity: number;
  quote: FreightQuote | null;
  serviceId: string | null;
  unitPrice: number;
  costPrice?: number | null;
  costCurrency?: string | null;
  costRate?: number | null;
  sku?: string | null;
  variantLabel?: string | null;
}) {
  const { logistics, quantity, quote } = params;
  const freight = quote?.ok ? quote.cost : 0;
  const purchaseUnit = params.costPrice != null ? Number(params.costPrice) : null;
  const rate = params.costRate != null ? Number(params.costRate) : 1;
  return {
    sku_snapshot: params.sku ?? null,
    variant_label_snapshot: params.variantLabel ?? null,
    unit_weight_kg: logistics.weightKg,
    total_weight_kg: logistics.weightKg != null ? logistics.weightKg * quantity : null,
    length_cm_snapshot: logistics.lengthCm,
    width_cm_snapshot: logistics.widthCm,
    height_cm_snapshot: logistics.heightCm,
    unit_cbm: logistics.cbm,
    total_cbm: logistics.cbm != null ? Math.round(logistics.cbm * quantity * 1e6) / 1e6 : null,
    volumetric_weight_kg: quote?.volumetricWeightKg ?? null,
    billable_qty: quote?.ok ? quote.billableQty : null,
    billing_unit: quote?.unit ?? null,
    shipping_mode: quote?.mode ?? null,
    shipping_service_id: params.serviceId,
    shipping_rate_snapshot: quote?.rate ?? null,
    volumetric_divisor_snapshot: quote?.volumetricDivisor ?? null,
    min_billable_qty_snapshot: quote?.minBillableQty ?? null,
    freight_cost: freight,
    logistics_data_missing: logistics.missing.length > 0,
    cost_price_snapshot: purchaseUnit,
    cost_currency_snapshot: params.costCurrency ?? null,
    cost_rate_snapshot: params.costRate ?? null,
    purchase_cost_total:
      purchaseUnit != null ? Math.round(purchaseUnit * rate * quantity) : null,
    line_total: Math.round(params.unitPrice * quantity + freight),
  };
}

export const MODE_LABELS: Record<ShippingMode, string> = {
  air: "Avion",
  sea: "Maritime",
  road: "Routier",
  express: "Express",
  other: "Autre",
};
