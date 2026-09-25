import type { Lang } from "./translations";
import { DEFAULT_LANG } from "./translations";

/**
 * Pick the best available translation for a piece of content.
 *
 * - `base` is the ORIGINAL text, in whatever language the source used
 *   (English/Chinese for CJ imports, French for local products…).
 * - `i18n` is a JSONB map { fr?, en?, ar?, ... } filled by the translation center.
 *
 * Returns the translation for `lang` (French included) if non-empty,
 * otherwise the original text. Numbers, prices, codes and proper nouns
 * must NEVER pass through this helper.
 */
export function pickI18n(
  base: string | null | undefined,
  i18n: unknown,
  lang: Lang,
): string {
  if (i18n && typeof i18n === "object" && !Array.isArray(i18n)) {
    const v = (i18n as Record<string, unknown>)[lang];
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  void DEFAULT_LANG;
  return (base ?? "").toString();
}

/** Same as pickI18n but tolerates the value missing entirely. */
export function pickI18nOr(
  base: string | null | undefined,
  i18n: unknown,
  lang: Lang,
  fallback: string,
): string {
  const v = pickI18n(base, i18n, lang);
  return v.trim().length > 0 ? v : fallback;
}
