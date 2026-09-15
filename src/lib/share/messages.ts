// ═══════════════════════════════════════════════════════════════
// Messages de partage adaptés par plateforme — style marketplace pro.
// ═══════════════════════════════════════════════════════════════

import type { SharePlatform } from "./links";

export interface ShareProduct {
  name: string;
  priceLabel: string;
  oldPriceLabel?: string | null;
  promoLabel?: string | null;
  url: string;
  shopName?: string | null;
  originType?: "local" | "import" | null;
  originLabel?: string | null;
}

/** Plafond de caractères par plateforme (lien inclus). */
export const MESSAGE_LIMITS: Record<string, number> = {
  whatsapp: 600,
  telegram: 500,
  twitter: 280,
  linkedin: 600,
  instagram: 700,
  email: 900,
  sms: 300,
  facebook: 200,
  messenger: 200,
  copy: 400,
  native: 300,
};

/** Coupe le nom d'un produit sans casser un mot. */
export function shortName(name: string, max = 70): string {
  const clean = name.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 30 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/**
 * Plafonne un message en gardant impérativement l'URL à la fin.
 * On rogne le corps du texte, jamais le lien.
 */
export function capMessage(message: string, url: string, limit: number): string {
  if (message.length <= limit) return message;
  const tail = `\n${url}`;
  const room = Math.max(0, limit - tail.length - 1);
  const body = message.split(url).join("").trim().slice(0, room).trim();
  return `${body}${tail}`;
}

/** Légende ultra-courte accompagnant une image partagée (Story / Statut). */
export function buildImageCaption(p: ShareProduct): string {
  return `${shortName(p.name, 50)} — ${p.priceLabel}\n${p.url}`;
}

export function buildShareMessage(p: ShareProduct, platform: SharePlatform): string {
  return capMessage(
    buildRawShareMessage({ ...p, name: shortName(p.name) }, platform),
    p.url,
    MESSAGE_LIMITS[platform] ?? 400,
  );
}

function buildRawShareMessage(p: ShareProduct, platform: SharePlatform): string {
  const promo = p.promoLabel ? ` (${p.promoLabel})` : "";
  const old = p.oldPriceLabel ? ` ~${p.oldPriceLabel}~` : "";
  const shop = p.shopName ? `\n🏪 ${p.shopName}` : "";
  const originTag =
    p.originType === "import"
      ? `\n🌐 Produit importé${p.originLabel ? ` (${p.originLabel})` : ""}`
      : p.originType === "local"
      ? "\n🇸🇳 Produit local"
      : "";

  switch (platform) {
    case "whatsapp":
      return [
        `🛍️ *${p.name}*`,
        ``,
        `💰 *${p.priceLabel}*${promo}${old}`,
        `${shop}${originTag}`,
        ``,
        `✅ Paiement sécurisé`,
        `🚚 Livraison KawZone`,
        ``,
        `👉 *Acheter maintenant :*`,
        `${p.url}`,
        ``,
        `_KawZone — la marketplace du Sénégal_`,
      ].join("\n").replace(/\n{3,}/g, "\n\n");
    case "telegram":
      return `🛍️ ${p.name}\n💰 ${p.priceLabel}${promo}${old}${shop}${originTag}\n\n👉 ${p.url}`;
    case "twitter": {
      const base = `${p.name} — ${p.priceLabel}${promo} sur KawZone 🛍️`;
      return base.length > 240 ? `${base.slice(0, 200)}…\n${p.url}` : `${base}\n${p.url}`;
    }
    case "email":
      return [
        `Bonjour,`,
        ``,
        `Je voulais te faire découvrir ce produit sur KawZone :`,
        ``,
        `${p.name}`,
        `Prix : ${p.priceLabel}${promo}${p.oldPriceLabel ? ` (au lieu de ${p.oldPriceLabel})` : ""}`,
        `${p.shopName ? `Vendeur : ${p.shopName}` : ""}`,
        `${p.originType === "import" ? "Produit importé" : p.originType === "local" ? "Produit local (Sénégal)" : ""}`,
        ``,
        `👉 ${p.url}`,
        ``,
        `À bientôt,`,
      ].filter(Boolean).join("\n");
    case "sms":
      return `${p.name} — ${p.priceLabel}${promo} sur KawZone : ${p.url}`;
    case "instagram":
      return [
        `✨ ${p.name}`,
        ``,
        `💰 ${p.priceLabel}${promo}${p.oldPriceLabel ? ` (au lieu de ${p.oldPriceLabel})` : ""}`,
        `${shop}${originTag}`,
        ``,
        `🛒 Commander sur KawZone 👉 ${p.url}`,
        `(lien également en bio)`,
        ``,
        `#KawZone #Senegal #Dakar #ShoppingDakar #BonPlan #Promo #Marketplace${p.originType === "import" ? " #Import" : " #ProduitLocal"}`,
      ].join("\n");
    case "facebook":
    case "messenger":
      return `${p.name} — ${p.priceLabel}${promo}`;
    case "copy":
    case "native":
    default:
      return `${p.name} — ${p.priceLabel}${promo} sur KawZone\n${p.url}`;
  }
}
