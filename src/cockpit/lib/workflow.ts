// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   WORKFLOW LOGIC — Regles metier Kawzone Cockpit
   
   Regles exactes des KPI :
   - A confirmer     : mapStatus(order) === "new"
   - Attente paiement: mapStatus(order) === "payment_pending" 
   - A peser         : logistics_status === "awaiting_weighing"
   - Pret            : logistics_status === "validated" || "ready_to_ship"
   - Expedie         : mapStatus(order) === "shipped"
   - Dette clients   : SUM(grandTotal - totalPaid) pour toutes les commandes non livrees/non annulees
   ═══════════════════════════════════════════════════════════════ */

import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";

export const FREIGHT_RATE_PER_KG = 7500;

/* ═══ Types de statut cockpit (vue groupee) ═══ */

export type CockpitStatus =
  | "new"              // A confirmer
  | "confirmed"        // Confirmee
  | "to_weigh"         // A peser
  | "payment_pending"  // Attente paiement
  | "ready"            // Pret a expedier
  | "shipped"          // Expediee
  | "delivered"        // Livree
  | "cancelled";       // Annulee

/* ═══ Statuts IMPORT detailles (10 etapes) ═══ */

export type ImportWorkflowStatus =
  | "new"                        // 1. Nouvelle commande
  | "confirmed"                  // 2. Commande validee
  | "ordered_from_supplier"      // 3. Commandee fournisseur
  | "received_at_agent"          // 4. Recue chez l'agent
  | "awaiting_weighing"          // 5. A peser
  | "fees_calculated"            // 6. Fret calcule
  | "awaiting_client_validation" // 7. En attente validation client
  | "awaiting_payment"           // 8. En attente paiement fret
  | "ready_to_ship"              // 9. Prete a expedier
  | "shipped"                    // 10. Expediee
  | "delivered";                 // 11. Livree

