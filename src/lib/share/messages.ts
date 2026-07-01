// ═══════════════════════════════════════════════════════════════
// Messages de partage adaptés par plateforme.
// ═══════════════════════════════════════════════════════════════

import type { SharePlatform } from "./links";

export interface ShareProduct {
  name: string;
  priceLabel: string;         // ex: "15 000 FCFA"
  oldPriceLabel?: string | null;
  promoLabel?: string | null; // ex: "-20%"
  url: string;                // lien tracké
  shopName?: string | null;
}

export function buildShareMessage(p: ShareProduct, platform: SharePlatform): string {
  const promo = p.promoLabel ? ` (${p.promoLabel})` : "";
  const shop = p.shopName ? `\n🏪 Vendu par ${p.shopName}` : "";

  switch (platform) {
    case "whatsapp":
      return `🛍️ *${p.name}*\n\n💰 ${p.priceLabel}${promo}${p.oldPriceLabel ? ` ~${p.oldPriceLabel}~` : ""}${shop}\n\n👉 Acheter maintenant : ${p.url}\n\n_via KawZone — le marché en ligne du Sénégal_`;
    case "telegram":
      return `🛍️ ${p.name}\n💰 ${p.priceLabel}${promo}${shop}\n👉 ${p.url}`;
    case "twitter": {
      // 280 chars max — reste concis
      const base = `${p.name} — ${p.priceLabel}${promo} sur KawZone 🛍️`;
      const room = 260 - base.length;
      return room > 20 ? `${base}\n${p.url}` : `${base.slice(0, 200)}…\n${p.url}`;
    }
    case "email":
      return `Bonjour,\n\nJe voulais te faire découvrir ce produit sur KawZone :\n\n${p.name}\nPrix : ${p.priceLabel}${promo}${shop}\n\nLien : ${p.url}\n\nÀ bientôt !`;
    case "sms":
      return `${p.name} — ${p.priceLabel}${promo} sur KawZone : ${p.url}`;
    case "facebook":
    case "messenger":
      // Facebook impose son propre aperçu OG, texte souvent ignoré
      return `${p.name} — ${p.priceLabel}${promo}`;
    case "copy":
    case "native":
    default:
      return `${p.name} — ${p.priceLabel}${promo} sur KawZone\n${p.url}`;
  }
}
