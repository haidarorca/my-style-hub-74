// ═══════════════════════════════════════════════════════════════
// ARTICLE STATES — Gestion article par article
// ═══════════════════════════════════════════════════════════════

/** État d'un article dans une commande */
export type ArticleStatus =
  | "pending"        // En attente de traitement
  | "available"      // Disponible en stock
  | "ordered"        // Commandé chez le fournisseur
  | "partial_stock"  // Stock partiel (ex: 3/5)
  | "no_stock"       // Rupture de stock
  | "shipped"        // Expédié vers entrepôt
  | "received"       // Reçu à l'entrepôt
  | "ready"          // Prêt pour livraison
  | "delivered"      // Livré au client
  | "returned"       // Retourné
  | "refunded";      // Remboursé

export const ARTICLE_STATUS_LABELS: Record<ArticleStatus, string> = {
  pending: "En attente",
  available: "Disponible",
  ordered: "Commandé fournisseur",
  partial_stock: "Stock partiel",
  no_stock: "Rupture stock",
  shipped: "Expédié",
  received: "Reçu entrepôt",
  ready: "Prêt",
  delivered: "Livré",
  returned: "Retourné",
  refunded: "Remboursé",
};

export const ARTICLE_STATUS_COLORS: Record<ArticleStatus, string> = {
  pending: "bg-gray-100 text-gray-700",
  available: "bg-emerald-100 text-emerald-700",
  ordered: "bg-blue-100 text-blue-700",
  partial_stock: "bg-amber-100 text-amber-700",
  no_stock: "bg-red-100 text-red-700",
  shipped: "bg-indigo-100 text-indigo-700",
  received: "bg-purple-100 text-purple-700",
  ready: "bg-teal-100 text-teal-700",
  delivered: "bg-green-100 text-green-700",
  returned: "bg-orange-100 text-orange-700",
  refunded: "bg-rose-100 text-rose-700",
};

/** Action à prendre en cas de rupture de stock */
export type StockBreakAction =
  | "refund"           // Remboursement
  | "credit"           // Crédit client
  | "replace"          // Remplacement produit
  | "wait_restock"     // Attente réapprovisionnement
  | "partial_ship";    // Livraison partielle sans l'article

export const STOCK_BREAK_ACTIONS: { key: StockBreakAction; label: string }[] = [
  { key: "refund", label: "Rembourser le client" },
  { key: "credit", label: "Créditer le compte client" },
  { key: "replace", label: "Proposer un produit de remplacement" },
  { key: "wait_restock", label: "Attendre réapprovisionnement" },
  { key: "partial_ship", label: "Expédier sans cet article" },
];

/** Structure d'un article avec son état individuel */
export interface OrderArticle {
  product_id: string;
  product_name: string;
  product_image: string | null;
  variant_id: string | null;
  variant_label: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  status: ArticleStatus;
  is_import: boolean;    // true = produit importé
  is_local: boolean;     // true = produit local
  vendor_id: string | null;
  vendor_name: string | null;
  shop_type_label: string | null;
  // Rupture de stock (état dérivé, sans nouvelle colonne DB)
  stock_break?: {
    reason: string;
    action: StockBreakAction;
    action_label: string;
    resolved: boolean;
    created_at: string;
    /** Sous-cas pour `replace` : produit de remplacement saisi par l'admin. */
    replacement?: { product_name: string; new_unit_price: number };
    /** Pour `replace` quand le nouveau prix diffère, ou pour différencier refund vs credit. */
    diff_handling?: "extra_payment" | "refund" | "credit";
    /** Historique des overrides Super Admin (en mémoire — pas de colonne DB dédiée). */
    override_history?: { from_action: StockBreakAction; to_action: StockBreakAction; reason: string; by: string; at: string }[];
    /** Trace du traitement financier — lève le pending. Aucun mouvement automatique : posé par action admin explicite. */
    settlement?: {
      kind: "refund" | "credit" | "extra_payment";
      amount: number;
      payment_id?: string;   // ligne `payments` existante (refund / extra_payment)
      method?: string;       // moyen de paiement (refund / extra_payment)
      reference?: string;    // référence libre (avoir, virement, etc.)
      note?: string;
      by: string;            // admin qui a validé
      at: string;            // ISO timestamp
    };
  };
  // Livraison partielle
  delivered_qty?: number;
  // Historique des états
  status_history?: { status: ArticleStatus; at: string; by: string }[];
  // Pays d'origine (pour les imports)
  origin_country?: string | null;
  origin_country_flag?: string | null;
}

