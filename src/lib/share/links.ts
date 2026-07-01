// ═══════════════════════════════════════════════════════════════
// Deep links + tracking params pour le Centre de partage KawZone.
// ═══════════════════════════════════════════════════════════════

export type SharePlatform =
  | "whatsapp"
  | "facebook"
  | "messenger"
  | "telegram"
  | "twitter"
  | "instagram"
  | "email"
  | "sms"
  | "copy"
  | "native";

/**
 * Version stamp par défaut : YYYYMMDD.
 * → Nouvelle URL chaque jour ⇒ WhatsApp / Facebook / Telegram refont un scrape
 *   et récupèrent les balises Open Graph à jour (image, titre, prix, promo).
 *   Même jour = même URL = cache réutilisé (pas de scrape inutile).
 */
export function currentShareVersion(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function buildTrackedUrl(
  baseUrl: string,
  platform: SharePlatform,
  opts: { forceRefresh?: boolean } = {},
): string {
  try {
    const u = new URL(baseUrl);
    u.searchParams.set("ref", "share");
    u.searchParams.set("via", platform);
    // Cache-buster OG : force les crawlers à refaire un scrape.
    u.searchParams.set("v", opts.forceRefresh ? String(Date.now()) : currentShareVersion());
    return u.toString();
  } catch {
    return baseUrl;
  }
}

export function productUrl(productId: string): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://kawzone.com";
  return `${origin}/product/${productId}`;
}

export function shareLinkFor(platform: SharePlatform, url: string, message: string): string {
  const u = encodeURIComponent(url);
  const m = encodeURIComponent(message);
  switch (platform) {
    case "whatsapp":
      return `https://wa.me/?text=${m}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case "messenger":
      // Web fallback (Messenger app deep link requires FB app id)
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case "telegram":
      return `https://t.me/share/url?url=${u}&text=${m}`;
    case "twitter":
      return `https://twitter.com/intent/tweet?url=${u}&text=${m}`;
    case "instagram":
      // Instagram n'accepte pas d'URL pré-remplie. On ouvre l'app / le site,
      // la légende est copiée séparément et le visuel Story est téléchargé.
      return `https://www.instagram.com/`;
    case "email":
      return `mailto:?subject=${encodeURIComponent("Découverte KawZone")}&body=${m}`;
    case "sms":
      return `sms:?body=${m}`;
    default:
      return url;
  }
}
