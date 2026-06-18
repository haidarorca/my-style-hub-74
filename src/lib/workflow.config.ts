import type {
  WorkflowStep,
  WorkflowFilterKey,
  WorkflowRow,
  PaymentBadgeVariant,
} from "@/types/workflow";

// ── CONFIG ───────────────────────────────────────────────────────

/**
 * Seuil de virtualisation — nombre de rows avant activation de
 * @tanstack/react-virtual. Modifiable sans refactor du reste du code.
 */
export const WORKFLOW_VIRTUALIZATION_THRESHOLD = 300;

// ── STEPS ────────────────────────────────────────────────────────

// Workflow A — Poids inconnu : passe par la pesée et le paiement complémentaire.
export const IMPORT_STEPS: WorkflowStep[] = [
  { key: "pending_arrival", label: "Réception" },
  { key: "awaiting_weighing", label: "Pesée" },
  { key: "fees_calculated", label: "Frais" },
  { key: "awaiting_client_validation", label: "Client" },
  { key: "validated", label: "Validée" },
  { key: "ready_to_ship", label: "Prêt" },
  { key: "shipped", label: "Expédié" },
  { key: "delivered", label: "Livrée" },
];

// Workflow B — Poids connu : pas de pesée client, pas de paiement complémentaire.
// La "Vérification" est interne (agent) et ne passe pas par le client.
export const IMPORT_STEPS_DECLARED: WorkflowStep[] = [
  { key: "pending_arrival", label: "Réception" },
  { key: "fees_calculated", label: "Vérification" },
  { key: "ready_to_ship", label: "Prêt" },
  { key: "shipped", label: "Expédié" },
  { key: "delivered", label: "Livrée" },
];

export const LOCAL_STEPS: WorkflowStep[] = [
  { key: "new", label: "Nouvelle" },
  { key: "confirmed", label: "Confirmée" },
  { key: "delivered", label: "Livrée" },
];

export function getSteps(orderType: string, weightStatus?: string | null): WorkflowStep[] {
  if (orderType === "local") return LOCAL_STEPS;
  // Poids déjà déclaré/vérifié/anomalie → workflow B (sans pesée client).
  if (weightStatus === "declared" || weightStatus === "verified" || weightStatus === "anomaly") {
    return IMPORT_STEPS_DECLARED;
  }
  return IMPORT_STEPS;
}

export function getStepIndex(
  steps: WorkflowStep[],
  status: string | null
): number {
  if (!status) {
    // null = "new" pour les commandes locales (pas encore confirmées)
    const newIdx = steps.findIndex((s) => s.key === "new");
    return newIdx >= 0 ? newIdx : -1;
  }
  return steps.findIndex((s) => s.key === status);
}

// ── FILTERS ──────────────────────────────────────────────────────

export type WorkflowFilterDef = {
  key: WorkflowFilterKey;
  label: string;
  color?: string;
};

export const WORKFLOW_FILTERS: WorkflowFilterDef[] = [
  { key: "actions", label: "Actions", color: "text-red-600" },
  { key: "all", label: "Toutes" },
  { key: "to_weigh", label: "À peser", color: "text-orange-600" },
  { key: "waiting_client", label: "Attente client", color: "text-yellow-600" },
  { key: "to_ship", label: "À expédier", color: "text-blue-600" },
  { key: "payment", label: "Paiement", color: "text-emerald-600" },
  { key: "urgent", label: "Urgences", color: "text-red-600" },
];

