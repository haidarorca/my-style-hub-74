// ═══════════════════════════════════════════════════════════════
// useSubOrderRows — Explose chaque commande en N lignes (1 par vendeur).
//
// Phase 3 : le scope Cockpit (kawzone / commission / autonomous) est
// dérivé directement des articles (is_admin_shop + commission_amount),
// donc plus besoin d'un appel serveur supplémentaire.
//
// `rows`     → uniquement les sous-commandes gérées par Kawzone
// `allRows`  → toutes les sous-commandes (utile pour le toggle "voir tout")
// ═══════════════════════════════════════════════════════════════

import { useMemo } from "react";
import { useOrderAggregatesBatch } from "./useOrderAggregatesBatch";
import { deriveSubOrders, type DerivedSubOrder } from "@/cockpit/lib/sub-orders";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";
import type { OrderArticle } from "@/cockpit/lib/article-states";

export interface SubOrderRow extends DerivedSubOrder {
  mother_order_id: string;
  order: LogisticsOrderRow;
  siblings: Array<{ vendor_id: string; vendor_name: string; index: number; total: number; label: string }>;
}

export function useSubOrderRows(orders: LogisticsOrderRow[]) {
  const enriched = useOrderAggregatesBatch(orders);

  const allRows = useMemo<SubOrderRow[]>(() => {
    const all: SubOrderRow[] = [];
    for (const e of enriched) {
      const oid = e.order.order_id ?? "";
      if (!oid) continue;
      const subs = deriveSubOrders(e.articles, e.order.logistics_status ?? undefined, oid);
      if (subs.length === 0) continue;
      const siblings = subs.map(s => ({
        vendor_id: s.vendor_id, vendor_name: s.vendor_name,
        index: s.index, total: s.total, label: s.label,
      }));
      for (const s of subs) {
        all.push({ ...s, mother_order_id: oid, order: e.order, siblings });
      }
    }
    return all;
  }, [enriched]);

  const rows = useMemo(() => allRows.filter(r => r.is_kawzone_managed), [allRows]);

  const articlesMap = useMemo(() => {
    const m: Record<string, OrderArticle[]> = {};
    for (const e of enriched) {
      const oid = e.order.order_id ?? "";
      if (oid) m[oid] = e.articles;
    }
    return m;
  }, [enriched]);

  const isLoading = enriched.some(e => e.isLoading);

  return { rows, allRows, articlesMap, enriched, isLoading };
}
