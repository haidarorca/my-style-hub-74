// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   CONFIGURATION ADMIN1 — Statuts, transitions, tarifs
   ═══════════════════════════════════════════════════════════════ */

import type { OrderStatus, TabConfig } from "@/admin1/types/admin1";

export const FREIGHT_RATE_PER_KG = 7500; // FCFA/kg — configurable

/* ── Workflow : statuts dans l'ordre ── */
export const WORKFLOW_STEPS: { status: OrderStatus; label: string }[] = [
  { status: "new", label: "A Confirmer" },
  { status: "confirmed", label: "En Attente d'Acompte" },
  { status: "deposit_paid", label: "A Traiter" },
  { status: "processing", label: "En Transit" },
  { status: "warehouse_arrived", label: "A Peser" },
  { status: "fees_calculated", label: "En Attente de Solde" },
  { status: "ready_to_ship", label: "A Expedier" },
  { status: "shipped", label: "En Cours de Livraison" },
  { status: "delivered", label: "Cloture" },
];

/* ── Transitions autorisées ── */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["deposit_paid", "cancelled"],
  deposit_paid: ["processing"],
  processing: ["warehouse_arrived"],
  warehouse_arrived: ["fees_calculated"],
  fees_calculated: ["ready_to_ship"],
  ready_to_ship: ["shipped"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: ["new"], // Peut être réactivée
};

/* ── Configuration des 8 onglets ── */
export function buildTabs(counts: Record<string, number>): TabConfig[] {
  return [
    {
      key: "new", label: "A Confirmer", count: counts.new ?? 0,
      statuses: ["new"], action_label: "Confirmer",
      color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-300",
    },
    {
      key: "deposit", label: "Attente Acompte", count: counts.deposit ?? 0,
      statuses: ["confirmed"], action_label: "Noter acompte",
      color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-300",
    },
    {
      key: "processing", label: "A Traiter / Transit", count: counts.processing ?? 0,
      statuses: ["deposit_paid", "processing"], action_label: "Suivre",
      color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-300",
    },
    {
      key: "weigh", label: "A Peser / Tarifer", count: counts.weigh ?? 0,
      statuses: ["warehouse_arrived"], action_label: "Peser",
      color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-300",
    },
    {
      key: "balance", label: "Attente Solde", count: counts.balance ?? 0,
      statuses: ["fees_calculated"], action_label: "Encaisser",
      color: "text-cyan-700", bg: "bg-cyan-50", border: "border-cyan-300",
    },
    {
      key: "ship", label: "A Expedier", count: counts.ship ?? 0,
      statuses: ["ready_to_ship"], action_label: "Expedier",
      color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-300",
    },
    {
      key: "delivery", label: "En Livraison", count: counts.delivery ?? 0,
      statuses: ["shipped"], action_label: "Suivre",
      color: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-300",
    },
    {
      key: "closed", label: "Cloture / Solde", count: counts.closed ?? 0,
      statuses: ["delivered"], action_label: "Voir",
      color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-300",
    },
  ];
}

/* ── Couleurs de statut ── */
export const STATUS_COLORS: Record<OrderStatus, string> = {
  new: "bg-purple-100 text-purple-800 border-purple-200",
  confirmed: "bg-amber-100 text-amber-800 border-amber-200",
  deposit_paid: "bg-blue-100 text-blue-800 border-blue-200",
  processing: "bg-blue-100 text-blue-800 border-blue-200",
  warehouse_arrived: "bg-orange-100 text-orange-800 border-orange-200",
  fees_calculated: "bg-cyan-100 text-cyan-800 border-cyan-200",
  ready_to_ship: "bg-emerald-100 text-emerald-800 border-emerald-200",
  shipped: "bg-indigo-100 text-indigo-800 border-indigo-200",
  delivered: "bg-slate-100 text-slate-800 border-slate-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "A Confirmer",
  confirmed: "Attente Acompte",
  deposit_paid: "A Traiter",
  processing: "En Transit",
  warehouse_arrived: "A Peser",
  fees_calculated: "Attente Solde",
  ready_to_ship: "A Expedier",
  shipped: "En Livraison",
  delivered: "Cloture",
  cancelled: "Annulee",
};

/* ── Labels de méthode de paiement ── */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  wave: "Wave",
  orange_money: "Orange Money",
  cash: "Espece",
  bank_transfer: "Virement",
  other: "Autre",
};

/* ── Format FCFA ── */
export function fmtF(n: number): string {
  if (!n || n === 0) return "0 FCFA";
  return n.toLocaleString("fr-FR") + " FCFA";
}

/* ── WhatsApp link generator ── */
export function whatsappLink(phone: string, message: string): string {
  const clean = phone.replace(/[^0-9+]/g, "").replace(/^0/, "221");
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${clean}?text=${encoded}`;
}
