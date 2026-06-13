import { runtimeSettings } from "@/hooks/use-site-settings";

export const WHATSAPP_NUMBER = "221776533606";

export interface WhatsAppLine {
  shopName: string;
  code: string;
  name: string;
  size?: string | null;
  color?: string | null;
  customization?: string | null;
  quantity: number;
  unitPrice: number;
}

export interface WhatsAppCustomer {
  name: string;
  phone: string;
  address: string;
  city: string;
  note?: string | null;
  orderId?: string | null;
}

export function buildWhatsAppMessage(lines: WhatsAppLine[], customer?: WhatsAppCustomer): string {
  const groups = new Map<string, WhatsAppLine[]>();
  for (const l of lines) {
    if (!groups.has(l.shopName)) groups.set(l.shopName, []);
    groups.get(l.shopName)!.push(l);
  }

  const fmt = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;

  let msg = "🛒 *Nouvelle commande*\n";
  if (customer?.orderId) msg += `📋 *Référence : ${customer.orderId}*\n`;
  msg += "\n";

  if (customer) {
    msg += "👤 *Client*\n";
    msg += `Nom : ${customer.name}\n`;
    msg += `Téléphone : ${customer.phone}\n`;
    msg += `Adresse : ${customer.address}\n`;
    msg += `Quartier/Ville : ${customer.city}\n`;
    if (customer.note) msg += `Note : ${customer.note}\n`;
    msg += "\n────────────────\n\n";
  }

  let grandTotal = 0;
  for (const [shop, items] of groups) {
    msg += `🏪 *Boutique : ${shop}*\n`;
    let shopTotal = 0;
    for (const it of items) {
      const lineTotal = it.unitPrice * it.quantity;
      shopTotal += lineTotal;
      msg += `\n• 📦 ${it.name}\n`;
      if (it.size) msg += `  Taille : ${it.size}\n`;
      if (it.color) msg += `  Couleur : ${it.color}\n`;
      if (it.customization) msg += `  Personnalisation : ${it.customization}\n`;
      msg += `  Quantité : ${it.quantity}\n`;
      msg += `  Prix unitaire : ${fmt(it.unitPrice)}\n`;
      msg += `  Total : ${fmt(lineTotal)}\n`;
    }
    msg += `\nSous-total boutique : ${fmt(shopTotal)}\n\n────────────────\n`;
    grandTotal += shopTotal;
  }

  msg += `\n💰 *TOTAL GÉNÉRAL : ${fmt(grandTotal)}*`;
  return msg;
}

export function whatsappUrl(message: string): string {
  const number = (runtimeSettings.whatsapp_number || WHATSAPP_NUMBER).replace(/\D/g, "");
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/**
 * Pick the right destination WhatsApp number for an order checkout.
 * If the order contains commission items, route to the admin's dedicated
 * commission WhatsApp number (falls back to the default site number if unset).
 */
export function whatsappUrlForOrder(message: string, opts: { isCommission: boolean }): string {
  if (opts.isCommission && runtimeSettings.commission_whatsapp_number) {
    const num = runtimeSettings.commission_whatsapp_number.replace(/\D/g, "");
    if (num) return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
  }
  return whatsappUrl(message);
}

/** Build a WhatsApp URL to an arbitrary phone number. Falls back to the
 * site default number when the provided one is missing/invalid. */
export function whatsappUrlTo(rawNumber: string | null | undefined, message: string): string {
  const num = (rawNumber ?? "").replace(/\D/g, "");
  if (num) return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
  return whatsappUrl(message);
}

/** Build a vendor-facing forward message that contains NO customer PII. */
export function buildVendorForwardMessage(
  orderShortId: string,
  lines: WhatsAppLine[],
): string {
  const fmt = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;
  let msg = "📦 *Commande à préparer*\n";
  msg += `📋 *Référence : ${orderShortId}*\n`;
  msg += "_(commande plateforme — infos client gérées par l'admin)_\n\n";
  let total = 0;
  for (const it of lines) {
    const lineTotal = it.unitPrice * it.quantity;
    total += lineTotal;
    msg += `• 📦 ${it.name}\n`;
    if (it.code && it.code !== it.name) msg += `  Réf. article : ${it.code}\n`;
    if (it.size) msg += `  Taille : ${it.size}\n`;
    if (it.color) msg += `  Couleur : ${it.color}\n`;
    if (it.customization) msg += `  Personnalisation : ${it.customization}\n`;
    msg += `  Quantité : ${it.quantity}\n`;
    msg += `  Prix unitaire : ${fmt(it.unitPrice)}\n\n`;
  }
  msg += `Sous-total : ${fmt(total)}\n\n`;
  msg += "Merci de préparer la commande. La livraison est gérée par la plateforme.";
  return msg;
}

/** Build a WhatsApp validation message for "fees after weighing" workflow. */
export function buildShipmentValidationMessage(opts: {
  customerName: string;
  orderShortId: string;
  totalFees: number;
  validationUrl: string;
  serviceName?: string | null;
  realWeightKg?: number | null;
  pricePerKg?: number | null;
  delayMinDays?: number | null;
  delayMaxDays?: number | null;
}): string {
  const fmt = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;
  let msg = `Bonjour ${opts.customerName},\n\n`;
  msg += `Votre article de la commande *${opts.orderShortId}* est arrivé à notre entrepôt en Chine.\n\n`;
  if (opts.serviceName) msg += `🚚 Service : *${opts.serviceName}*\n`;
  if (opts.realWeightKg != null) msg += `⚖️ Poids réel : *${opts.realWeightKg} kg*\n`;
  if (opts.pricePerKg != null) msg += `💵 Prix : *${fmt(opts.pricePerKg)} / kg*\n`;
  msg += `\nFrais d'expédition totaux : *${fmt(opts.totalFees)}*.\n`;
  if (opts.delayMinDays != null || opts.delayMaxDays != null) {
    msg += `⏱️ Délai estimé : ${opts.delayMinDays ?? "?"}–${opts.delayMaxDays ?? "?"} jours.\n`;
  }
  msg += "\nMerci de valider ces frais pour que nous puissions embarquer votre colis.\n\n";
  msg += `🔗 Lien de validation :\n${opts.validationUrl}\n\n`;
  msg += "⚠️ Important : le colis ne sera pas embarqué avant votre validation.";
  return msg;
}