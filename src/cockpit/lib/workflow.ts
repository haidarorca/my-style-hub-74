// ═══════════════════════════════════════════════════════════════
// WORKFLOW — Règles métier complètes du Cockpit Kawzone
// ═══════════════════════════════════════════════════════════════

import type { LocalStatus, ImportStatus, OrderStatus, KpiFilter, RefundType } from "@/cockpit/types";
import type { OrderArticle } from "@/cockpit/lib/article-states";
import { getPendingFinancialActions } from "@/cockpit/lib/article-states";

/* ─── TARIF FRET ─── */
export const FREIGHT_RATE_PER_KG = 7500;

/* ─── WORKFLOW IMPORT (10 étapes exactes) ─── */
export const IMPORT_STEPS: { key: ImportStatus; label: string; description: string }[] = [
  { key: "new", label: "Nouvelle", description: "Commande reçue" },
  { key: "confirmed", label: "Confirmée", description: "Commande validée" },
  { key: "ordered_supplier", label: "Commandée fournisseur", description: "Commande passée chez le fournisseur" },
  { key: "received_warehouse", label: "Reçue entrepôt", description: "Produits reçus à l'entrepôt Chine/Turquie" },
  { key: "awaiting_weighing", label: "À peser", description: "En attente de pesée" },
  { key: "fees_calculated", label: "Calcul frais", description: "Fret calculé, attente paiement" },
  { key: "payment_fees", label: "Paiement client", description: "Paiement du fret en cours" },
  { key: "ready_delivery", label: "Prête", description: "Prête à être expédiée" },
  { key: "shipped", label: "Expédiée", description: "En cours de livraison" },
  { key: "delivered", label: "Livrée", description: "Commande livrée au client" },
];

/* ─── WORKFLOW LOCAL OFFICIEL (6 étapes) ───
   new → confirmed → preparing → ready → shipped → delivered */
export const LOCAL_STEPS: { key: LocalStatus; label: string; description: string }[] = [
  { key: "new", label: "À confirmer", description: "Commande reçue, à confirmer" },
  { key: "confirmed", label: "Confirmée", description: "Commande confirmée" },
  { key: "preparing", label: "Préparation", description: "En préparation" },
  { key: "ready", label: "Prête", description: "Prête à expédier" },
  { key: "shipped", label: "Expédiée", description: "En cours de livraison" },
  { key: "delivered", label: "Livrée", description: "Commande livrée" },
];

/* ─── COULEURS DES STATUTS ─── */
export const STATUS_COLORS: Record<string, string> = {
  new: "bg-purple-100 text-purple-800 border-purple-300",
  confirmed: "bg-cyan-100 text-cyan-800 border-cyan-300",
  preparing: "bg-orange-100 text-orange-800 border-orange-300",
  ready: "bg-emerald-100 text-emerald-800 border-emerald-300",
  ready_delivery: "bg-emerald-100 text-emerald-800 border-emerald-300",
  shipped: "bg-indigo-100 text-indigo-800 border-indigo-300",
  delivered: "bg-gray-100 text-gray-600 border-gray-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
  ordered_supplier: "bg-teal-100 text-teal-800 border-teal-300",
  received_warehouse: "bg-sky-100 text-sky-800 border-sky-300",
  awaiting_weighing: "bg-orange-100 text-orange-800 border-orange-300",
  fees_calculated: "bg-pink-100 text-pink-800 border-pink-300",
  payment_fees: "bg-amber-100 text-amber-800 border-amber-300",
};

/* ─── LIBELLÉS DES STATUTS ─── */
export const STATUS_LABELS: Record<string, string> = {
  new: "À confirmer",
  confirmed: "Confirmée",
  preparing: "Préparation",
  ready: "Prête",
  ready_delivery: "Prête",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
  ordered_supplier: "Commandée fournisseur",
  received_warehouse: "Reçue entrepôt",
  awaiting_weighing: "À peser",
  fees_calculated: "Calcul frais",
  payment_fees: "Paiement client",
};

/* ─── LIBELLÉS KPI ─── */
export const KPI_LABELS: Record<string, string> = {
  new: "À confirmer",
  payment_pending: "Paiements",
  to_weigh: "À peser",
  ready: "Prêt",
  shipped: "Expédié",
  debt: "Dettes",
};

/* ─── LIBELLÉS MÉTHODES DE PAIEMENT ─── */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  wave: "Wave",
  orange_money: "Orange Money",
  cash: "Cash",
  bank_transfer: "Virement",
  other: "Autre",
};

