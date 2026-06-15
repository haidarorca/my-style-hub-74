// ═══════════════════════════════════════════════════════════════
// useSubOrderRows — Explose chaque commande en N lignes (1 par vendeur).
//
// Vision Phase 2 : la sous-commande boutique est l'unité opérationnelle.
// Une commande mère KZ-000101 avec 3 boutiques produit 3 SubOrderRow.
//
// Phase 3 : on filtre désormais les sous-commandes pour ne montrer
// dans le Cockpit principal que celles qui demandent une intervention
// Kawzone (boutique interne OU vendeur en commission). Les
// sous-commandes 100% autonomes restent disponibles via `allRows`.
// ═══════════════════════════════════════════════════════════════

import { useMemo } from "react";
import { useOrderAggregatesBatch } from "./useOrderAggregatesBatch";
import { useCockpitVendorScope } from "./useCockpitVendorScope";
import { deriveSubOrders, type DerivedSubOrder } from "@/cockpit/lib/sub-orders";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";
import type { OrderArticle } from "@/cockpit/lib/article-states";
import type { VendorCockpitScope } from "@/lib/cockpit-vendor-scope.functions";

export interface SubOrderRow extends DerivedSubOrder {
  mother_order_id: string;
  order: LogisticsOrderRow;
  siblings: Array<{ vendor_id: string; vendor_name: string; index: number; total: number; label: string }>;
  /** Scope Cockpit — calculé depuis profiles.is_admin_shop / vendor_mode. */
  cockpit_scope: VendorCockpitScope;
  /** Raccourci : true si la sous-commande appartient au Cockpit principal. */
  is_kawzone_managed: boolean;
}

export function useSubOrderRows(orders: LogisticsOrderRow[]) {
  const enriched = useOrderAggregatesBatch(orders);

  // 1) Dérive toutes les sous-commandes (sans encore connaître leur scope).
  const baseRows = useMemo(() => {
    const all: Omit<SubOrderRow, "cockpit_scope" | "is_kawzone_managed">[] = [];
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

  // 2) Charge le scope (kawzone / commission / autonomous) pour les vendor_ids présents.
  const vendorIds = useMemo(() => baseRows.map(r => r.vendor_id), [baseRows]);
  const { map: scopeMap, isLoading: scopeLoading } = useCockpitVendorScope(vendorIds);

  // 3) Annote chaque ligne. Par défaut (vendor inconnu / pas encore chargé) on
  //    considère la sous-commande comme gérée pour ne RIEN cacher tant qu'on
  //    n'a pas la confirmation qu'elle est 100% autonome.
  const allRows = useMemo<SubOrderRow[]>(() => baseRows.map(r => {
    const scopeRow = scopeMap.get(r.vendor_id);
    const cockpit_scope: VendorCockpitScope = scopeRow?.scope ?? "kawzone";
    const is_kawzone_managed = scopeRow ? scopeRow.is_kawzone_managed : true;
    return { ...r, cockpit_scope, is_kawzone_managed };
  }), [baseRows, scopeMap]);

  // 4) Vue Cockpit principal : uniquement les sous-commandes qui demandent
  //    une intervention Kawzone.
  const rows = useMemo(() => allRows.filter(r => r.is_kawzone_managed), [allRows]);

  const articlesMap = useMemo(() => {
    const m: Record<string, OrderArticle[]> = {};
    for (const e of enriched) {
      const oid = e.order.order_id ?? "";
      if (oid) m[oid] = e.articles;
    }
    return m;
  }, [enriched]);

  const isLoading = enriched.some(e => e.isLoading) || scopeLoading;

  return { rows, allRows, articlesMap, enriched, isLoading };
}
