// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   HOOK : useRealOrders — Connexion aux vraies donnees Supabase
   ═══════════════════════════════════════════════════════════════ */

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { listLogisticsOrders } from "@/lib/admin-logistics.functions";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";

export function useRealOrders() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["cockpit-orders"],
    queryFn: async () => {
      const result = await listLogisticsOrders({ data: { page: 1, pageSize: 100 } });
      return result.rows ?? [];
    },
    refetchInterval: 30000, // Refresh every 30s
  });

  const orders: LogisticsOrderRow[] = data ?? [];

  // LOCAL vs IMPORT
  const localOrders = useMemo(() => orders.filter(o => o.order_type === "local" || (!o.order_type && !o.shipping_service_id)), [orders]);
  const importOrders = useMemo(() => orders.filter(o => o.order_type === "import" || o.shipping_service_id), [orders]);

  // Filter by search
  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return orders;
    const q = searchTerm.toLowerCase().trim();
    return orders.filter(o =>
      (o.order_id ?? "").toLowerCase().includes(q) ||
      (o.customer_name ?? "").toLowerCase().includes(q) ||
      (o.customer_phone ?? "").toLowerCase().includes(q) ||
      (o.tracking_number ?? "").toLowerCase().includes(q)
    );
  }, [orders, searchTerm]);

  // Actions
  const updateOrderStatus = useCallback((orderId: string, status: string) => {
    // TODO: Supabase mutation
    console.log("Update order", orderId, "to status", status);
    refetch();
  }, [refetch]);

  return {
    orders,
    localOrders,
    importOrders,
    filteredOrders,
    searchTerm,
    setSearchTerm,
    isLoading,
    error,
    refetch,
    updateOrderStatus,
  };
}
