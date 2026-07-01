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

export function buildShareMessage(p: ShareProduct, platform: SharePlatform): string {
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