/* ─── LIBELLÉS REMBOURSEMENT ─── */
export const REFUND_LABELS: Record<RefundType, string> = {
  refund: "Remboursé",
  credit: "Crédit client",
  no_refund: "Non remboursé",
  partial_refund: "Remboursement partiel",
};

/* ─── COULEURS KPI ─── */
export const KPI_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  new: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  payment_pending: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  to_weigh: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  ready: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  shipped: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  debt: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
};

/* ─── FORMAT FCFA ─── */
export function fmtF(n: number | null | undefined): string {
  if (n === null || n === undefined) return "0 FCFA";
  const val = Number(n);
  if (isNaN(val) || val === 0) return "0 FCFA";
  return val.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " FCFA";
}

/* ─── LIEN WHATSAPP ─── */
export function waLink(phone: string, message: string): string {
  const clean = phone.replace(/[^0-9+]/g, "").replace(/^0/, "221");
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

/* ─── CALCUL POIDS VOLUMÉTRIQUE ─── */
export function calcVolumetricWeight(l: number, w: number, h: number): number {
  return (l * w * h) / 5000;
}

/* ─── CALCUL FRET ─── */
export function calcFreight(chargeableWeight: number, rate: number = FREIGHT_RATE_PER_KG): number {
  return Math.round(chargeableWeight * rate);
}

/* ─── DÉTECTION TYPE COMMANDE ─── */
export function isImport(order: { shipping_service_id?: string | null; order_type?: string | null }): boolean {
  return !!order.shipping_service_id || order.order_type === "import";
}

/* ─── MAPPING STATUS → KPI FILTER ───
   
   IMPORTANT: Chaque statut mappe vers UN seul KPI ou null (Archive).
   
   Regles exactes:
   - new / "" / null → "new" (A confirmer)
   - awaiting_payment / payment_fees → "payment_pending" (solde a payer)
   - awaiting_weighing → "to_weigh"
   - ready / ready_delivery → "ready" (COMMANDES REELLEMENT PRETE A EXPEDIER)
   - shipped → "shipped"
   - delivered / cancelled → null (Archive)
   
   Les statuts intermediaires du workflow Import n'apparaissent dans AUCUN KPI:
   - confirmed, ordered_supplier, received_warehouse, fees_calculated, preparing
   Ils sont visibles dans la vue Pipeline / Liste generale.
   
   - Tout autre statut inconnu → null (pas de KPI, visible dans la liste)
*/
export function statusToKpiFilter(status: string | null | undefined): KpiFilter {
  const s = (status ?? "").trim();

  if (s === "" || s === "new") return "new";

  // Paiement en attente : uniquement le paiement du fret import
  if (s === "payment_fees") return "payment_pending";

  if (s === "awaiting_weighing") return "to_weigh";

  if (s === "ready" || s === "ready_delivery") return "ready";

  if (s === "shipped") return "shipped";

  if (s === "delivered" || s === "cancelled") return null;

  return null;
}

/* ─── CIRCUIT MÉTIER : étape suivante ─── */

export interface NextStep {
  status: string;
  label: string;
  actionLabel: string;
  color: string;
}

/** Circuit LOCAL officiel : new → confirmed → preparing → ready → shipped → delivered */
const LOCAL_FLOW: Record<string, NextStep> = {
  "": { status: "new", label: "À confirmer", actionLabel: "Créer la commande", color: "bg-purple-600" },
  new: { status: "confirmed", label: "Confirmée", actionLabel: "Confirmer", color: "bg-emerald-600" },
  confirmed: { status: "preparing", label: "Préparation", actionLabel: "Lancer préparation", color: "bg-orange-600" },
  preparing: { status: "ready", label: "Prête", actionLabel: "Marquer prête", color: "bg-cyan-600" },
  ready: { status: "shipped", label: "Expédiée", actionLabel: "Expédier", color: "bg-indigo-600" },
  shipped: { status: "delivered", label: "Livrée", actionLabel: "Marquer livrée", color: "bg-emerald-600" },
};

/** Circuit IMPORT A (poids inconnu) : passe par pesée, calcul frais et paiement client. */
const IMPORT_FLOW: Record<string, NextStep> = {
  "": { status: "new", label: "À confirmer", actionLabel: "Créer la commande", color: "bg-purple-600" },
  new: { status: "confirmed", label: "Confirmée", actionLabel: "Confirmer", color: "bg-emerald-600" },
  confirmed: { status: "ordered_supplier", label: "Commandée fournisseur", actionLabel: "Commander fournisseur", color: "bg-cyan-600" },
  ordered_supplier: { status: "received_warehouse", label: "Reçue entrepôt", actionLabel: "Marquer reçue", color: "bg-teal-600" },
  received_warehouse: { status: "awaiting_weighing", label: "À peser", actionLabel: "Marquer à peser", color: "bg-orange-600" },
  awaiting_weighing: { status: "fees_calculated", label: "Calcul frais", actionLabel: "Calculer frais", color: "bg-pink-600" },
  fees_calculated: { status: "payment_fees", label: "Paiement client", actionLabel: "Attente paiement", color: "bg-amber-600" },
  payment_fees: { status: "ready_delivery", label: "Prête", actionLabel: "Marquer prête", color: "bg-cyan-600" },
  ready_delivery: { status: "shipped", label: "Expédiée", actionLabel: "Expédier", color: "bg-indigo-600" },
  shipped: { status: "delivered", label: "Livrée", actionLabel: "Marquer livrée", color: "bg-emerald-600" },
};

/** Circuit IMPORT B (poids déclaré) : vérification interne, pas de paiement complémentaire client.
 *  Réception entrepôt → Prête → Expédiée → Livrée. La vérification du poids est faite par
 *  l'agent logistique via le panneau d'évaluation, sans étape client. */
const IMPORT_FLOW_DECLARED: Record<string, NextStep> = {
  "": { status: "new", label: "À confirmer", actionLabel: "Créer la commande", color: "bg-purple-600" },
  new: { status: "confirmed", label: "Confirmée", actionLabel: "Confirmer", color: "bg-emerald-600" },
  confirmed: { status: "ordered_supplier", label: "Commandée fournisseur", actionLabel: "Commander fournisseur", color: "bg-cyan-600" },
  ordered_supplier: { status: "received_warehouse", label: "Reçue entrepôt", actionLabel: "Marquer reçue", color: "bg-teal-600" },
  // Vérification interne uniquement, puis directement prête à expédier.
  received_warehouse: { status: "fees_calculated", label: "Vérification poids", actionLabel: "Vérifier poids", color: "bg-cyan-600" },
  // Si pour une raison X l'ancien circuit a écrit ces statuts, on les court-circuite.
  awaiting_weighing: { status: "ready_delivery", label: "Prête", actionLabel: "Vérifier & marquer prête", color: "bg-cyan-600" },
  fees_calculated: { status: "ready_delivery", label: "Prête", actionLabel: "Marquer prête", color: "bg-cyan-600" },
  payment_fees: { status: "ready_delivery", label: "Prête", actionLabel: "Marquer prête", color: "bg-cyan-600" },
  ready_delivery: { status: "shipped", label: "Expédiée", actionLabel: "Expédier", color: "bg-indigo-600" },
  shipped: { status: "delivered", label: "Livrée", actionLabel: "Marquer livrée", color: "bg-emerald-600" },
};

/** Retourne l'étape suivante d'une commande.
 *  @param weightStatus si "declared" / "verified" / "anomaly", on utilise le Circuit B. */
export function getNextStep(
  currentStatus: string,
  importOrder: boolean,
  weightStatus?: string | null,
): NextStep | null {
  if (!importOrder) {
    const s = (currentStatus ?? "").trim();
    return LOCAL_FLOW[s] ?? null;
  }
  const isDeclared =
    weightStatus === "declared" || weightStatus === "verified" || weightStatus === "anomaly";
  const flow = isDeclared ? IMPORT_FLOW_DECLARED : IMPORT_FLOW;
  const s = (currentStatus ?? "").trim();
  return flow[s] ?? null;
}

/** Retourne le label d'un statut pour affichage */
export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/* ─── INDEX ÉTAPE IMPORT ─── */
export function getImportStepIndex(status: string): number {
  return IMPORT_STEPS.findIndex(s => s.key === status);
}

/* ─── VÉRIFICATION ANNULATION ─── */
export interface CancelCheck {
  canCancel: boolean;
  reason: string;
  paidAmount: number;
  refundOptions: RefundType[];
  warnings: string[];
}

export function checkCanCancel(status: string, paidAmount: number): CancelCheck {
  const warnings: string[] = [];
  const refundOptions: RefundType[] = [];

  if (status === "delivered") {
    return { canCancel: false, reason: "Commande déjà livrée — annulation impossible", paidAmount, refundOptions: [], warnings: ["La commande a été livrée"] };
  }

  if (status === "shipped") {
    warnings.push("La commande est en cours de livraison");
  }

  if (["ordered_supplier", "received_warehouse"].includes(status)) {
    warnings.push("Le fournisseur a déjà été commandé");
  }

  if (paidAmount > 0) {
    refundOptions.push("refund", "credit", "partial_refund", "no_refund");
  } else {
    refundOptions.push("no_refund");
  }

  return {
    canCancel: true,
    reason: paidAmount > 0 ? `${fmtF(paidAmount)} payés — choisir le remboursement` : "Aucun paiement — annulation directe",
    paidAmount,
    refundOptions,
    warnings,
  };
}

/* ─── FORMATAGE DATE / HEURE ─── */
const MONTH_NAMES = ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "août", "sep", "oct", "nov", "déc"];

