// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   HOOK : useAdmin1Orders — Requete Supabase pour admin1
   ═══════════════════════════════════════════════════════════════ */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { KawzoneOrder, KawzonePackage, PaymentLog, OrderWithDetails } from "@/admin1/types/admin1";

/* ── Donnees factices pour demonstration (remplacer par Supabase) ── */
const DEMO_ORDERS: KawzoneOrder[] = [
  { id: "o1", order_number: "#001", customer_name: "Amadou Diallo", customer_phone: "+221 77 123 4567", customer_address: "Dakar, Mermoz", status: "new", order_type: "local", total_product_amount: 150000, shipping_fees: 0, total_due: 150000, total_paid: 0, balance: 150000, created_at: "2026-06-09T10:00:00Z", updated_at: "2026-06-09T10:00:00Z" },
  { id: "o2", order_number: "#002", customer_name: "Fatou Ndiaye", customer_phone: "+221 76 234 5678", customer_address: "Dakar, Plateau", status: "new", order_type: "import", total_product_amount: 450000, shipping_fees: 0, total_due: 450000, total_paid: 0, balance: 450000, created_at: "2026-06-09T11:00:00Z", updated_at: "2026-06-09T11:00:00Z" },
  { id: "o3", order_number: "#003", customer_name: "Ousmane Sow", customer_phone: "+221 70 345 6789", customer_address: "Thies", status: "confirmed", order_type: "mixed", total_product_amount: 850000, shipping_fees: 0, total_due: 850000, total_paid: 0, balance: 850000, created_at: "2026-06-08T09:00:00Z", updated_at: "2026-06-09T14:00:00Z", confirmed_at: "2026-06-09T14:00:00Z" },
  { id: "o4", order_number: "#004", customer_name: "Mariama Ba", customer_phone: "+221 78 456 7890", customer_address: "Dakar, Almadies", status: "deposit_paid", order_type: "import", total_product_amount: 1200000, shipping_fees: 0, total_due: 1200000, total_paid: 300000, balance: 900000, created_at: "2026-06-07T08:00:00Z", updated_at: "2026-06-08T10:00:00Z", confirmed_at: "2026-06-07T10:00:00Z" },
  { id: "o5", order_number: "#005", customer_name: "Ibrahima Fall", customer_phone: "+221 77 567 8901", customer_address: "Dakar, Ouakam", status: "warehouse_arrived", order_type: "import", total_product_amount: 650000, shipping_fees: 0, total_due: 650000, total_paid: 200000, balance: 450000, created_at: "2026-06-05T07:00:00Z", updated_at: "2026-06-09T16:00:00Z", confirmed_at: "2026-06-05T09:00:00Z" },
  { id: "o6", order_number: "#006", customer_name: "Aminata Diop", customer_phone: "+221 76 678 9012", customer_address: "Dakar, Yoff", status: "fees_calculated", order_type: "import", total_product_amount: 320000, shipping_fees: 52500, total_due: 372500, total_paid: 100000, balance: 272500, created_at: "2026-06-04T06:00:00Z", updated_at: "2026-06-09T17:00:00Z", confirmed_at: "2026-06-04T08:00:00Z" },
  { id: "o7", order_number: "#007", customer_name: "Cheikh Kane", customer_phone: "+221 70 789 0123", customer_address: "Dakar, Liberté", status: "ready_to_ship", order_type: "local", total_product_amount: 95000, shipping_fees: 5000, total_due: 100000, total_paid: 100000, balance: 0, created_at: "2026-06-03T05:00:00Z", updated_at: "2026-06-09T18:00:00Z", confirmed_at: "2026-06-03T07:00:00Z" },
  { id: "o8", order_number: "#008", customer_name: "Sophie Martin", customer_phone: "+221 78 890 1234", customer_address: "Dakar, Point E", status: "shipped", order_type: "import", total_product_amount: 780000, shipping_fees: 112500, total_due: 892500, total_paid: 892500, balance: 0, created_at: "2026-06-02T04:00:00Z", updated_at: "2026-06-09T19:00:00Z", confirmed_at: "2026-06-02T06:00:00Z", delivered_at: null },
  { id: "o9", order_number: "#009", customer_name: "Babacar Ndiaye", customer_phone: "+221 77 901 2345", customer_address: "Dakar, Fann", status: "delivered", order_type: "local", total_product_amount: 220000, shipping_fees: 0, total_due: 220000, total_paid: 220000, balance: 0, created_at: "2026-06-01T03:00:00Z", updated_at: "2026-06-09T20:00:00Z", confirmed_at: "2026-06-01T05:00:00Z", delivered_at: "2026-06-09T20:00:00Z" },
  { id: "o10", order_number: "#010", customer_name: "Amadou Diallo", customer_phone: "+221 77 123 4567", customer_address: "Dakar, Mermoz", status: "new", order_type: "import", total_product_amount: 540000, shipping_fees: 0, total_due: 540000, total_paid: 0, balance: 540000, created_at: "2026-06-09T12:00:00Z", updated_at: "2026-06-09T12:00:00Z" },
  { id: "o11", order_number: "#011", customer_name: "Khadija Sy", customer_phone: "+221 76 111 2223", customer_address: "Dakar, Grand Yoff", status: "confirmed", order_type: "local", total_product_amount: 180000, shipping_fees: 0, total_due: 180000, total_paid: 0, balance: 180000, created_at: "2026-06-09T13:00:00Z", updated_at: "2026-06-09T13:00:00Z" },
  { id: "o12", order_number: "#012", customer_name: "Moussa Traore", customer_phone: "+221 70 222 3334", customer_address: "Pikine", status: "warehouse_arrived", order_type: "import", total_product_amount: 890000, shipping_fees: 0, total_due: 890000, total_paid: 400000, balance: 490000, created_at: "2026-06-06T11:00:00Z", updated_at: "2026-06-09T15:00:00Z", confirmed_at: "2026-06-06T13:00:00Z" },
  { id: "o13", order_number: "#013", customer_name: "Awa Gueye", customer_phone: "+221 78 333 4445", customer_address: "Dakar, Sacre Coeur", status: "fees_calculated", order_type: "mixed", total_product_amount: 1100000, shipping_fees: 150000, total_due: 1250000, total_paid: 600000, balance: 650000, created_at: "2026-06-03T09:00:00Z", updated_at: "2026-06-09T17:30:00Z", confirmed_at: "2026-06-03T11:00:00Z" },
  { id: "o14", order_number: "#014", customer_name: "Lamine Diatta", customer_phone: "+221 77 444 5556", customer_address: "Dakar, Ngor", status: "processing", order_type: "import", total_product_amount: 670000, shipping_fees: 0, total_due: 670000, total_paid: 150000, balance: 520000, created_at: "2026-06-07T10:00:00Z", updated_at: "2026-06-09T14:30:00Z", confirmed_at: "2026-06-07T12:00:00Z" },
  { id: "o15", order_number: "#015", customer_name: "Ndeye Sall", customer_phone: "+221 76 555 6667", customer_address: "Dakar, HLM", status: "ready_to_ship", order_type: "local", total_product_amount: 145000, shipping_fees: 8000, total_due: 153000, total_paid: 153000, balance: 0, created_at: "2026-06-04T08:00:00Z", updated_at: "2026-06-09T18:30:00Z", confirmed_at: "2026-06-04T10:00:00Z" },
];