export function applyWorkflowFilter(
  rows: WorkflowRow[],
  filter: WorkflowFilterKey
): WorkflowRow[] {
  // Workflow B (poids déclaré/vérifié) : "to_weigh" et "waiting_client"
  // n'ont aucun sens, on les exclut explicitement de ces filtres.
  const isDeclared = (r: WorkflowRow) =>
    r.weight_status === "declared" || r.weight_status === "verified" || r.weight_status === "anomaly";
  switch (filter) {
    case "actions":
      return rows.filter(
        (r) =>
          (r.logistics_status === "awaiting_weighing" && !isDeclared(r)) ||
          r.logistics_status === "rejected" ||
          (r.logistics_status === "fees_calculated" && !isDeclared(r)) ||
          r.weight_status === "anomaly" ||
          (r.logistics_status === "validated" && (r.amount_remaining ?? 0) > 0) ||
          (r.logistics_status === "ready_to_ship" && !r.tracking_number) ||
          (r.order_type === "local" &&
            (r.logistics_status === "new" ||
              r.logistics_status === null ||
              r.logistics_status === undefined))
      );
    case "to_weigh":
      // Seules les commandes à poids inconnu apparaissent ici.
      return rows.filter(
        (r) => r.logistics_status === "awaiting_weighing" && !isDeclared(r),
      );
    case "waiting_client":
      return rows.filter(
        (r) => r.logistics_status === "awaiting_client_validation" && !isDeclared(r),
      );
    case "to_ship":
      return rows.filter((r) =>
        ["validated", "ready_to_ship"].includes(r.logistics_status ?? ""),
      );
    case "payment":
      // Pas de paiement complémentaire pour le workflow B.
      return rows.filter(
        (r) =>
          (r.payment_status === "pending" || r.payment_status === "partial") &&
          (r.amount_remaining ?? 0) > 0 &&
          !isDeclared(r),
      );
    case "urgent":
      return rows.filter(
        (r) =>
          (r.logistics_status === "awaiting_weighing" && r.days_pending > 7 && !isDeclared(r)) ||
          r.weight_status === "anomaly",
      );
    default:
      return rows;
  }
}

export function computeFilterCounts(
  rows: WorkflowRow[]
): Record<WorkflowFilterKey, number> {
  const isDeclared = (r: WorkflowRow) =>
    r.weight_status === "declared" || r.weight_status === "verified" || r.weight_status === "anomaly";
  return {
    actions: rows.filter(
      (r) =>
        (r.logistics_status === "awaiting_weighing" && !isDeclared(r)) ||
        r.logistics_status === "rejected" ||
        (r.logistics_status === "fees_calculated" && !isDeclared(r)) ||
        r.weight_status === "anomaly" ||
        (r.logistics_status === "validated" && (r.amount_remaining ?? 0) > 0) ||
        (r.logistics_status === "ready_to_ship" && !r.tracking_number) ||
        (r.order_type === "local" &&
          (r.logistics_status === "new" ||
            r.logistics_status === null ||
            r.logistics_status === undefined))
    ).length,
    all: rows.length,
    to_weigh: rows.filter(
      (r) => r.logistics_status === "awaiting_weighing" && !isDeclared(r),
    ).length,
    waiting_client: rows.filter(
      (r) => r.logistics_status === "awaiting_client_validation" && !isDeclared(r),
    ).length,
    to_ship: rows.filter((r) =>
      ["validated", "ready_to_ship"].includes(r.logistics_status ?? "")
    ).length,
    payment: rows.filter(
      (r) =>
        (r.payment_status === "pending" || r.payment_status === "partial") &&
        (r.amount_remaining ?? 0) > 0 &&
        !isDeclared(r),
    ).length,
    urgent: rows.filter(
      (r) =>
        (r.logistics_status === "awaiting_weighing" && r.days_pending > 7 && !isDeclared(r)) ||
        r.weight_status === "anomaly",
    ).length,
  };
}

// ── FORMATTERS ───────────────────────────────────────────────────

export function fmtF(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
}

export function fmtFees(value: number | null): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "0 FCFA";
  return fmtF(value);
}

export function fmtRemaining(
  value: number | null
): { text: string; alert: boolean; status: PaymentBadgeVariant | null } {
  if (value === null || value === undefined) {
    return { text: "À calculer", alert: false, status: null };
  }
  if (value < 0) {
    return { text: fmtF(Math.abs(value)) + " (trop-perçu)", alert: false, status: "paid" };
  }
  if (value === 0) {
    return { text: "0 FCFA", alert: false, status: "confirmed" };
  }
  return { text: fmtF(value), alert: true, status: "pending" };
}

