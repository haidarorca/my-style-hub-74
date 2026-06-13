// ═══════════════════════════════════════════════════════════════
// WORKFLOW — Règles métier complètes du Cockpit Kawzone
// ═══════════════════════════════════════════════════════════════

import type { LocalStatus, ImportStatus, OrderStatus, KpiFilter, RefundType } from "@/cockpit/types";

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

/* ─── WORKFLOW LOCAL (8 étapes) ─── */
export const LOCAL_STEPS: { key: LocalStatus; label: string; description: string }[] = [
  { key: "new", label: "Nouvelle", description: "Commande reçue" },
  { key: "contacted", label: "Contactée", description: "Client contacté" },
  { key: "awaiting_payment", label: "Paiement attendu", description: "En attente de paiement" },
  { key: "confirmed", label: "Confirmée", description: "Commande confirmée" },
  { key: "preparing", label: "Préparation", description: "En préparation" },
  { key: "ready", label: "Prête", description: "Prête à expédier" },
  { key: "shipped", label: "Expédiée", description: "En cours de livraison" },
  { key: "delivered", label: "Livrée", description: "Commande livrée" },
];

/* ─── COULEURS DES STATUTS ─── */
export const STATUS_COLORS: Record<string, string> = {
  new: "bg-purple-100 text-purple-800 border-purple-300",
  contacted: "bg-blue-100 text-blue-800 border-blue-300",
  awaiting_payment: "bg-amber-100 text-amber-800 border-amber-300",
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
  contacted: "Contactée",
  awaiting_payment: "Paiement attendu",
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
   
   IMPORTANT: Les statuts Supabase peuvent etre "", null, ou "new".
   Tous ces cas doivent etre traites comme "new" (A confirmer).
   
   Regles exactes:
   - new / "" / null → "new" (A confirmer)
   - awaiting_payment / payment_fees → "payment_pending"
   - awaiting_weighing → "to_weigh"
   - confirmed / ordered_supplier / received_warehouse / in_transit /
     arrived_senegal / preparing / ready / ready_delivery / fees_calculated → "ready"
   - shipped → "shipped"
   - delivered / cancelled → null (hors KPI, vont dans Archive)
   - Tout autre statut inconnu → "ready" (ne pas perdre de commande)
*/
export function statusToKpiFilter(status: string | null | undefined): KpiFilter {
  const s = (status ?? "").trim();
  
  // Cas nouveau (inclut "" et null)
  if (s === "" || s === "new") return "new";
  
  // Paiement en attente
  if (s === "awaiting_payment" || s === "payment_fees") return "payment_pending";
  
  // A peser
  if (s === "awaiting_weighing") return "to_weigh";
  
  // Pret (tous les statuts intermediaires)
  if (["confirmed", "ordered_supplier", "received_warehouse",
       "preparing", "ready", "ready_delivery",
       "fees_calculated"].includes(s)) return "ready";
  
  // Expedie
  if (s === "shipped") return "shipped";
  
  // Archive (pas de KPI)
  if (s === "delivered" || s === "cancelled") return null;
  
  // Par defaut: ne pas perdre de commande, la mettre dans "ready"
  console.warn(`[statusToKpiFilter] Statut inconnu: "${s}" — traite comme "ready"`);
  return "ready";
}

/* ─── CIRCUIT MÉTIER : étape suivante ─── */

export interface NextStep {
  status: string;
  label: string;
  actionLabel: string;
  color: string;
}

/** Circuit LOCAL : nouvelle → contactée → paiement → confirmée → préparation → prête → expédiée → livrée */
const LOCAL_FLOW: Record<string, NextStep> = {
  "": { status: "new", label: "À confirmer", actionLabel: "Créer la commande", color: "bg-purple-600" },
  new: { status: "contacted", label: "Contactée", actionLabel: "Marquer contactée", color: "bg-blue-600" },
  contacted: { status: "awaiting_payment", label: "Paiement attendu", actionLabel: "Attente paiement", color: "bg-amber-600" },
  awaiting_payment: { status: "confirmed", label: "Confirmée", actionLabel: "Confirmer", color: "bg-emerald-600" },
  confirmed: { status: "preparing", label: "Préparation", actionLabel: "Lancer préparation", color: "bg-orange-600" },
  preparing: { status: "ready", label: "Prête", actionLabel: "Marquer prête", color: "bg-cyan-600" },
  ready: { status: "shipped", label: "Expédiée", actionLabel: "Expédier", color: "bg-indigo-600" },
  shipped: { status: "delivered", label: "Livrée", actionLabel: "Marquer livrée", color: "bg-emerald-600" },
};

/** Circuit IMPORT : nouvelle → confirmée → fournisseur → entrepôt → pesée → calcul frais → paiement client → prête → expédiée → livrée */
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

/** Retourne l'étape suivante d'une commande */
export function getNextStep(currentStatus: string, importOrder: boolean): NextStep | null {
  const flow = importOrder ? IMPORT_FLOW : LOCAL_FLOW;
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