const DEMO_PACKAGES: KawzonePackage[] = [
  { id: "p1", order_id: "o5", package_type: "import", status: "warehouse_arrived", weight_kg: 5.2, volumetric_weight_kg: 6.1, freight_rate_per_kg: 7500, freight_cost: 45750, tracking_number: "TRK-001-ABC" },
  { id: "p2", order_id: "o6", package_type: "import", status: "fees_calculated", weight_kg: 3.5, volumetric_weight_kg: 4.2, freight_rate_per_kg: 7500, freight_cost: 52500, tracking_number: "TRK-002-DEF" },
  { id: "p3", order_id: "o8", package_type: "import", status: "shipped", weight_kg: 8.5, volumetric_weight_kg: 9.0, freight_rate_per_kg: 7500, freight_cost: 112500, tracking_number: "TRK-003-GHI", shipped_at: "2026-06-09T19:00:00Z" },
  { id: "p4", order_id: "o12", package_type: "import", status: "warehouse_arrived", weight_kg: 12.3, volumetric_weight_kg: 11.8, freight_rate_per_kg: 7500, freight_cost: 92250, tracking_number: "TRK-004-JKL" },
  { id: "p5", order_id: "o13", package_type: "local", status: "fees_calculated", freight_rate_per_kg: 0, freight_cost: 0 },
  { id: "p6", order_id: "o13", package_type: "import", status: "fees_calculated", weight_kg: 20.0, volumetric_weight_kg: 22.5, freight_rate_per_kg: 7500, freight_cost: 150000, tracking_number: "TRK-005-MNO" },
  { id: "p7", order_id: "o14", package_type: "import", status: "processing", freight_rate_per_kg: 7500, freight_cost: 0, tracking_number: "TRK-006-PQR" },
];

