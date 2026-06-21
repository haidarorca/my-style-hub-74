// ═══════════════════════════════════════════════════════════════
// WARRANTY — Helpers pour la garantie produit (stockée en jours)
// ═══════════════════════════════════════════════════════════════

export interface WarrantyPreset {
  value: number; // jours
  label: string;
}

export const WARRANTY_PRESETS: WarrantyPreset[] = [
  { value: 7, label: "7 jours" },
  { value: 30, label: "30 jours" },
  { value: 90, label: "3 mois" },
  { value: 180, label: "6 mois" },
  { value: 365, label: "1 an" },
  { value: 730, label: "2 ans" },
];

/** Convertit un nombre de jours en libellé court : « 6 mois », « 1 an »… */
export function warrantyLabel(days: number | null | undefined): string | null {
  if (days == null || !Number.isFinite(Number(days)) || Number(days) <= 0) return null;
  const d = Math.round(Number(days));
  const preset = WARRANTY_PRESETS.find((p) => p.value === d);
  if (preset) return preset.label;
  if (d % 365 === 0) {
    const y = d / 365;
    return y === 1 ? "1 an" : `${y} ans`;
  }
  if (d % 30 === 0) {
    const m = d / 30;
    return m === 1 ? "1 mois" : `${m} mois`;
  }
  return d === 1 ? "1 jour" : `${d} jours`;
}

/** Vrai si la valeur saisie correspond à un preset connu. */
export function isWarrantyPreset(days: number | null | undefined): boolean {
  if (days == null) return false;
  return WARRANTY_PRESETS.some((p) => p.value === Number(days));
}
