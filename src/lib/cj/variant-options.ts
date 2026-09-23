// ═══════════════════════════════════════════════════════════════
// Orientation des options de variantes fournisseur.
//
// CJ renvoie une clé de variante libre (`variantKey`), par exemple
// « All Black-43 » ou « 43-All Black ». L'ordre des dimensions n'est
// PAS garanti : on ne suppose jamais que la première valeur est la
// taille. On reconnaît la valeur qui EST une taille (pointure,
// S/M/L/XL, 2XL, 38.5, EU 40…) et l'autre valeur devient la
// couleur / le modèle.
// ═══════════════════════════════════════════════════════════════

const LETTER_SIZES = new Set([
  "xxxs", "xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl", "xxxxl",
  "2xl", "3xl", "4xl", "5xl", "6xl",
  "one size", "onesize", "free size", "freesize",
]);

/** La valeur ressemble-t-elle à une taille (et non à une couleur) ? */
export function looksLikeSize(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  if (LETTER_SIZES.has(v)) return true;
  // Pointures / tailles numériques : 35, 38.5, 40,5, « EU 42 », « US 9 »
  const numeric = v.replace(/^(eu|us|uk|fr|cn|jp)\s*/i, "").replace(",", ".");
  if (/^\d{1,3}(\.\d)?$/.test(numeric)) return true;
  // Tailles composées : « 2XL », « XL/XXL », « 90B »
  if (/^\d{1,2}\s?(x{1,3}l|xs|s|m|l)$/i.test(v)) return true;
  return false;
}

/**
 * Découpe une clé de variante fournisseur en { size, color } en
 * détectant réellement quelle partie est la taille.
 */
export function parseVariantKey(key: unknown): { size: string | null; color: string | null } {
  if (typeof key !== "string" || !key.trim()) return { size: null, color: null };
  const parts = key.split("-").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { size: null, color: null };
  if (parts.length === 1) {
    const only = parts[0]!;
    return looksLikeSize(only) ? { size: only, color: null } : { size: null, color: only };
  }

  const sizeIdx = parts.findIndex((p) => looksLikeSize(p));
  if (sizeIdx >= 0) {
    const size = parts[sizeIdx]!;
    const color = parts.filter((_, i) => i !== sizeIdx).join("-");
    return { size, color: color || null };
  }

  // Aucune partie reconnue comme taille : on conserve l'ordre fournisseur
  // (première = taille) sans rien inventer.
  return { size: parts[0] ?? null, color: parts.slice(1).join("-") || null };
}

/**
 * Options réelles d'une variante CJ, à partir des NOMS de dimensions
 * fournis par CJ (`productKeyEn`, ex. « Color-Size ») et des VALEURS de
 * la variante (`variantKey`, ex. « Red-43 »), dans le même ordre.
 * Aucune valeur n'est réécrite. `size` = dimension nommée « …size… » ;
 * `color` = valeurs des autres dimensions (Color, Style, Quantity…),
 * telles quelles. Si l'appariement est ambigu, la clé brute est conservée.
 */
export function parseCjVariantOptions(
  productKeyEn: unknown,
  variantKey: unknown,
): { size: string | null; color: string | null; options: Record<string, string> | null } {
  const key = typeof variantKey === "string" ? variantKey.trim() : "";
  if (!key) return { size: null, color: null, options: null };
  const names = typeof productKeyEn === "string" && productKeyEn.trim()
    ? productKeyEn.split("-").map((s) => s.trim()).filter(Boolean)
    : [];
  const isSize = (n: string) => /size|尺码|尺寸|码/i.test(n);
  let values = key.split("-").map((s) => s.trim()).filter(Boolean);

  if (names.length === 1) values = [key];
  if (names.length && names.length < values.length && names.length > 1) {
    // Une valeur contient un tiret (« All-Black-44 ») : on regroupe dans la
    // dimension non-taille, la taille restant la valeur isolée à sa position.
    const sizeIdx = names.findIndex(isSize);
    if (names.length === 2 && sizeIdx >= 0) {
      values = sizeIdx === 0
        ? [values[0]!, values.slice(1).join("-")]
        : [values.slice(0, -1).join("-"), values[values.length - 1]!];
    }
  }
  if (names.length && names.length === values.length) {
    const options: Record<string, string> = {};
    names.forEach((n, i) => { options[n] = values[i]!; });
    const sIdx = names.findIndex(isSize);
    const size = sIdx >= 0 ? values[sIdx]! : null;
    const rest = values.filter((_, i) => i !== sIdx).join(" / ");
    return { size, color: rest || null, options };
  }
  // Ambigu ou noms absents : rien n'est deviné, la clé est gardée entière.
  return { size: null, color: key, options: { Option: key } };
}