// ═══════════════════════════════════════════════════════════════
// MATRICE v3 — Helpers de verrouillage et calculs dérivés
// (Aucune nouvelle colonne DB. Tout est dérivé de stock_break + status.)
// ═══════════════════════════════════════════════════════════════

/** Statut financier dérivé d'un article (jamais persisté). */
export type ArticleFinancialStatus =
  | "none"
  | "refund_pending"
  | "credit_pending"
  | "extra_payment_pending";

/** Sous-cas du remplacement, dérivé de la différence de prix. */
export type ReplaceVariant = "replace_same" | "replace_higher" | "replace_lower";

export function getReplaceVariant(oldUnitPrice: number, newUnitPrice: number): ReplaceVariant {
  if (newUnitPrice > oldUnitPrice) return "replace_higher";
  if (newUnitPrice < oldUnitPrice) return "replace_lower";
  return "replace_same";
}

/** Impact financier d'un remplacement, calculé pour un article (qty incluse). */
export function getReplaceImpact(article: OrderArticle): {
  variant: ReplaceVariant;
  delta: number; // positif = à encaisser, négatif = à rembourser/créditer
  newLineTotal: number;
} | null {
  const sb = article.stock_break;
  if (!sb || sb.action !== "replace" || !sb.replacement) return null;
  const oldUnit = article.unit_price;
  const newUnit = sb.replacement.new_unit_price;
  const variant = getReplaceVariant(oldUnit, newUnit);
  const delta = (newUnit - oldUnit) * article.quantity;
  return { variant, delta, newLineTotal: newUnit * article.quantity };
}

/** Statut financier dérivé. Aucun mouvement automatique : juste une intention.
 *  Si `stock_break.settlement` est posé (action admin explicite), le pending est levé. */
export function getArticleFinancialStatus(article: OrderArticle): ArticleFinancialStatus {
  const sb = article.stock_break;
  if (!sb || !sb.resolved) return "none";
  if (sb.settlement) return "none"; // traité par admin — pending levé
  if (sb.action === "refund") return "refund_pending";
  if (sb.action === "credit") return "credit_pending";
  if (sb.action === "replace") {
    if (sb.diff_handling === "extra_payment") return "extra_payment_pending";
    if (sb.diff_handling === "refund") return "refund_pending";
    if (sb.diff_handling === "credit") return "credit_pending";
  }
  return "none";
}

/** Montant attendu du settlement pour un article (en valeur absolue). */
export function getExpectedSettlementAmount(article: OrderArticle): number {
  const sb = article.stock_break;
  if (!sb || !sb.resolved) return 0;
  if (sb.action === "refund" || sb.action === "credit") return article.line_total;
  if (sb.action === "replace") {
    const imp = getReplaceImpact(article);
    return imp ? Math.abs(imp.delta) : 0;
  }
  return 0;
}

/** Verrou commande : la commande gèle toutes les actions article. */
export function isOrderLocked(orderStatus?: string): boolean {
  return orderStatus === "delivered" || orderStatus === "cancelled";
}

/** Verrou article (livré, remboursé, retourné). */
export function isArticleTerminal(article: OrderArticle): boolean {
  return article.status === "delivered" || article.status === "refunded" || article.status === "returned";
}

/** Verrou complet : aucune action possible sur cet article. */
export function isArticleLocked(article: OrderArticle, orderStatus?: string): boolean {
  return isOrderLocked(orderStatus) || isArticleTerminal(article);
}

