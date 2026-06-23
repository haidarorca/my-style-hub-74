// ═══════════════════════════════════════════════════════════════
// SUB-ORDER ACTIONS — Table contextuelle statut → actions UI.
//
// Cette table ne contient AUCUNE logique métier. Elle décrit
// uniquement la liste d'actions à afficher dans la barre d'actions
// du drawer en fonction du statut effectif de la sous-commande.
//
// Chaque action déclenche :
//   - soit l'avancement de circuit (réutilise getNextStep + onStatusChange)
//   - soit l'ouverture d'un onglet du drawer (Articles / Logistique / Paiements / Historique)
//   - soit un callback déjà câblé (annulation, voir articles)
//
// Conserve donc strictement les server fns et workflows des Vagues 1–2.
// ═══════════════════════════════════════════════════════════════

import {
  ShoppingCart, Eye, Edit3, XCircle, MoreHorizontal,
  Scale, Ruler, CheckSquare, Calculator, Bell, CheckCircle2,
  Truck, Printer, Hash, CreditCard, FileText, History,
  PackageX, RefreshCcw, AlertTriangle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type SubOrderActionTab = "resume" | "articles" | "logistique" | "paiements" | "historique";
export type SubOrderActionTone = "primary" | "default" | "danger" | "warning" | "success";

export interface SubOrderAction {
  id: string;
  label: string;
  icon: LucideIcon;
  tone?: SubOrderActionTone;
  /** Onglet à ouvrir quand l'action est cliquée. */
  tab?: SubOrderActionTab;
  /** Callback bien défini, déjà câblé dans OrderDrawer. */
  fire?: "advance" | "cancel" | "viewItems";
}

const ACTION_ADVANCE: SubOrderAction = {
  id: "advance", label: "Confirmer l'étape", icon: CheckCircle2, tone: "primary", fire: "advance",
};
const ACTION_CANCEL: SubOrderAction = {
  id: "cancel", label: "Annuler", icon: XCircle, tone: "danger", fire: "cancel",
};
const ACTION_VIEW_ARTICLES: SubOrderAction = {
  id: "articles", label: "Modifier articles", icon: Edit3, tab: "articles",
};
const ACTION_VIEW_ITEMS: SubOrderAction = {
  id: "view-items", label: "Voir articles", icon: Eye, fire: "viewItems",
};
const ACTION_MORE: SubOrderAction = {
  id: "more", label: "Autres", icon: MoreHorizontal, tab: "resume",
};

/**
 * Retourne la liste d'actions contextuelles à afficher selon le statut métier.
 * @param status statut effectif de la sous-commande
 * @param lineKind LOCAL | IMPORT_KNOWN_WEIGHT | IMPORT_UNKNOWN_WEIGHT (optionnel)
 */
export function getSubOrderActions(
  status: string,
  lineKind?: string | null,
): SubOrderAction[] {
  const s = (status ?? "").trim() || "new";
  const isImportUnknown = lineKind === "IMPORT_UNKNOWN_WEIGHT";

  switch (s) {
    case "new":
      return [
        ACTION_ADVANCE,
        ACTION_VIEW_ARTICLES,
        { id: "rupture", label: "Rupture stock", icon: PackageX, tone: "warning", tab: "articles" },
        ACTION_CANCEL,
      ];
    case "confirmed":
      return [
        { ...ACTION_ADVANCE, label: "Commander fournisseur", icon: ShoppingCart },
        ACTION_VIEW_ITEMS,
        { id: "relancer", label: "Relancer fournisseur", icon: Bell, tab: "historique" },
        ACTION_CANCEL,
      ];
    case "ordered_supplier":
      return [
        { ...ACTION_ADVANCE, label: "Marquer reçue", icon: CheckCircle2 },
        { id: "voir-cmd", label: "Voir commande", icon: Eye, tab: "articles" },
        { id: "relancer", label: "Relancer fournisseur", icon: Bell, tab: "historique" },
        ACTION_CANCEL,
      ];
    case "received_warehouse":
      return isImportUnknown
        ? [
            { ...ACTION_ADVANCE, label: "Effectuer pesée", icon: Scale },
            { id: "dims", label: "Ajouter dimensions", icon: Ruler, tab: "logistique" },
            { id: "verifier", label: "Vérifier articles", icon: CheckSquare, tab: "articles" },
            ACTION_MORE,
          ]
        : [
            { ...ACTION_ADVANCE, label: "Marquer prête", icon: Truck },
            { id: "verifier", label: "Vérifier articles", icon: CheckSquare, tab: "articles" },
            ACTION_MORE,
          ];
    case "awaiting_weighing":
      return [
        { ...ACTION_ADVANCE, label: "Calculer frais", icon: Calculator },
        { id: "pesee", label: "Voir pesée", icon: Scale, tab: "logistique" },
        ACTION_MORE,
      ];
    case "fees_calculated":
      return [
        { ...ACTION_ADVANCE, label: "Notifier client", icon: Bell },
        { id: "voir-frais", label: "Voir frais", icon: Calculator, tab: "logistique" },
        ACTION_MORE,
      ];
    case "payment_fees":
      return [
        { ...ACTION_ADVANCE, label: "Valider paiement", icon: CreditCard, tone: "primary" },
        { id: "paiements", label: "Voir paiements", icon: CreditCard, tab: "paiements" },
        { id: "relance-client", label: "Relancer client", icon: Bell, tab: "resume" },
      ];
    case "ready":
    case "ready_delivery":
      return [
        { ...ACTION_ADVANCE, label: "Expédier", icon: Truck },
        { id: "etiquette", label: "Imprimer étiquette", icon: Printer, tab: "logistique" },
        { id: "suivi", label: "Numéro de suivi", icon: Hash, tab: "logistique" },
        ACTION_CANCEL,
      ];
    case "shipped":
      return [
        { ...ACTION_ADVANCE, label: "Marquer livrée", icon: CheckCircle2 },
        { id: "suivi", label: "Suivi", icon: Hash, tab: "logistique" },
        { id: "paiements", label: "Encaisser", icon: CreditCard, tab: "paiements" },
      ];
    case "delivered":
      return [
        { id: "paiements", label: "Voir paiement", icon: CreditCard, tab: "paiements" },
        { id: "facture", label: "Voir facture", icon: FileText, tab: "paiements" },
        { id: "historique", label: "Historique", icon: History, tab: "historique" },
      ];
    case "cancelled":
      return [
        { id: "historique", label: "Voir historique", icon: History, tab: "historique" },
        { id: "paiements", label: "Remboursement", icon: RefreshCcw, tab: "paiements" },
      ];
    default:
      return [ACTION_ADVANCE, ACTION_VIEW_ITEMS, ACTION_CANCEL];
  }
}

/** Couleur + libellé du badge de statut principal. */
export function getStatusBadge(status: string): { label: string; emoji: string; className: string } {
  const s = (status ?? "").trim() || "new";
  const map: Record<string, { label: string; emoji: string; className: string }> = {
    new: { label: "Nouvelle", emoji: "🟣", className: "bg-purple-100 text-purple-800 border-purple-300" },
    confirmed: { label: "À commander", emoji: "🟠", className: "bg-orange-100 text-orange-800 border-orange-300" },
    ordered_supplier: { label: "Commandée fournisseur", emoji: "🔵", className: "bg-cyan-100 text-cyan-800 border-cyan-300" },
    received_warehouse: { label: "Reçue entrepôt", emoji: "🟣", className: "bg-violet-100 text-violet-800 border-violet-300" },
    awaiting_weighing: { label: "À peser", emoji: "⚖️", className: "bg-orange-100 text-orange-800 border-orange-300" },
    fees_calculated: { label: "Frais à calculer", emoji: "💰", className: "bg-pink-100 text-pink-800 border-pink-300" },
    payment_fees: { label: "En attente paiement", emoji: "📲", className: "bg-amber-100 text-amber-800 border-amber-300" },
    ready: { label: "Prête à expédier", emoji: "🚚", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
    ready_delivery: { label: "Prête à expédier", emoji: "🚚", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
    shipped: { label: "Expédiée", emoji: "🚛", className: "bg-indigo-100 text-indigo-800 border-indigo-300" },
    delivered: { label: "Livrée", emoji: "✅", className: "bg-gray-100 text-gray-700 border-gray-300" },
    cancelled: { label: "Annulée", emoji: "❌", className: "bg-red-100 text-red-800 border-red-300" },
  };
  return map[s] ?? { label: s, emoji: "•", className: "bg-gray-100 text-gray-700 border-gray-300" };
}

// ─── Priorité métier (couleur + libellé pour la carte action) ───────
export type SubOrderPriority = "urgent" | "action" | "progress" | "waiting_client" | "shipped" | "done";

export interface PriorityVisual {
  priority: SubOrderPriority;
  label: string;
  /** Bordure gauche épaisse (carte). */
  borderClass: string;
  /** Fond léger de la carte. */
  bgClass: string;
  /** Pastille pleine (badge priorité). */
  pillClass: string;
  /** Pulse pour les priorités urgentes. */
  pulse?: boolean;
}

const PRIORITY_VISUALS: Record<SubOrderPriority, Omit<PriorityVisual, "priority">> = {
  urgent:         { label: "Urgent",         borderClass: "border-l-red-500     bg-red-50/40",     bgClass: "bg-red-50/40",     pillClass: "bg-red-600 text-white", pulse: true },
  action:         { label: "Action requise", borderClass: "border-l-orange-500  bg-orange-50/40",  bgClass: "bg-orange-50/40",  pillClass: "bg-orange-500 text-white" },
  progress:       { label: "En cours",       borderClass: "border-l-cyan-500    bg-cyan-50/40",    bgClass: "bg-cyan-50/40",    pillClass: "bg-cyan-600 text-white" },
  waiting_client: { label: "Attente client", borderClass: "border-l-amber-500   bg-amber-50/40",   bgClass: "bg-amber-50/40",   pillClass: "bg-amber-500 text-white" },
  shipped:        { label: "Expédiée",       borderClass: "border-l-indigo-500  bg-indigo-50/40",  bgClass: "bg-indigo-50/40",  pillClass: "bg-indigo-600 text-white" },
  done:           { label: "Terminée",       borderClass: "border-l-gray-300    bg-gray-50/40",    bgClass: "bg-gray-50/40",    pillClass: "bg-gray-500 text-white" },
};

/**
 * Détermine la priorité métier de la sous-commande.
 * - urgent  : ruptures non résolues
 * - waiting_client : en attente d'une action côté client (paiement)
 * - progress : automatisé / attente fournisseur
 * - action  : action admin attendue
 * - shipped : expédiée, en attente livraison
 * - done    : terminée ou annulée
 */
export function getSubOrderPriority(status: string, blockedCount = 0): PriorityVisual {
  const s = (status ?? "").trim() || "new";
  let p: SubOrderPriority;
  if (blockedCount > 0) p = "urgent";
  else if (s === "payment_fees") p = "waiting_client";
  else if (s === "ordered_supplier") p = "progress";
  else if (s === "shipped") p = "shipped";
  else if (s === "delivered" || s === "cancelled") p = "done";
  else p = "action";
  return { priority: p, ...PRIORITY_VISUALS[p] };
}

/** Action principale (la 1re renvoyée par getSubOrderActions). */
export function getPrimaryAction(status: string, lineKind?: string | null): SubOrderAction | null {
  const list = getSubOrderActions(status, lineKind);
  return list[0] ?? null;
}
