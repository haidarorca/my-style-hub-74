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

export function buildTrackedUrl(baseUrl: string, platform: SharePlatform): string {
  try {
    const u = new URL(baseUrl);
    u.searchParams.set("ref", "share");
    u.searchParams.set("via", platform);
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
    case "email":
      return `mailto:?subject=${encodeURIComponent("Découverte KawZone")}&body=${m}`;
    case "sms":
      return `sms:?body=${m}`;
    default:
      return url;
  }
}