/** Peut-on signaler une rupture sur cet article ? */
export function canSignalBreak(article: OrderArticle, orderStatus?: string): boolean {
  if (isArticleLocked(article, orderStatus)) return false;
  if (article.stock_break) return false; // toute rupture (résolue ou non) gèle ce bouton
  return true;
}

/** Peut-on changer le statut article (chips "Prochaine étape") ? */
export function canChangeArticleStatus(article: OrderArticle, orderStatus?: string): boolean {
  if (isArticleLocked(article, orderStatus)) return false;
  const sb = article.stock_break;
  // Rupture non résolue → seul le dialog peut agir.
  if (sb && !sb.resolved) return false;
  // Après preparing : aucun retour arrière possible (sauf super admin via override).
  if (orderStatus && ["preparing", "ready", "ready_delivery", "shipped"].includes(orderStatus)) {
    return false;
  }
  // Rupture résolue : seuls replace et wait_restock permettent une suite normale.
  if (sb && sb.resolved) {
    if (sb.action === "replace") return true;
    if (sb.action === "wait_restock") return true;
    return false;
  }
  return true;
}

/** Peut-on livrer (partiellement) cet article ? */
export function canPartialDeliver(article: OrderArticle, orderStatus?: string): boolean {
  if (isArticleLocked(article, orderStatus)) return false;
  const sb = article.stock_break;
  // Décisions qui excluent du colis
  if (sb && sb.resolved && ["partial_ship", "refund", "credit", "wait_restock"].includes(sb.action)) return false;
  if ((article.delivered_qty ?? 0) >= article.quantity) return false;
  return ["ready", "available", "received"].includes(article.status);
}

/** Bouton Super Admin "Modifier la décision". */
export function canOverrideDecision(article: OrderArticle, orderStatus: string | undefined, isSuperAdmin: boolean): boolean {
  if (!isSuperAdmin) return false;
  if (isOrderLocked(orderStatus)) return false;
  return !!(article.stock_break && article.stock_break.resolved);
}

/** Badge décision affiché DIRECTEMENT dans la ligne article. Aucun clignotement. */
export interface DecisionBadge {
  label: string;
  className: string;
}

export function getDecisionBadge(article: OrderArticle): DecisionBadge | null {
  const sb = article.stock_break;
  if (!sb) return null;
  if (!sb.resolved) {
    return { label: "Rupture à traiter", className: "bg-red-600 text-white" };
  }
  switch (sb.action) {
    case "partial_ship":
      return { label: "Exclu du colis", className: "bg-gray-700 text-white" };
    case "refund":
      return { label: "Remboursement à traiter", className: "bg-rose-100 text-rose-800 border border-rose-300" };
    case "credit":
      return { label: "Crédit à traiter", className: "bg-amber-100 text-amber-800 border border-amber-300" };
    case "wait_restock":
      return { label: "Attente réappro", className: "bg-slate-200 text-slate-800 border border-slate-300" };
    case "replace": {
      const impact = getReplaceImpact(article);
      if (!impact || impact.variant === "replace_same") return { label: "Remplacement", className: "bg-violet-100 text-violet-800 border border-violet-300" };
      if (impact.variant === "replace_higher") return { label: `Remplacement (+${impact.delta.toLocaleString("fr-FR")})`, className: "bg-violet-100 text-violet-800 border border-violet-300" };
      return { label: `Remplacement (${impact.delta.toLocaleString("fr-FR")})`, className: "bg-violet-100 text-violet-800 border border-violet-300" };
    }
  }
  return null;
}

/** Résumé livraison partielle d'une commande. */
export interface PartialDeliveryStatus {
  active: boolean;
  deliveredCount: number;
  pendingCount: number;
  waitingRestock: number;
}

