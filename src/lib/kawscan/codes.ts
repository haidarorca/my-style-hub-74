const ALPHABET = "0123456789";

/** Code interne unique et court, lisible par un scanner (numérique). */
export function generateInternalCode(prefix = "KS"): string {
  const stamp = Date.now().toString().slice(-8);
  let rand = "";
  for (let i = 0; i < 4; i++) rand += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `${prefix}${stamp}${rand}`;
}

/** Slug public permanent d'un magasin. */
export function generateStoreSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || "magasin"}-${suffix}`;
}

export function isEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const sum = digits.slice(0, 12).reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

export function normalizeCode(code: string): string {
  return code.trim();
}

/** Type de code-barres jsBarcode adapté à la valeur. */
export function barcodeFormatFor(code: string): "EAN13" | "EAN8" | "UPC" | "CODE128" {
  if (/^\d{13}$/.test(code)) return "EAN13";
  if (/^\d{8}$/.test(code)) return "EAN8";
  if (/^\d{12}$/.test(code)) return "UPC";
  return "CODE128";
}

export function storeScanUrl(slug: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://kawzone.com";
  return `${origin}/kawscan/store/${slug}`;
}
