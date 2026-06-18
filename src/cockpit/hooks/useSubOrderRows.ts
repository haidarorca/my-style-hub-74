// ═══════════════════════════════════════════════════════════════
// useSubOrderRows — Explose chaque commande en N lignes (1 par sub_order_key).
//
// IMPORTANT (statut par sous-commande) :
//   Si un `getSubOrderStatus(orderId, sub_order_key)` est fourni, chaque
//   row reçoit `effective_status` = sub_order_states[…].status ?? mother.
//   Sans cette projection, PipelineView et le Drawer continueraient à lire
//   `order.logistics_status` (mère) et le bouton "Confirmer" n'avancerait
//   jamais la sous-commande dans le pipeline.
//
// IMPORTANT (compteurs) :
//   `rows` ne contient que les sous-commandes gérées par Kawzone (admin ou
//   commission). On RENUMÉROTE index/total/label sur ce sous-ensemble pour
//   éviter les compteurs à trous (ex. 1/4, 2/4, 4/4 quand le vendeur autonome
//   est invisible). Les siblings exposés sur chaque row sont également limités
//   aux sœurs visibles dans le cockpit.
// ═══════════════════════════════════════════════════════════════

import { useMemo } from "react";
import { useOrderAggregatesBatch } from "./useOrderAggregatesBatch";
import { deriveSubOrders, type DerivedSubOrder } from "@/cockpit/lib/sub-orders";
import { formatSubOrderLabel } from "@/cockpit/lib/orderNumbers";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";
import type { OrderArticle } from "@/cockpit/lib/article-states";

export interface SubOrderRow extends DerivedSubOrder {
  mother_order_id: string;
  order: LogisticsOrderRow;
  /** Statut RÉEL de la sous-commande (sub_order_states ?? mother). */
  effective_status: string;
  siblings: Array<{ sub_order_key: string; vendor_id: string; vendor_name: string; line_kind: DerivedSubOrder["line_kind"]; index: number; total: number; label: string }>;
}

type StatusGetter = (orderId: string, subOrderKey: string, fallback?: string | null) => string | null;

export function useSubOrderRows(
  orders: LogisticsOrderRow[],
  getSubOrderStatus?: StatusGetter,
) {
  const enriched = useOrderAggregatesBatch(orders);

  const allRows = useMemo<SubOrderRow[]>(() => {
    const all: SubOrderRow[] = [];
    for (const e of enriched) {
      const oid = e.order.order_id ?? "";
      if (!oid) continue;
      const motherStatus = e.order.logistics_status ?? undefined;
      const subs = deriveSubOrders(e.articles, motherStatus, oid);
      if (subs.length === 0) continue;
      const siblings = subs.map(s => ({
        sub_order_key: s.sub_order_key,
        vendor_id: s.vendor_id, vendor_name: s.vendor_name,
        line_kind: s.line_kind,
        index: s.index, total: s.total, label: s.label,
      }));
      for (const s of subs) {
        const overridden = getSubOrderStatus?.(oid, s.sub_order_key, motherStatus ?? null) ?? motherStatus ?? "new";
        all.push({
          ...s,
          mother_order_id: oid,
          order: e.order,
          effective_status: overridden,
          siblings,
        });
      }
    }
    return all;
  }, [enriched, getSubOrderStatus]);

  // Sous-commandes pilotées par Kawzone uniquement, RENUMÉROTÉES.
  const rows = useMemo(() => {
    const managed = allRows.filter(r => r.is_kawzone_managed);
    // Regrouper par commande mère pour renuméroter localement.
    const byOrder = new Map<string, SubOrderRow[]>();
    for (const r of managed) {
      const arr = byOrder.get(r.mother_order_id) ?? [];
      arr.push(r);
      byOrder.set(r.mother_order_id, arr);
    }
    const out: SubOrderRow[] = [];
    for (const [oid, arr] of byOrder) {
      const total = arr.length;
      const visibleSiblings = arr.map((r, i) => ({
        sub_order_key: r.sub_order_key,
        vendor_id: r.vendor_id,
        vendor_name: r.vendor_name,
        line_kind: r.line_kind,
        index: i + 1,
        total,
        label: formatSubOrderLabel(oid, i + 1, total),
      }));
      arr.forEach((r, i) => {
        out.push({
          ...r,
          index: i + 1,
          total,
          label: formatSubOrderLabel(oid, i + 1, total),
          siblings: visibleSiblings,
        });
      });
    }
    return out;
  }, [allRows]);

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
