import type { Lang } from "./translations";
import { DEFAULT_LANG } from "./translations";

/**
 * Pick the best available translation for a piece of content.
 *
 * - `base` is the canonical text (always French in this project).
 * - `i18n` is a JSONB map { en?: string, ar?: string, ... } stored alongside.
 *
 * Returns the translation for `lang` if non-empty, otherwise the base French
 * value, otherwise an empty string. Numbers, prices, codes and proper nouns
 * must NEVER pass through this helper (they stay as-is).
 */
export function pickI18n(
  base: string | null | undefined,
  i18n: unknown,
  lang: Lang,
): string {
  if (lang !== DEFAULT_LANG && i18n && typeof i18n === "object" && !Array.isArray(i18n)) {
    const v = (i18n as Record<string, unknown>)[lang];
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
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
