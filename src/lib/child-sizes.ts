// ═══════════════════════════════════════════════════════════════
// Tailles enfants : correspondance stature (norme chinoise, en cm) et
// formats US (2T, 6M…) vers une tranche d'âge lisible.
//
// Aucune donnée fournisseur n'est réécrite : ces libellés servent
// UNIQUEMENT à l'affichage, en complément de la valeur d'origine.
// ═══════════════════════════════════════════════════════════════

/** Stature en cm → tranche d'âge usuelle (grilles vêtements enfants). */
const HEIGHT_AGE: Array<[number, string]> = [
  [50, "0-1 mois"],
  [59, "1-3 mois"],
  [66, "3-6 mois"],
  [73, "6-9 mois"],
  [80, "9-12 mois"],
  [90, "1,5-2 ans"],
  [100, "3-4 ans"],
  [110, "4-5 ans"],
  [120, "6-7 ans"],
  [130, "8-9 ans"],
  [140, "10-11 ans"],
  [150, "12-13 ans"],
  [160, "13-14 ans"],
  [170, "14-15 ans"],
];

function fromHeight(cm: number): string | null {
  if (!Number.isFinite(cm) || cm < 45 || cm > 175) return null;
  let best: [number, string] | null = null;
  let bestDelta = Infinity;
  for (const entry of HEIGHT_AGE) {
    const d = Math.abs(entry[0] - cm);
    if (d < bestDelta) {
      bestDelta = d;
      best = entry;
    }
  }
  // Tolérance : on n'annote que si la stature colle vraiment à un palier.
  return best && bestDelta <= 5 ? best[1] : null;
}

/**
 * Indice d'âge pour une valeur de taille enfant.
 * Retourne null quand la valeur n'est pas une taille enfant reconnue
 * (on n'invente jamais de correspondance).
 */
export function childSizeHint(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase().replace(",", ".");

  // « 80cm », « 80 cm », « 120CM »
  const cm = v.match(/^(\d{2,3})\s*cm$/);
  if (cm) return fromHeight(Number(cm[1]));

  // Stature nue fréquente chez CJ : 80, 90, 100… 160
  const bare = v.match(/^(\d{2,3})$/);
  if (bare) {
    const n = Number(bare[1]);
    if (n >= 50 && n <= 170 && n % 10 === 0) return fromHeight(n);
    if (n === 59 || n === 66 || n === 73) return fromHeight(n);
    return null;
  }

  // Format US en mois : 3M, 6M, 12M, 18M, 24M
  const months = v.match(/^(\d{1,2})\s*m$/);
  if (months) {
    const n = Number(months[1]);
    if (n >= 1 && n <= 36) return n >= 12 ? `${Math.round(n / 12)} an${n >= 24 ? "s" : ""}` : `${n} mois`;
    return null;
  }

  // Format US en années : 2T, 3T, 4T… ou 5Y, 6Y
  const years = v.match(/^(\d{1,2})\s*(t|y)$/);
  if (years) {
    const n = Number(years[1]);
    if (n >= 1 && n <= 16) return `${n} an${n > 1 ? "s" : ""}`;
    return null;
  }

  return null;
}

/** Valeur d'origine enrichie : « 120cm (6-7 ans) ». */
export function childSizeLabel(value: string, enabled: boolean): string {
  if (!enabled) return value;
  const hint = childSizeHint(value);
  return hint ? `${value} (${hint})` : value;
}