/** Formate une date ISO en format court lisible: "14 juin, 14:32" */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const isYesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
    const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    if (isToday) return `Aujourd'hui, ${timeStr}`;
    if (isYesterday) return `Hier, ${timeStr}`;
    const day = d.getDate();
    const month = MONTH_NAMES[d.getMonth()];
    const year = d.getFullYear();
    const currentYear = now.getFullYear();
    if (year === currentYear) return `${day} ${month}, ${timeStr}`;
    return `${day} ${month} ${year}, ${timeStr}`;
  } catch {
    return "—";
  }
}

/* ═══════════════════════════════════════════════════════════════
   RÈGLES DE PROGRESSION v3 — bloquent les transitions dangereuses
   ═══════════════════════════════════════════════════════════════ */

export interface ProgressionCheck {
  ok: boolean;
  reasons: string[];
}

/** Bloque le passage à `preparing` s'il reste une rupture non résolue. */
export function canMarkPreparing(articles: OrderArticle[] | undefined): ProgressionCheck {
  const reasons: string[] = [];
  const unresolved = (articles ?? []).filter(a => a.stock_break && !a.stock_break.resolved);
  if (unresolved.length > 0) reasons.push(`${unresolved.length} rupture(s) non résolue(s)`);
  return { ok: reasons.length === 0, reasons };
}