export function getPartialDeliveryStatus(articles: OrderArticle[] | undefined): PartialDeliveryStatus {
  const list = articles ?? [];
  const deliveredCount = list.filter(a => (a.delivered_qty ?? 0) >= a.quantity).length;
  const pendingCount = list.length - deliveredCount;
  const waitingRestock = list.filter(a => a.stock_break?.resolved && a.stock_break.action === "wait_restock").length;
  const someDelivered = list.some(a => (a.delivered_qty ?? 0) > 0);
  return {
    active: someDelivered && pendingCount > 0,
    deliveredCount,
    pendingCount,
    waitingRestock,
  };
}

/** Récap financier des décisions en attente sur une commande. */
export function getPendingFinancialActions(articles: OrderArticle[] | undefined): {
  refundPending: number;
  creditPending: number;
  extraPaymentPending: number;
  hasAny: boolean;
} {
  let refundPending = 0;
  let creditPending = 0;
  let extraPaymentPending = 0;
  for (const a of articles ?? []) {
    const fs = getArticleFinancialStatus(a);
    if (fs === "refund_pending") {
      if (a.stock_break?.action === "replace") {
        const imp = getReplaceImpact(a);
        if (imp) refundPending += Math.abs(imp.delta);
      } else {
        refundPending += a.line_total;
      }
    } else if (fs === "credit_pending") {
      if (a.stock_break?.action === "replace") {
        const imp = getReplaceImpact(a);
        if (imp) creditPending += Math.abs(imp.delta);
      } else {
        creditPending += a.line_total;
      }
    } else if (fs === "extra_payment_pending") {
      const imp = getReplaceImpact(a);
      if (imp) extraPaymentPending += imp.delta;
    }
  }
  return { refundPending, creditPending, extraPaymentPending, hasAny: refundPending + creditPending + extraPaymentPending > 0 };
}

/** Type de commande : local, import, ou mixte */
export type OrderMixType = "local" | "import" | "mixte";

/** Détermine le type mixte d'une commande à partir de ses articles */
export function getOrderMixType(articles: OrderArticle[]): OrderMixType {
  const hasLocal = articles.some(a => a.is_local);
  const hasImport = articles.some(a => a.is_import);
  if (hasLocal && hasImport) return "mixte";
  if (hasImport) return "import";
  return "local";
}

// ═══════════════════════════════════════════════════════════════
// ACTION SUIVANTE — Ce que l'admin doit faire maintenant
// ═══════════════════════════════════════════════════════════════

export type NextAction =
  | "confirm_order"          // Confirmer la commande
  | "contact_client"         // Contacter le client
  | "order_supplier"         // Commander chez le fournisseur
  | "receive_warehouse"      // Réceptionner à l'entrepôt
  | "check_stock"            // Vérifier le stock
  | "resolve_stock_break"    // Résoudre la rupture de stock
  | "weigh"                  // Faire la pesée
  | "calculate_fees"         // Calculer les frais
  | "wait_payment"           // Attendre le paiement client
  | "prepare_shipment"       // Préparer l'expédition
  | "ship"                   // Expédier
  | "deliver"                // Livrer
  | "partial_deliver"        // Livraison partielle
  | "refund_client"          // Rembourser le client
  | "done";                  // Terminé

export interface NextActionInfo {
  action: NextAction;
  label: string;
  description: string;
  color: string;
  bg: string;
  icon: string; // nom lucide
}