const DEMO_PAYMENTS: PaymentLog[] = [
  { id: "pay1", order_id: "o4", amount: 300000, method: "wave", reference: "WV-2026-001", recorded_by: "Admin", recorded_at: "2026-06-08T10:00:00Z", notes: "Acompte 25%" },
  { id: "pay2", order_id: "o5", amount: 200000, method: "orange_money", reference: "OM-2026-002", recorded_by: "Admin", recorded_at: "2026-06-08T14:00:00Z" },
  { id: "pay3", order_id: "o6", amount: 100000, method: "cash", reference: "", recorded_by: "Admin", recorded_at: "2026-06-09T08:00:00Z" },
  { id: "pay4", order_id: "o9", amount: 220000, method: "wave", reference: "WV-2026-003", recorded_by: "Admin", recorded_at: "2026-06-09T20:00:00Z" },
  { id: "pay5", order_id: "o12", amount: 400000, method: "bank_transfer", reference: "VIR-2026-004", recorded_by: "Admin", recorded_at: "2026-06-08T09:00:00Z" },
  { id: "pay6", order_id: "o13", amount: 600000, method: "wave", reference: "WV-2026-005", recorded_by: "Admin", recorded_at: "2026-06-08T11:00:00Z" },
  { id: "pay7", order_id: "o14", amount: 150000, method: "cash", reference: "", recorded_by: "Admin", recorded_at: "2026-06-08T16:00:00Z" },
];

export function useAdmin1Orders() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin1-orders"],
    queryFn: async () => {
      /* TODO: Remplacer par appel Supabase reel
      const { data: orders } = await supabase.from("orders").select("*");
      const { data: packages } = await supabase.from("packages").select("*");
      const { data: payments } = await supabase.from("payment_logs").select("*");
      */
      return {
        orders: DEMO_ORDERS,
        packages: DEMO_PACKAGES,
        payments: DEMO_PAYMENTS,
      };
    },
  });

  const orders: KawzoneOrder[] = data?.orders ?? [];
  const packages: KawzonePackage[] = data?.packages ?? [];
  const payments: PaymentLog[] = data?.payments ?? [];

  /* ── Assemblage : orders + packages + payments ── */
  const ordersWithDetails: OrderWithDetails[] = useMemo(() => {
    return orders.map((order) => {
      const orderPackages = packages.filter((p) => p.order_id === order.id);
      const orderPayments = payments.filter((p) => p.order_id === order.id);
      return { ...order, packages: orderPackages, payments: orderPayments, status_history: [] };
    });
  }, [orders, packages, payments]);

  /* ── Compteurs par statut ── */
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of orders) {
      c[o.status] = (c[o.status] ?? 0) + 1;
    }
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

  /* ── Recherche clientside ── */
  const searchOrders = (term: string): OrderWithDetails[] => {
    if (!term.trim()) return ordersWithDetails;
    const q = term.toLowerCase().trim();
    return ordersWithDetails.filter((o) =>
      o.order_number.toLowerCase().includes(q) ||
      o.customer_name.toLowerCase().includes(q) ||
      o.customer_phone.toLowerCase().includes(q) ||
      String(o.total_due).includes(q)
    );
  };

  /* ── Filtrer par statuts ── */
  const filterByStatuses = (statuses: string[]): OrderWithDetails[] => {
    return ordersWithDetails.filter((o) => statuses.includes(o.status));
  };

  return {
    orders: ordersWithDetails,
    counts,
    isLoading,
    error,
    searchOrders,
    filterByStatuses,
    refetch: () => {},
  };
}
