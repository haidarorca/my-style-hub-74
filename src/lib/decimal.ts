// ═══════════════════════════════════════════════════════════════
// Saisie de nombres décimaux — virgule française OU point.
// « 5,09 » et « 5.09 » donnent tous deux 5.09. Aucun arrondi.
// ═══════════════════════════════════════════════════════════════

/** Nettoie une saisie utilisateur : garde chiffres, séparateur décimal, signe. */
export function normalizeDecimalInput(raw: string): string {
  let s = String(raw ?? "").replace(/\s/g, "").replace(/,/g, ".");
  // On ne conserve que le premier point décimal.
  const first = s.indexOf(".");
  if (first !== -1) {
    s = s.slice(0, first + 1) + s.slice(first + 1).replace(/\./g, "");
  }
  return s.replace(/[^0-9.\-]/g, "");
}

/** Convertit une saisie en nombre, ou null si vide/invalide. Jamais d'arrondi. */
export function parseDecimal(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = normalizeDecimalInput(String(raw)).trim();
  if (!s || s === "." || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
