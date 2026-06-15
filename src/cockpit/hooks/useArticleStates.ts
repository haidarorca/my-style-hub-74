/* ═══════════════════════════════════════════════════════════════
   useArticleStates — Hook React Query
   Article = source de vérité métier · Commande = vue agrégée.

   Fusionne :
   - getOrderItems (catalogue figé : qty, prix, vendor, is_import, …)
   - listArticleStates (état mutant : status, delivered_qty, stock_break, settlement, version)

   Expose mutate(patch) qui persiste via upsertArticleState avec versioning optimiste.
   ═══════════════════════════════════════════════════════════════ */

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getOrderItems } from "@/lib/cockpit-payments.functions";
import { listArticleStates, upsertArticleState } from "@/lib/article-states.functions";
import type { ArticleStateRow, Json } from "@/lib/article-states.functions";
import type { OrderArticle, ArticleStatus, StockBreakDecision, Settlement } from "@/cockpit/lib/article-states";

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

/** Projette un statut initial cohérent avec le statut commande (pour les articles sans row DB). */
function projectInitialStatus(orderStatus: string | undefined, isImport: boolean): ArticleStatus {
  const s = orderStatus ?? "";
  if (s === "delivered") return "delivered";
  if (s === "ready" || s === "ready_delivery" || s === "shipped") return "ready";
  if (s === "received_warehouse") return isImport ? "received" : "available";
  if (s === "ordered_supplier") return isImport ? "ordered" : "pending";
  return "pending";
}

function mergeRow(item: CatalogItem, row: ArticleStateRow | undefined, orderStatus: string | undefined): OrderArticle {
  const isImport = item.is_import ?? false;
  const isLocal = item.is_local ?? false;
  const status = (row?.status as ArticleStatus | undefined) ?? projectInitialStatus(orderStatus, isImport);
  return {
    product_id: item.product_id,
    product_name: item.product_name ?? "Produit",
    product_image: item.product_image ?? null,
    variant_id: item.variant_id ?? null,
    variant_label: item.variant_label ?? null,
    size: item.size ?? null,
    color: item.color ?? null,
    quantity: item.quantity ?? 1,
    unit_price: item.unit_price ?? 0,
    line_total: item.line_total ?? 0,
    is_import: isImport,
    is_local: isLocal,
    vendor_id: item.shop_id ?? null,
    vendor_name: item.owner_name ?? item.shop_name ?? null,
    shop_type_label: item.shop_type_label ?? null,
    origin_country: item.origin_country ?? null,
    origin_country_flag: item.origin_country_flag ?? null,
    status,
    delivered_qty: row?.delivered_qty ?? 0,
    stock_break: (row?.stock_break as unknown as StockBreakDecision | undefined) ?? undefined,
    settlement: (row?.settlement as unknown as Settlement | undefined) ?? undefined,
    version: row?.version,
    updated_by: row?.updated_by,
    updated_at: row?.updated_at,
  };
}

export interface ArticlePatch {
  status?: ArticleStatus;
  delivered_qty?: number;
  stock_break?: StockBreakDecision | null;
  settlement?: Settlement | null;
}

export interface MutateInput {
  product_id: string;
  variant_id?: string | null;
  patch: ArticlePatch;
  /** Libellé court de l'action métier pour l'audit (ex: "stock_break.declare"). */
  audit_action: string;
  /** Version actuelle connue côté UI — déclenche un check de concurrence si fournie. */
  expected_version?: number;
}

export function useArticleStates(orderId: string | null | undefined, orderStatus?: string) {
  const qc = useQueryClient();
  const listFn = useServerFn(listArticleStates);
  const upsertFn = useServerFn(upsertArticleState);

  const enabled = !!orderId;

  const itemsQ = useQuery({
    queryKey: ["order-items", orderId],
    queryFn: async () => {
      const r = await getOrderItems({ data: { order_id: orderId! } });
      const items = (r as { items?: CatalogItem[] } | undefined)?.items ?? [];
      return items;
    },
    enabled,
    staleTime: 60_000,
  });

  const statesQ = useQuery({
    queryKey: ["article-states", orderId],
    queryFn: () => listFn({ data: { order_id: orderId! } }),
    enabled,
    staleTime: 10_000,
  });

  const articles: OrderArticle[] = (itemsQ.data ?? []).map(item => {
    const row = (statesQ.data ?? []).find(
      r => r.product_id === item.product_id && (r.variant_id ?? null) === (item.variant_id ?? null)
    );
    return mergeRow(item, row, orderStatus);
  });

  const mutation = useMutation({
    mutationFn: async (input: MutateInput) => {
      if (!orderId) throw new Error("orderId requis");
      const res = await upsertFn({
        data: {
          order_id: orderId,
          product_id: input.product_id,
          variant_id: input.variant_id ?? null,
          patch: {
            status: input.patch.status,
            delivered_qty: input.patch.delivered_qty,
            stock_break: input.patch.stock_break as Json | null | undefined,
            settlement: input.patch.settlement as Json | null | undefined,
          },
          expected_version: input.expected_version,
          audit_action: input.audit_action,
        },
      });
      return res;
    },
    onSuccess: (res) => {
      if (!res.ok && res.error === "version_conflict") {
        toast.warning("Cet article a été modifié ailleurs — la vue a été rafraîchie.");
      }
      qc.invalidateQueries({ queryKey: ["article-states", orderId] });
    },
    onError: (err) => {
      console.error("[useArticleStates] mutate error", err);
      toast.error("Échec d'enregistrement de l'article.");
    },
  });

  const mutate = useCallback(
    (input: MutateInput) => mutation.mutateAsync(input),
    [mutation]
  );

  return {
    articles,
    isLoading: itemsQ.isLoading || statesQ.isLoading,
    isError: itemsQ.isError || statesQ.isError,
    refetch: () => {
      qc.invalidateQueries({ queryKey: ["order-items", orderId] });
      qc.invalidateQueries({ queryKey: ["article-states", orderId] });
    },
    mutate,
    isMutating: mutation.isPending,
  };
}
