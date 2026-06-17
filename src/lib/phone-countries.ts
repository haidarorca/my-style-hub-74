export type Country = {
  code: string;       // ISO
  name: string;
  dial: string;       // without +
  flag: string;
  example: string;    // local example without dial
};

export const COUNTRIES: Country[] = [
  { code: "SN", name: "Sénégal",         dial: "221", flag: "🇸🇳", example: "77 123 45 67" },
  { code: "CI", name: "Côte d'Ivoire",   dial: "225", flag: "🇨🇮", example: "07 00 00 00 00" },
  { code: "ML", name: "Mali",            dial: "223", flag: "🇲🇱", example: "70 00 00 00" },
  { code: "BF", name: "Burkina Faso",    dial: "226", flag: "🇧🇫", example: "70 00 00 00" },
  { code: "GN", name: "Guinée",          dial: "224", flag: "🇬🇳", example: "620 00 00 00" },
  { code: "TG", name: "Togo",            dial: "228", flag: "🇹🇬", example: "90 00 00 00" },
  { code: "BJ", name: "Bénin",           dial: "229", flag: "🇧🇯", example: "90 00 00 00" },
  { code: "NE", name: "Niger",           dial: "227", flag: "🇳🇪", example: "90 00 00 00" },
  { code: "CM", name: "Cameroun",        dial: "237", flag: "🇨🇲", example: "6 90 00 00 00" },
  { code: "GA", name: "Gabon",           dial: "241", flag: "🇬🇦", example: "06 00 00 00" },
  { code: "CG", name: "Congo",           dial: "242", flag: "🇨🇬", example: "06 000 0000" },
  { code: "CD", name: "RD Congo",        dial: "243", flag: "🇨🇩", example: "81 000 0000" },
  { code: "MA", name: "Maroc",           dial: "212", flag: "🇲🇦", example: "6 12 34 56 78" },
  { code: "DZ", name: "Algérie",         dial: "213", flag: "🇩🇿", example: "5 51 23 45 67" },
  { code: "TN", name: "Tunisie",         dial: "216", flag: "🇹🇳", example: "20 123 456" },
  { code: "FR", name: "France",          dial: "33",  flag: "🇫🇷", example: "6 12 34 56 78" },
  { code: "BE", name: "Belgique",        dial: "32",  flag: "🇧🇪", example: "470 12 34 56" },
];

export const DEFAULT_COUNTRY_CODE = "SN";

export function getCountryByDial(dial: string): Country | undefined {
  return COUNTRIES.find((c) => c.dial === dial);
}

export function getCountryByCode(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

/** Split an E.164-ish number "221771234567" into { dial, local }. */
export function splitPhone(full: string, fallbackCode = DEFAULT_COUNTRY_CODE): { code: string; local: string } {
  const digits = (full || "").replace(/\D/g, "");
  if (!digits) return { code: fallbackCode, local: "" };
  // Try matching longest dial first (3 then 2 digits)
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (digits.startsWith(c.dial)) {
      return { code: c.code, local: digits.slice(c.dial.length) };
    }
  }
  return { code: fallbackCode, local: digits };
}

/** Combine a country + local digits into a clean E.164 (no +). */
export function joinPhone(countryCode: string, local: string): string {
  const c = getCountryByCode(countryCode);
  const digits = (local || "").replace(/\D/g, "");
  if (!c || !digits) return "";
  return c.dial + digits;
}
