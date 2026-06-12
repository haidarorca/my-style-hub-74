// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   WORKFLOW LOGIC — Regles metier Kawzone
   ═══════════════════════════════════════════════════════════════ */

import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";

export const FREIGHT_RATE_PER_KG = 7500;

export type CockpitStatus =
  | "new"           // A confirmer
  | "confirmed"     // Confirme
  | "to_weigh"      // A peser
  | "payment_pending" // Attente paiement
  | "ready"         // Pret a expedier
  | "shipped"       // Expedie
  | "delivered"     // Livre
  | "cancelled";    // Annule

export const STATUS_LABELS: Record<string, string> = {
  new: "A confirmer",
  confirmed: "Confirme",
  to_weigh: "A peser",
  payment_pending: "Attente paiement",
  ready: "Pret",
  shipped: "Expedie",
  delivered: "Livre",
  cancelled: "Annule",
};

export const STATUS_COLORS: Record<string, string> = {
  new: "bg-purple-100 text-purple-800",
  confirmed: "bg-blue-100 text-blue-800",
  to_weigh: "bg-orange-100 text-orange-800",
  payment_pending: "bg-amber-100 text-amber-800",
  ready: "bg-emerald-100 text-emerald-800",
  shipped: "bg-indigo-100 text-indigo-800",
  delivered: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-800",
};

export const GROUP_COLORS: Record<string, string> = {
  new: "border-l-purple-500 bg-purple-50",
  confirmed: "border-l-blue-500 bg-blue-50",
  to_weigh: "border-l-orange-500 bg-orange-50",
  payment_pending: "border-l-amber-500 bg-amber-50",
  ready: "border-l-emerald-500 bg-emerald-50",
  shipped: "border-l-indigo-500 bg-indigo-50",
  delivered: "border-l-gray-400 bg-gray-50",
  cancelled: "border-l-red-500 bg-red-50",
};

/* ── Mapping : logistics_status → cockpit status ── */
export function mapStatus(row: LogisticsOrderRow): CockpitStatus {
  const ls = row.logistics_status;
  const rem = row.amount_remaining ?? 0;

  if (ls === "cancelled") return "cancelled";
  if (ls === "delivered" || ls === "shipped") return ls as CockpitStatus;
  if (ls === "ready_to_ship" || ls === "validated") return "ready";
  if (ls === "awaiting_weighing") return "to_weigh";
  if (ls === "fees_calculated" || ls === "awaiting_client_validation") {
    return rem > 0 ? "payment_pending" : "ready";
  }
  if (ls === "confirmed") {
    return rem > 0 ? "payment_pending" : "confirmed";
  }
  if (!ls || ls === "new") {
    return "new";
  }
  return "confirmed";
}

/* ── Calcul fret ── */
export function calculateFreight(realWeight: number, volWeight: number, ratePerKg: number = FREIGHT_RATE_PER_KG): number {
  const chargeable = Math.max(realWeight, volWeight);
  return Math.round(chargeable * ratePerKg);
}

/* ── Format FCFA ── */
export function fmtF(n: number | null | undefined): string {
  if (n === null || n === undefined) return "0 FCFA";
  const val = Number(n);
  if (isNaN(val) || val === 0) return "0 FCFA";
  return val.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " FCFA";
}

/* ── WhatsApp link ── */
export function waLink(phone: string, message: string): string {
  const clean = phone.replace(/[^0-9+]/g, "").replace(/^0/, "221");
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

/* ── Detection order type ── */
export function detectType(row: LogisticsOrderRow): "local" | "import" {
  if (row.order_type === "local") return "local";
  if (row.order_type === "import") return "import";
  // Mixed or unknown: check if has shipping service
  return row.shipping_service_id ? "import" : "local";
}

/* ── Group orders by status for Actions view ── */
export function groupByAction(orders: LogisticsOrderRow[]) {
  return {
    new: orders.filter(o => mapStatus(o) === "new"),
    payment_pending: orders.filter(o => mapStatus(o) === "payment_pending"),
    to_weigh: orders.filter(o => mapStatus(o) === "to_weigh"),
    ready: orders.filter(o => mapStatus(o) === "ready"),
    shipped: orders.filter(o => mapStatus(o) === "shipped"),
  };
}

/* ── KPI calculations ── */
export function calculateKpi(orders: LogisticsOrderRow[]) {
  const today = new Date().toISOString().slice(0, 10);

  // Count by status
  const statusCounts: Record<string, number> = {};
  for (const o of orders) {
    const s = mapStatus(o);
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }

  // Total debt
  const totalDebt = orders.reduce((s, o) => s + (o.amount_remaining ?? 0), 0);

  // Pending payment count
  const pendingPayment = orders.filter(o => (o.amount_remaining ?? 0) > 0 && o.logistics_status !== "delivered" && o.logistics_status !== "cancelled").length;

  // To weigh count
  const toWeigh = orders.filter(o => o.logistics_status === "awaiting_weighing").length;

  // Ready to ship
  const ready = orders.filter(o => o.logistics_status === "validated" || o.logistics_status === "ready_to_ship").length;

  return {
    newCount: statusCounts["new"] ?? 0,
    pendingPayment,
    toWeigh,
    ready,
    shipped: statusCounts["shipped"] ?? 0,
    totalDebt,
    totalOrders: orders.length,
  };
}