export function getNextActionForOrder(
  orderStatus: string,
  articles: OrderArticle[],
  remaining: number,
  hasFreight: boolean
): NextActionInfo {
  const status = orderStatus ?? "new";

  // Articles en rupture de stock non résolus
  const unresolvedBreaks = articles.filter(a => a.stock_break && !a.stock_break.resolved);
  if (unresolvedBreaks.length > 0) {
    return {
      action: "resolve_stock_break",
      label: "Rupture de stock",
      description: `${unresolvedBreaks.length} article(s) en rupture — action requise`,
      color: "text-red-700",
      bg: "bg-red-50 border-red-200",
      icon: "AlertTriangle",
    };
  }

  // Articles commandés fournisseur en attente
  const waitingSupplier = articles.filter(a => a.status === "ordered");
  if (waitingSupplier.length > 0 && ["confirmed", "ordered_supplier", "new"].includes(status)) {
    return {
      action: "receive_warehouse",
      label: "Réception fournisseur",
      description: `${waitingSupplier.length} article(s) en attente de réception`,
      color: "text-purple-700",
      bg: "bg-purple-50 border-purple-200",
      icon: "Package",
    };
  }

  // Articles disponibles en attente de commande fournisseur
  const needSupplier = articles.filter(a => a.is_import && ["pending", "available"].includes(a.status));
  if (needSupplier.length > 0 && ["confirmed", "new"].includes(status)) {
    return {
      action: "order_supplier",
      label: "Commander fournisseur",
      description: `${needSupplier.length} article(s) à commander chez le fournisseur`,
      color: "text-blue-700",
      bg: "bg-blue-50 border-blue-200",
      icon: "ShoppingCart",
    };
  }

  // À peser
  const toWeigh = articles.filter(a => a.is_import && ["received", "ready"].includes(a.status));
  if (toWeigh.length > 0 && status === "awaiting_weighing") {
    return {
      action: "weigh",
      label: "Faire la pesée",
      description: `${toWeigh.length} article(s) importé(s) à peser`,
      color: "text-orange-700",
      bg: "bg-orange-50 border-orange-200",
      icon: "Scale",
    };
  }

  // Attente paiement
  if (remaining > 0 && ["fees_calculated", "payment_fees"].includes(status)) {
    return {
      action: "wait_payment",
      label: "Attendre paiement",
      description: `Reste à payer : ${remaining.toLocaleString("fr-FR")} FCFA`,
      color: "text-amber-700",
      bg: "bg-amber-50 border-amber-200",
      icon: "Wallet",
    };
  }

  // Prête à expédier
  const ready = articles.filter(a => ["ready", "received"].includes(a.status));
  if (ready.length > 0 && ["ready", "ready_delivery", "fees_calculated"].includes(status)) {
    return {
      action: "ship",
      label: "Expédier",
      description: `${ready.length} article(s) prêt(s) à expédier`,
      color: "text-indigo-700",
      bg: "bg-indigo-50 border-indigo-200",
      icon: "Truck",
    };
  }

  // Livraison partielle possible
  const partialReady = articles.filter(a => a.status === "ready");
  const notReady = articles.filter(a => !["ready", "delivered"].includes(a.status));
  if (partialReady.length > 0 && notReady.length > 0 && status === "shipped") {
    return {
      action: "partial_deliver",
      label: "Livraison partielle",
      description: `${partialReady.length} article(s) livrable(s) — ${notReady.length} en attente`,
      color: "text-teal-700",
      bg: "bg-teal-50 border-teal-200",
      icon: "PackageCheck",
    };
  }

  // À livrer
  if (status === "shipped") {
    return {
      action: "deliver",
      label: "Livrer",
      description: "Commande expédiée — marquer comme livrée",
      color: "text-emerald-700",
      bg: "bg-emerald-50 border-emerald-200",
      icon: "CheckCircle",
    };
  }

  // Confirmer
  if (status === "new" || status === "") {
    return {
      action: "confirm_order",
      label: "Confirmer",
      description: "Nouvelle commande — à confirmer",
      color: "text-purple-700",
      bg: "bg-purple-50 border-purple-200",
      icon: "Phone",
    };
  }

  return {
    action: "done",
    label: "Terminé",
    description: "Aucune action requise",
    color: "text-gray-600",
    bg: "bg-gray-50 border-gray-200",
    icon: "CheckCircle2",
  };
}

// ═══════════════════════════════════════════════════════════════
// MESSAGES WHATSAPP — Scénarios avancés
// ═══════════════════════════════════════════════════════════════

export interface WhatsAppScenario {
  key: string;
  label: string;
  template: (data: WhatsAppData) => string;
}