export function getPaymentBadgeVariant(
  row: WorkflowRow
): { variant: PaymentBadgeVariant; label: string; color: string } {
  const ps = row.payment_status;
  const remaining = row.amount_remaining ?? 0;

  if (ps === "confirmed" || (remaining <= 0 && ps === "paid")) {
    return { variant: "confirmed", label: "Confirmé", color: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  }
  if (ps === "paid") {
    return { variant: "paid", label: "Payé", color: "bg-green-100 text-green-800 border-green-200" };
  }
  if (ps === "partial" || (remaining > 0 && ps === "pending" && row.amount_paid && row.amount_paid > 0)) {
    return { variant: "partial", label: `Partiel (${fmtF(row.amount_paid)})`, color: "bg-amber-100 text-amber-800 border-amber-200" };
  }
  if (ps === "waived") {
    return { variant: "waived", label: "Annulé", color: "bg-blue-100 text-blue-800 border-blue-200" };
  }
  if (ps === "refunded") {
    return { variant: "refunded", label: "Remboursé", color: "bg-gray-100 text-gray-800 border-gray-200" };
  }
  return { variant: "pending", label: remaining > 0 ? fmtF(remaining) : "Non payé", color: "bg-red-100 text-red-800 border-red-200" };
}

// ── ORDER TYPE ───────────────────────────────────────────────────

export function getOrderTypeLabel(type: string | null): {
  label: string;
  icon: string;
  color: string;
} {
  switch (type) {
    case "local":
      return { label: "LOCAL", icon: "L", color: "bg-emerald-500" };
    case "mixed":
      return { label: "MIXTE", icon: "M", color: "bg-amber-500" };
    case "import":
      return { label: "IMPORT", icon: "I", color: "bg-orange-500" };
    default:
      return { label: "LOCAL", icon: "L", color: "bg-emerald-500" };
  }
}

// ── DAYS BADGE ───────────────────────────────────────────────────

export function getDaysBadgeColor(days: number): string {
  if (days > 14) return "bg-red-500 text-white";
  if (days > 7) return "bg-orange-500 text-white";
  if (days > 3) return "bg-yellow-500 text-white";
  return "bg-gray-200 text-gray-700";
}

// ── ACTION AVAILABILITY ──────────────────────────────────────────

export function getAvailableActions(row: WorkflowRow): {
  primary?: { label: string; action: string };
  secondary?: { label: string; action: string };
  warning?: { label: string; action: string };
} {
  const ls = row.logistics_status;
  const ps = row.payment_status;
  const ot = row.order_type;

  // ═── WORKFLOW LOCAL (3 etapes) ───────────────────────────────
  if (ot === "local") {
    switch (ls) {
      case "new":
      case null:
      case undefined:
        return { primary: { label: "Confirmer", action: "confirm_local" } };
      case "confirmed":
        return { primary: { label: "Livrer", action: "deliver_local" } };
      case "delivered":
        return {}; // Termine
      default:
        return {};
    }
  }

  // ═── WORKFLOW IMPORT / MIXTE (7 etapes) ──────────────────────
  switch (ls) {
    case "awaiting_weighing":
      return {
        primary: { label: "Valider pesée", action: "validate_weighing" },
      };
    case "fees_calculated":
      // Circuit B : poids déclaré, vérification interne par l'agent.
      if (row.weight_status === "declared") {
        return { primary: { label: "Vérifier poids", action: "verify_weight" } };
      }
      return {
        primary: { label: "Envoyer au client", action: "send_to_client" },
      };
    case "awaiting_client_validation":
      return {
        secondary: { label: "Relancer WhatsApp", action: "remind_client" },
      };
    case "validated": {
      const hasOutstanding = (row.amount_remaining ?? 0) > 0;
      const isWaived = ps === "waived";
      if (isWaived) {
        return {
          primary: { label: "Prêt à embarquer", action: "ready_to_ship" },
        };
      }
      return {
        primary: { label: "Prêt à embarquer", action: "ready_to_ship" },
        ...(hasOutstanding
          ? { warning: { label: fmtF(row.amount_remaining) + " restant", action: "confirm_payment" } }
          : {}),
      };
    }
    case "ready_to_ship":
      return {
        primary: { label: "Marquer expédié", action: "mark_shipped" },
      };
    case "rejected":
      return {
        secondary: { label: "Revenir à pesée", action: "back_to_weighing" },
      };
    default:
      return {};
  }
}
