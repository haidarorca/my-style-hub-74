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

export function buildWhatsAppMessage(lines: WhatsAppLine[]): string {
  const groups = new Map<string, WhatsAppLine[]>();
  for (const l of lines) {
    if (!groups.has(l.shopName)) groups.set(l.shopName, []);
    groups.get(l.shopName)!.push(l);
  }

  const fmt = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;

  let msg = "🛒 *Nouvelle commande*\n\n";
  let grandTotal = 0;

  for (const [shop, items] of groups) {
    msg += `🏪 *Boutique : ${shop}*\n`;
    let shopTotal = 0;
    for (const it of items) {
      const lineTotal = it.unitPrice * it.quantity;
      shopTotal += lineTotal;
      msg += `\n• Code : ${it.code}\n`;
      msg += `  Article : ${it.name}\n`;
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
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