export interface WhatsAppData {
  clientName: string;
  orderShortId: string;
  productName?: string;
  variantLabel?: string;
  replacementProduct?: string;
  deliveredQty?: number;
  totalQty?: number;
  missingProducts?: string[];
  amount?: number;
  trackingNumber?: string;
  eta?: string;
}

export const WHATSAPP_SCENARIOS: WhatsAppScenario[] = [
  {
    key: "stock_break",
    label: "Rupture de stock",
    template: (d) =>
      `Bonjour ${d.clientName},\n\n` +
      `Concernant votre commande *${d.orderShortId}*, le produit "${d.productName}"${d.variantLabel ? ` (${d.variantLabel})` : ""} est malheureusement en *rupture de stock*.\n\n` +
      `Nous vous proposons :\n` +
      `• Un remboursement de ${d.amount?.toLocaleString("fr-FR")} FCFA\n` +
      `• Un crédit sur votre compte\n` +
      `• Un produit de remplacement${d.replacementProduct ? ` : ${d.replacementProduct}` : ""}\n\n` +
      `Merci de nous indiquer votre préférence.\n\n_Kawzone_`,
  },
  {
    key: "partial_delivery",
    label: "Livraison partielle",
    template: (d) =>
      `Bonjour ${d.clientName},\n\n` +
      `Votre commande *${d.orderShortId}* est en *livraison partielle*.\n\n` +
      `✅ ${d.deliveredQty}/${d.totalQty} article(s) livré(s)\n` +
      (d.missingProducts && d.missingProducts.length > 0
        ? `⏳ En attente : ${d.missingProducts.join(", ")}\n`
        : "") +
      `\nLes articles restants vous seront livrés dès disponibilité.\n\n_Kawzone_`,
  },
  {
    key: "supplier_wait",
    label: "Attente fournisseur",
    template: (d) =>
      `Bonjour ${d.clientName},\n\n` +
      `Votre commande *${d.orderShortId}* a été passée chez notre fournisseur.\n\n` +
      `Les articles sont en cours de préparation.\n` +
      `Délai estimé : *${d.eta ?? "7-10 jours"}*\n\n` +
      `Nous vous informerons dès l'arrivée de votre colis.\n\n_Kawzone_`,
  },
  {
    key: "payment_reminder",
    label: "Relance paiement",
    template: (d) =>
      `Bonjour ${d.clientName},\n\n` +
      `Votre commande *${d.orderShortId}* est prête.\n\n` +
      `Reste à payer : *${d.amount?.toLocaleString("fr-FR")} FCFA*\n\n` +
      `Pour finaliser votre commande, merci d'effectuer le paiement.\n\n_Kawzone_`,
  },
  {
    key: "replacement_offer",
    label: "Proposition remplacement",
    template: (d) =>
      `Bonjour ${d.clientName},\n\n` +
      `"${d.productName}" est en rupture.\n\n` +
      `Nous vous proposons en remplacement :\n` +
      `👉 ${d.replacementProduct ?? "un produit similaire"}\n\n` +
      `Si cela vous convient, nous expédions immédiatement.\n\n_Kawzone_`,
  },
];

/** Détecte les scénarios applicables pour une commande */
export function getApplicableScenarios(
  articles: OrderArticle[],
  orderStatus: string,
  remaining: number
): string[] {
  const keys: string[] = [];

  const breaks = articles.filter(a => a.stock_break && !a.stock_break.resolved);
  if (breaks.length > 0) keys.push("stock_break");

  const partial = articles.filter(a => (a.delivered_qty ?? 0) > 0 && (a.delivered_qty ?? 0) < a.quantity);
  if (partial.length > 0) keys.push("partial_delivery");

  const supplierWait = articles.filter(a => a.status === "ordered");
  if (supplierWait.length > 0) keys.push("supplier_wait");

  if (remaining > 0 && ["fees_calculated", "payment_fees", "ready", "ready_delivery"].includes(orderStatus)) {
    keys.push("payment_reminder");
  }

  return keys;
}