/** Bloque l'expédition s'il n'y a rien à expédier. wait_restock n'empêche PAS shipped. */
export function canMarkShipped(articles: OrderArticle[] | undefined): ProgressionCheck {
  const reasons: string[] = [];
  const list = articles ?? [];
  const unresolved = list.filter(a => a.stock_break && !a.stock_break.resolved);
  if (unresolved.length > 0) reasons.push(`${unresolved.length} rupture(s) non résolue(s)`);
  const shippable = list.filter(a => ["ready", "available", "received"].includes(a.status)
    && !(a.stock_break?.resolved && (
      ["partial_ship", "refund", "credit"].includes(a.stock_break.action)
      || (a.stock_break.action === "wait_restock" && !a.stock_break.resumed_at)
    )));
  if (list.length > 0 && shippable.length === 0) reasons.push("Aucun article prêt à expédier");
  return { ok: reasons.length === 0, reasons };
}

/** Bloque la livraison finale tant que des articles ne sont pas livrés,
    qu'une rupture est en cours, qu'un article attend réappro (non repris),
    ou qu'un `*_pending` financier n'est pas traité. */
export function canMarkDelivered(articles: OrderArticle[] | undefined): ProgressionCheck {
  const reasons: string[] = [];
  const list = articles ?? [];

  const unresolved = list.filter(a => a.stock_break && !a.stock_break.resolved);
  if (unresolved.length > 0) reasons.push(`${unresolved.length} rupture(s) non résolue(s)`);

  const waiting = list.filter(a => a.stock_break?.resolved && a.stock_break.action === "wait_restock" && !a.stock_break.resumed_at);
  if (waiting.length > 0) reasons.push(`${waiting.length} article(s) en attente de réappro`);

  const undelivered = list.filter(a => {
    const sb = a.stock_break;
    const excluded = sb?.resolved && (
      ["partial_ship", "refund", "credit"].includes(sb.action)
      || (sb.action === "wait_restock" && !sb.resumed_at)
    );
    if (excluded) return false;
    return (a.delivered_qty ?? 0) < a.quantity;
  });
  if (undelivered.length > 0) reasons.push(`${undelivered.length} article(s) à livrer`);

  const pending = getPendingFinancialActions(list);
  if (pending.refundPending > 0) reasons.push(`Remboursement à traiter : ${pending.refundPending.toLocaleString("fr-FR")} FCFA`);
  if (pending.creditPending > 0) reasons.push(`Crédit à traiter : ${pending.creditPending.toLocaleString("fr-FR")} FCFA`);
  if (pending.extraPaymentPending > 0) reasons.push(`Complément à encaisser : ${pending.extraPaymentPending.toLocaleString("fr-FR")} FCFA`);

  return { ok: reasons.length === 0, reasons };
}