export const STATUS_LABELS: Record<string, string> = {
  // Cockpit statuses
  new: "A confirmer",
  confirmed: "Confirmee",
  to_weigh: "A peser",
  payment_pending: "Attente paiement",
  ready: "Pret a expedier",
  shipped: "Expediee",
  delivered: "Livree",
  cancelled: "Annulee",
  // Import workflow detail
  ordered_from_supplier: "Commandee fournisseur",
  received_at_agent: "Recue chez l'agent",
  fees_calculated: "Fret calcule",
  awaiting_client_validation: "Validation client",
  awaiting_payment: "Attente paiement fret",
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
  ordered_from_supplier: "bg-cyan-100 text-cyan-800",
  received_at_agent: "bg-teal-100 text-teal-800",
  fees_calculated: "bg-violet-100 text-violet-800",
  awaiting_client_validation: "bg-pink-100 text-pink-800",
  awaiting_payment: "bg-amber-100 text-amber-800",
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

/* ═══ WORKFLOW IMPORT : 10 etapes ═══ */

export const IMPORT_WORKFLOW_STEPS: { key: ImportWorkflowStatus; label: string }[] = [
  { key: "new", label: "Nouvelle" },
  { key: "confirmed", label: "Validee" },
  { key: "ordered_from_supplier", label: "Cmd fournisseur" },
  { key: "received_at_agent", label: "Recue agent" },
  { key: "awaiting_weighing", label: "A peser" },
  { key: "fees_calculated", label: "Fret calcule" },
  { key: "awaiting_client_validation", label: "Validation client" },
  { key: "awaiting_payment", label: "Attente paiement" },
  { key: "ready_to_ship", label: "Prete a expedier" },
  { key: "shipped", label: "Expediee" },
  { key: "delivered", label: "Livree" },
];

export function getImportStepIndex(status: string | null): number {
  if (!status) return 0;
  const idx = IMPORT_WORKFLOW_STEPS.findIndex(s => s.key === status);
  return idx >= 0 ? idx : 0;
}

/* ═══ Mapping : logistics_status → cockpit status ═══ */

export function mapStatus(row: LogisticsOrderRow): CockpitStatus {
  const ls = row.logistics_status;
  const rem = row.amount_remaining ?? 0;

  if (ls === "cancelled") return "cancelled";
  if (ls === "delivered") return "delivered";
  if (ls === "shipped") return "shipped";
  if (ls === "ready_to_ship") return "ready";
  if (ls === "validated") return "ready";
  if (ls === "awaiting_weighing") return "to_weigh";
  if (ls === "fees_calculated" || ls === "awaiting_client_validation" || ls === "awaiting_payment") {
    return rem > 0 ? "payment_pending" : "ready";
  }
  if (ls === "ordered_from_supplier" || ls === "received_at_agent") {
    // Ces statuts intermediaires IMPORT sont regroupes sous "confirmed"
    return "confirmed";
  }
  if (ls === "confirmed") {
    return rem > 0 ? "payment_pending" : "confirmed";
  }
  if (!ls || ls === "new") return "new";
  return "confirmed";
}

/* ═══ Label detaille avec numero d'etape IMPORT ═══ */

export function getStatusLabel(row: LogisticsOrderRow): string {
  const isImport = !!row.shipping_service_id || row.order_type === "import";
  const ls = row.logistics_status;

  // Si IMPORT et statut intermediaire, afficher le detail
  if (isImport && ls) {
    const stepIdx = getImportStepIndex(ls);
    if (STATUS_LABELS[ls]) {
      return `${stepIdx + 1}. ${STATUS_LABELS[ls]}`;
    }
  }

  const cockpitStatus = mapStatus(row);
  return STATUS_LABELS[cockpitStatus] ?? cockpitStatus;
}

/* ═══ Calcul fret ═══ */

export function calculateFreight(realWeight: number, volWeight: number, ratePerKg: number = FREIGHT_RATE_PER_KG): number {
  const chargeable = Math.max(realWeight, volWeight);
  return Math.round(chargeable * ratePerKg);
}

/* ═══ Calcul poids volumetrique ═══ */

export function calculateVolumetricWeight(lengthCm: number, widthCm: number, heightCm: number, divisor: number = 5000): number {
  return (lengthCm * widthCm * heightCm) / divisor;
}

/* ═══ Format FCFA ═══ */

export function fmtF(n: number | null | undefined): string {
  if (n === null || n === undefined) return "0 FCFA";
  const val = Number(n);
  if (isNaN(val) || val === 0) return "0 FCFA";
  return val.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " FCFA";
}

/* ═══ WhatsApp link ═══ */

export function waLink(phone: string, message: string): string {
  const clean = phone.replace(/[^0-9+]/g, "").replace(/^0/, "221");
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

/* ═══ Detection order type ═══ */

export function detectType(row: LogisticsOrderRow): "local" | "import" {
  if (row.order_type === "local") return "local";
  if (row.order_type === "import") return "import";
  return row.shipping_service_id ? "import" : "local";
}

/* ═══ Group orders by status for Actions view ═══ */

export function groupByAction(orders: LogisticsOrderRow[]) {
  return {
    new: orders.filter(o => mapStatus(o) === "new"),
    payment_pending: orders.filter(o => mapStatus(o) === "payment_pending"),
    to_weigh: orders.filter(o => mapStatus(o) === "to_weigh"),
    ready: orders.filter(o => mapStatus(o) === "ready"),
    shipped: orders.filter(o => mapStatus(o) === "shipped"),
  };
}

/* ═══════════════════════════════════════════════════════════════
   KPI calculations — REGLES EXACTES
   
   IMPORTANT: Les KPI "Attente paiement" et "Dette" utilisent
   les paiements locaux (pas amount_remaining de Supabase qui
   est toujours a 0 dans la vue actuelle).
   
   Pour corriger : le KPI pendingPayment doit utiliser :
   grandTotal = order_total + total_shipping_fees
   totalPaid  = SUM des paiements locaux
   remaining  = grandTotal - totalPaid
   
   Mais comme les paiements ne sont pas encore dans cette fonction,
   on documente la regle exacte ici.
   ═══════════════════════════════════════════════════════════════ */

export interface KpiInput {
  orders: LogisticsOrderRow[];
  /** total paye par commande : { [orderId]: totalPaid } */
  totalPaidByOrder?: Record<string, number>;
}

export function calculateKpi(input: KpiInput) {
  const { orders, totalPaidByOrder = {} } = input;

  // Count by cockpit status
  const statusCounts: Record<string, number> = {};
  for (const o of orders) {
    const s = mapStatus(o);
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }

  // A confirmer : statut cockpit === "new"
  const newCount = statusCounts["new"] ?? 0;

  // Attente paiement : statut cockpit === "payment_pending"
  // (regle: fees_calculated/awaiting_client_validation/confirmed avec solde > 0)
  const pendingPayment = statusCounts["payment_pending"] ?? 0;

  // A peser : logistics_status EXACT === "awaiting_weighing"
  const toWeigh = orders.filter(o => o.logistics_status === "awaiting_weighing").length;

  // Pret : logistics_status === "validated" OU "ready_to_ship"
  const ready = orders.filter(o => o.logistics_status === "validated" || o.logistics_status === "ready_to_ship").length;

  // Expedie : statut cockpit === "shipped"
  const shipped = statusCounts["shipped"] ?? 0;

  // Dette clients : SUM(remaining) pour commandes non livrees, non annulees
  // Utilise les paiements locaux si disponibles
  let totalDebt = 0;
  for (const o of orders) {
    const ls = o.logistics_status;
    if (ls === "delivered" || ls === "cancelled") continue;

    const grandTotal = (o.order_total ?? 0) + (o.total_shipping_fees ?? 0);
    const paid = totalPaidByOrder[o.order_id ?? ""] ?? o.amount_paid ?? 0;
    const remaining = Math.max(0, grandTotal - paid);
    totalDebt += remaining;
  }

  return {
    newCount,           // Regle: mapStatus === "new"
    pendingPayment,     // Regle: mapStatus === "payment_pending"
    toWeigh,            // Regle: logistics_status === "awaiting_weighing"
    ready,              // Regle: logistics_status IN ("validated", "ready_to_ship")
    shipped,            // Regle: mapStatus === "shipped"
    totalDebt,          // Regle: SUM(remaining) pour non livrees/non annulees
    totalOrders: orders.length,
  };
}

/* ═══ Regles d'annulation ═══ */

export interface CancellationCheck {
  canCancel: boolean;
  reason: string;
  paidAmount: number;
  refundOptions: ("refund" | "credit" | "no_refund")[];
  warnings: string[];
}

export function checkCanCancel(order: LogisticsOrderRow, totalPaid: number): CancellationCheck {
  const warnings: string[] = [];
  const refundOptions: ("refund" | "credit" | "no_refund")[] = [];
  let canCancel = true;
  let reason = "";

  const ls = order.logistics_status;
  const isLocal = !order.shipping_service_id && order.order_type !== "import";

  // Rule 1: Delivered = cannot cancel
  if (ls === "delivered") {
    canCancel = false;
    reason = "Commande deja livree — annulation impossible";
    warnings.push("La commande a ete livree au client");
    return { canCancel, reason, paidAmount: totalPaid, refundOptions, warnings };
  }

  // Rule 2: Shipped = warning
  if (ls === "shipped") {
    warnings.push("La commande est deja expediee");
    refundOptions.push("refund", "credit");
  }

  // Rule 3: IMPORT ordered from supplier = warning
  if (!isLocal && ls === "ordered_from_supplier") {
    warnings.push("Le fournisseur a deja ete commande");
    refundOptions.push("credit", "no_refund");
  }

  // Rule 4: IMPORT received at agent = warning
  if (!isLocal && ls === "received_at_agent") {
    warnings.push("Le colis est deja chez l'agent");
    refundOptions.push("credit", "no_refund");
  }

  // Rule 5: Payment exists
  if (totalPaid > 0) {
    refundOptions.push("refund", "credit", "no_refund");
    if (canCancel) {
      reason = `${fmtF(totalPaid)} payes — choisir le type de remboursement`;
    }
  } else {
    refundOptions.push("no_refund");
    if (canCancel) {
      reason = "Aucun paiement — annulation sans remboursement";
    }
  }

  // Default reason
  if (!reason && canCancel) {
    reason = "Annulation autorisee";
  }

  return { canCancel, reason, paidAmount: totalPaid, refundOptions, warnings };
}

/* ═══ Types de remboursement ═══ */

export const REFUND_LABELS: Record<string, string> = {
  refund: "Remboursement",
  credit: "Credit client",
  no_refund: "Sans remboursement",
};
