// ═══════════════════════════════════════════════════════════════
// useOrderAggregatesBatch — agrège un lot de commandes en parallèle
//
// ▸ Utilisé par la nouvelle vue Cockpit (CockpitNext) pour calculer
//   les compteurs « ligne du feu » à partir de l'agrégateur réel.
// ▸ Limite : 1 requête article + 1 requête states par commande.
//   À remplacer plus tard par une server fn batch côté Lovable Cloud.
// ═══════════════════════════════════════════════════════════════

import { useQueries } from "@tanstack/react-query";
import { getOrderItems } from "@/lib/cockpit-payments.functions";
import { listArticleStates } from "@/lib/article-states.functions";
import { mergeRow } from "./useArticleStates";
import { aggregateOrder, type OrderAggregate } from "@/cockpit/lib/order-aggregate";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";

export interface OrderWithAggregate {
  order: LogisticsOrderRow;
  aggregate: OrderAggregate | null;  // null tant que les articles ne sont pas chargés
  isLoading: boolean;
}

interface CatalogItem {
  product_id: string;
  product_name?: string;
  product_image?: string | null;
  variant_id?: string | null;
  variant_label?: string | null;
  size?: string | null;
  color?: string | null;
  quantity?: number;
  unit_price?: number;
  line_total?: number;
  is_import?: boolean;
  is_local?: boolean;
  shop_id?: string | null;
  owner_name?: string | null;
  shop_name?: string | null;
  shop_type_label?: string | null;
  origin_country?: string | null;
  origin_country_flag?: string | null;
}

export function useOrderAggregatesBatch(orders: LogisticsOrderRow[], max = 60): OrderWithAggregate[] {
  const scoped = orders.slice(0, max);

  const queries = useQueries({
    queries: scoped.map(o => ({
      queryKey: ["order-aggregate-batch", o.order_id],
      queryFn: async () => {
        const oid = o.order_id!;
        const [itemsRes, statesRes] = await Promise.all([
          getOrderItems({ data: { order_id: oid } }),
          listArticleStates({ data: { order_id: oid } }),
        ]);
        const items = ((itemsRes as { items?: CatalogItem[] } | undefined)?.items ?? []) as CatalogItem[];
        const states = statesRes ?? [];
        const articles = items.map(it => {
          const row = states.find(r => r.product_id === it.product_id && (r.variant_id ?? null) === (it.variant_id ?? null));
          return mergeRow(it, row, o.logistics_status ?? undefined);
        });
        return aggregateOrder(articles, o.logistics_status ?? undefined);
      },
      enabled: !!o.order_id,
      staleTime: 30_000,
    })),
  });

  return scoped.map((o, i) => ({
    order: o,
    aggregate: (queries[i]?.data ?? null) as OrderAggregate | null,
    isLoading: !!queries[i]?.isLoading,
  }));
}
