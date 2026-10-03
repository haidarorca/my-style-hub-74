// Coût estimé d'arrivée à Dakar — uniquement à partir de données réelles.
// Fret KawZone : avion 8 000 FCFA/kg, rapide 10 000 FCFA/kg, sans minimum ni frais fixes.
// Poids facturé = MAX(poids réel, L×l×H/5000). Aucune donnée inventée : chaque manque est signalé.

export const FREIGHT_RATES = { avion: 8000, rapide: 10000 } as const;

export interface LandedInput { priceUsd: number | null | undefined; weightKg: number | null | undefined; lengthCm?: number | null; widthCm?: number | null; heightCm?: number | null; usdToXof: number | null | undefined }
export interface LandedResult {
  priceXof: number | null; chargeableKg: number | null; volumetricKg: number | null;
  freightAvion: number | null; freightRapide: number | null; totalAvion: number | null; totalRapide: number | null;
  missing: string[];
}

export function landedCost(i: LandedInput): LandedResult {
  const missing: string[] = [];
  const rate = i.usdToXof && i.usdToXof > 0 ? i.usdToXof : null;
  if (!rate) missing.push("Taux USD → FCFA non configuré");
  if (i.priceUsd == null) missing.push("Prix CJ");
  const real = i.weightKg != null && i.weightKg > 0 ? i.weightKg : null;
  if (!real) missing.push("Poids");
  const dims = [i.lengthCm, i.widthCm, i.heightCm];
  const vol = dims.every((d) => d != null && d > 0) ? (dims[0]! * dims[1]! * dims[2]!) / 5000 : null;
  if (vol == null) missing.push("Dimensions (poids volumétrique non vérifié)");
  const chargeable = real != null ? Math.max(real, vol ?? 0) : null;
  const priceXof = rate && i.priceUsd != null ? Math.round(i.priceUsd * rate) : null;
  const fa = chargeable != null ? Math.round(chargeable * FREIGHT_RATES.avion) : null;
  const fr = chargeable != null ? Math.round(chargeable * FREIGHT_RATES.rapide) : null;
  return {
    priceXof, chargeableKg: chargeable, volumetricKg: vol,
    freightAvion: fa, freightRapide: fr,
    totalAvion: priceXof != null && fa != null ? priceXof + fa : null,
    totalRapide: priceXof != null && fr != null ? priceXof + fr : null,
    missing,
  };
}

export const fcfa = (n: number | null | undefined) => n == null ? "Donnée manquante" : `${n.toLocaleString("fr-FR")} FCFA`;
