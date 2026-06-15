// ═══════════════════════════════════════════════════════════════
// SUB-ORDERS — Vue dérivée par vendeur (Phase 1, zéro SQL).
//
// Une "sub_order" = projection mentale d'une commande, groupée par
// `vendor_id` (décision arbitrée : un vendeur multi-boutique reste
// une seule sub_order).
//
// Cette fonction est PURE et dérive tout depuis OrderArticle[] :
//   - aucune migration DB,
//   - aucune écriture,
//   - aucune dépendance React.
//
// Elle réutilise `aggregateOrder()` par vendeur pour récupérer
// next_action / buckets / pending_money à la maille sub_order.
// ═══════════════════════════════════════════════════════════════

import type { OrderArticle } from "./article-states";
import { aggregateOrder, type OrderAggregate } from "./order-aggregate";

export interface DerivedSubOrder {
  /** Identité — vendor_id, "unknown" si null. */
  vendor_id: string;
  vendor_name: string;
  /** Articles rattachés à ce vendeur dans la mother_order. */
  articles: OrderArticle[];
  /** Agrégat (réutilise aggregateOrder pour cohérence stricte). */
  aggregate: OrderAggregate;
  /** Finances dérivées — quote-part de cette sub_order. */
  financials: {
    /** Somme des line_total des articles non annulés. */
    product_total: number;
    /** Nb d'articles total / livrés / bloqués. */
    article_count: number;
    delivered_count: number;
    blocked_count: number;
  };
  /** Mixte ? (au moins 1 local + 1 import chez le même vendeur). */
  is_mixed: boolean;
  /** Vrai si tous les articles de cette sub_order sont importés. */
  is_import_only: boolean;
  /** Vrai si tous les articles de cette sub_order sont locaux. */
  is_local_only: boolean;
}

/** Dérive la liste des sub_orders d'une commande, groupées par vendor_id.
 *  La boutique est un attribut d'affichage, pas l'unité de split (arbitrage §9).
 *  Retourne un tableau trié par priorité d'action (bloqués → règlements → ready → autres). */
export function deriveSubOrders(
  articles: OrderArticle[] | null | undefined,
  orderStatus?: string,
): DerivedSubOrder[] {
  const list = articles ?? [];
  if (list.length === 0) return [];

  // Groupement par vendor_id (null → "unknown").
  const groups = new Map<string, OrderArticle[]>();
  for (const a of list) {
    const key = a.vendor_id ?? "unknown";
    const arr = groups.get(key);
    if (arr) arr.push(a);
    else groups.set(key, [a]);
  }

  const subs: DerivedSubOrder[] = [];
  for (const [vendor_id, vendorArticles] of groups) {
    const first = vendorArticles[0];
    const vendor_name = first.vendor_name ?? "Vendeur inconnu";
    const aggregate = aggregateOrder(vendorArticles, orderStatus);

    const hasLocal = vendorArticles.some(a => a.is_local);
    const hasImport = vendorArticles.some(a => a.is_import);

    const product_total = vendorArticles
      .filter(a => a.status !== "cancelled")
      .reduce((s, a) => s + (a.line_total ?? 0), 0);

    subs.push({
      vendor_id,
      vendor_name,
      articles: vendorArticles,
      aggregate,
      financials: {
        product_total,
        article_count: vendorArticles.length,
        delivered_count: aggregate.counters.delivered,
        blocked_count: aggregate.counters.blocked,
      },
      is_mixed: hasLocal && hasImport,
      is_import_only: hasImport && !hasLocal,
      is_local_only: hasLocal && !hasImport,
    });
  }

  // Tri : sub_orders avec bloquants d'abord, puis règlements en attente,
  // puis ready, puis le reste. Identique à l'ordre de priorité Cockpit.
  return subs.sort((a, b) => {
    const score = (s: DerivedSubOrder) =>
      (s.aggregate.flags.has_blocking ? 1000 : 0) +
      (s.aggregate.pending_money.total_abs > 0 ? 500 : 0) +
      (s.aggregate.flags.can_ship_today ? 100 : 0) +
      s.financials.product_total / 1_000_000;
    return score(b) - score(a);
  });
}
