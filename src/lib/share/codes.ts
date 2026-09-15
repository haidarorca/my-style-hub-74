// ═══════════════════════════════════════════════════════════════
// Génération de codes courts base62 pour les liens de partage.
// Module isomorphe (pas de secret, pas d'API navigateur).
// ═══════════════════════════════════════════════════════════════

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function generateShareCode(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

/** Hash stable court, utilisé pour invalider le cache des aperçus sociaux. */
export function versionHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
