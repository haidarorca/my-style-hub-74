// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   HOOK : useAdmin1Orders — Connecte aux vraies donnees Supabase
   ═══════════════════════════════════════════════════════════════ */

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { listLogisticsOrders } from "@/lib/admin-logistics.functions";
import type { KawzoneOrder, PaymentLog, OrderWithDetails } from "@/admin1/types/admin1";

/* ── Mapping : WorkflowRow → KawzoneOrder ── */
function mapToKawzoneOrders(rows: any[]): KawzoneOrder[] {
  return rows.map((r, i) => ({
    id: r.order_id ?? `ord_${i}`,
    order_number: r.order_id ? `#${String(r.order_id).slice(-3).padStart(3, "0")}` : `#${String(i + 1).padStart(3, "0")}`,
    customer_name: r.customer_name ?? "—",
    customer_phone: r.customer_phone ?? "—",
    customer_address: r.customer_address ?? undefined,
    status: mapStatus(r.logistics_status, r.order_type),
    order_type: (r.order_type === "commission" ? "import" : r.order_type) ?? "local",
    total_product_amount: r.order_total ?? 0,
    shipping_fees: r.total_shipping_fees ?? 0,
    total_due: (r.order_total ?? 0) + (r.total_shipping_fees ?? 0),
    total_paid: r.amount_paid ?? 0,
    balance: r.amount_remaining ?? ((r.order_total ?? 0) + (r.total_shipping_fees ?? 0) - (r.amount_paid ?? 0)),
    created_at: r.order_created_at ?? new Date().toISOString(),
    updated_at: r.shipped_at ?? r.order_created_at ?? new Date().toISOString(),
    confirmed_at: r.confirmed_at ?? undefined,
    delivered_at: r.shipped_at ?? undefined,
    admin_notes: r.admin_comment ?? undefined,
  }));
}

/* ── Mapping des statuts ── */
function mapStatus(ls: string | null, ot: string | null): KawzoneOrder["status"] {
  if (!ls || ls === "new") return "new";
  if (ls === "confirmed") return "confirmed";
  if (ls === "awaiting_weighing") return "warehouse_arrived";
  if (ls === "fees_calculated") return "fees_calculated";
  if (ls === "awaiting_client_validation") return "fees_calculated";
  if (ls === "validated") return "ready_to_ship";
  if (ls === "ready_to_ship") return "ready_to_ship";
  if (ls === "shipped") return "shipped";
  if (ls === "delivered") return "delivered";
  if (ls === "cancelled") return "cancelled";
  return "new";
}

export function useAdmin1Orders() {
  /* ── Requete Supabase reelle ── */
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin1-orders"],
    queryFn: async () => {
      const result = await listLogisticsOrders({ data: { page: 1, pageSize: 500 } });
      return result;
    },
  });

  const rawRows: any[] = data?.rows ?? [];

  /* ── Convertir en KawzoneOrders ── */
  const [orders, setOrders] = useState<KawzoneOrder[]>(() => mapToKawzoneOrders(rawRows));
  const [payments, setPayments] = useState<PaymentLog[]>([]);

  /* ── Mettre a jour quand les donnees arrivent ── */
  useMemo(() => {
    if (rawRows.length > 0) {
      setOrders(mapToKawzoneOrders(rawRows));
    }
  }, [rawRows.length]);

  /* ── Mettre a jour une commande ── */
  const updateOrder = useCallback((orderId: string, patch: Partial<KawzoneOrder>) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, ...patch, updated_at: new Date().toISOString() } : o))
    );
  }, []);

  /* ── Ajouter un paiement ── */
  const addPayment = useCallback((payment: Omit<PaymentLog, "id" | "recorded_at">) => {
    const newPayment: PaymentLog = {
      ...payment,
      id: `pay_${Date.now()}`,
      recorded_at: new Date().toISOString(),
    };
    setPayments((prev) => [...prev, newPayment]);
    // Mettre a jour le total_paid et balance
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id === payment.order_id) {
          const newPaid = o.total_paid + payment.amount;
          return { ...o, total_paid: newPaid, balance: Math.max(0, o.total_due - newPaid) };
        }
        return o;
      })
    );
  }, []);

  /* ── Assemblage ── */
  const ordersWithDetails: OrderWithDetails[] = useMemo(() => {
    return orders.map((order) => {
      const orderPayments = payments.filter((p) => p.order_id === order.id);
      return { ...order, packages: [], payments: orderPayments, status_history: [] };
    });
  }, [orders, payments]);

  /* ── Compteurs ── */
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1;
    return {
      new: c["new"] ?? 0,
      deposit: c["confirmed"] ?? 0,
      processing: (c["deposit_paid"] ?? 0) + (c["processing"] ?? 0),
      weigh: c["warehouse_arrived"] ?? 0,
      balance: c["fees_calculated"] ?? 0,
      ship: c["ready_to_ship"] ?? 0,
      delivery: c["shipped"] ?? 0,
      closed: c["delivered"] ?? 0,
    };
  }, [orders]);

  /* ── Recherche ── */
  const searchOrders = useCallback((term: string): OrderWithDetails[] => {
    if (!term.trim()) return ordersWithDetails;
    const q = term.toLowerCase().trim();
    return ordersWithDetails.filter((o) =>
      o.order_number.toLowerCase().includes(q) ||
      o.customer_name.toLowerCase().includes(q) ||
      o.customer_phone.toLowerCase().includes(q)
    );
  }, [ordersWithDetails]);

  /* ── Filtrer ── */
  const filterByStatuses = useCallback((statuses: string[]): OrderWithDetails[] => {
    return ordersWithDetails.filter((o) => statuses.includes(o.status));
  }, [ordersWithDetails]);

  return {
    orders: ordersWithDetails,
    rawOrders: orders,
    rawPayments: payments,
    counts,
    isLoading,
    error,
    searchOrders,
    filterByStatuses,
    updateOrder,
    addPayment,
  };
}
