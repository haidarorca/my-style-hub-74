// ═══════════════════════════════════════════════════════════════
// SUB-ORDERS — Vue dérivée par vendeur (Phase 1.5, zéro SQL).
//
// Une "sub_order" = projection mentale d'une commande, groupée par
// `vendor_id`. C'est désormais l'unité opérationnelle principale.
//
// Décisions actées :
//   - Split par vendor_id (un vendeur multi-boutique = 1 sub_order).
//   - Le concept "MIXTE" n'existe plus : chaque sub_order suit son
//     propre workflow (local OU import). Une commande peut contenir
//     des sub_orders de natures différentes, mais aucune n'est "mixte".
//   - Pure : aucune migration DB, aucune écriture.
// ═══════════════════════════════════════════════════════════════

import type { OrderArticle } from "./article-states";
import { aggregateOrder, type OrderAggregate } from "./order-aggregate";
import { formatSubOrderLabel } from "./orderNumbers";

/** Type opérationnel d'une sub_order : local pur, import pur, ou les deux
 *  chez un même vendeur (le cas reste rare ; pas de workflow spécial). */
export type SubOrderKind = "local" | "import" | "local_and_import";

export interface DerivedSubOrder {
  /** Identité — vendor_id, "unknown" si null. */
  vendor_id: string;
  vendor_name: string;
  /** Position dans la commande mère (1-indexed) et total. */
  index: number;
  total: number;
  /** Libellé complet : "KZ-000101 · 1/3". */
  label: string;
  /** Type opérationnel : local / import / les deux chez un même vendeur. */
  kind: SubOrderKind;
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
}

/** Dérive la liste des sub_orders d'une commande, groupées par vendor_id.
 *  La boutique est un attribut d'affichage, pas l'unité de split. */
export function deriveSubOrders(
  articles: OrderArticle[] | null | undefined,
  orderStatus?: string,
  motherOrderId?: string,
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

  type RawSub = Omit<DerivedSubOrder, "index" | "total" | "label">;
  const raw: RawSub[] = [];
  for (const [vendor_id, vendorArticles] of groups) {
    const first = vendorArticles[0];
    const vendor_name = first.vendor_name ?? "Vendeur inconnu";
    const aggregate = aggregateOrder(vendorArticles, orderStatus);

    const hasLocal = vendorArticles.some(a => a.is_local);
    const hasImport = vendorArticles.some(a => a.is_import);
    const kind: SubOrderKind =
      hasLocal && hasImport ? "local_and_import"
      : hasImport ? "import"
      : "local";

    const product_total = vendorArticles
      .filter(a => a.status !== "cancelled")
      .reduce((s, a) => s + (a.line_total ?? 0), 0);

    raw.push({
      vendor_id,
      vendor_name,
      kind,
      articles: vendorArticles,
      aggregate,
      financials: {
        product_total,
        article_count: vendorArticles.length,
        delivered_count: aggregate.counters.delivered,
        blocked_count: aggregate.counters.blocked,
      },
    });
  }

  // Tri : bloquants d'abord, puis règlements en attente, puis ready, puis le reste.
  const sorted = raw.sort((a, b) => {
    const score = (s: RawSub) =>
      (s.aggregate.flags.has_blocking ? 1000 : 0) +
      (s.aggregate.pending_money.total_abs > 0 ? 500 : 0) +
      (s.aggregate.flags.can_ship_today ? 100 : 0) +
      s.financials.product_total / 1_000_000;
    return score(b) - score(a);
  });

  const total = sorted.length;
  return sorted.map((s, i) => ({
    ...s,
    index: i + 1,
    total,
    label: formatSubOrderLabel(motherOrderId ?? "", i + 1, total),
  }));
}
