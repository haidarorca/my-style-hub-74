// ═══════════════════════════════════════════════════════════════
// EVENTS — Noyau ERP événementiel du Cockpit (Phase B)
//
// Vocabulaire métier : tout ce qui arrive à une sous-commande est
// enregistré comme un Événement (cause) → Décision (réponse) →
// Mouvement financier (conséquence). Le triplet est append-only :
// jamais modifié, jamais supprimé.
//
// Ces types sont le miroir TS strict des tables Postgres
// `order_events`, `order_decisions`, `financial_movements` et de la
// vue `v_sub_order_accounting`.
// ═══════════════════════════════════════════════════════════════

// ─── Catalogues fermés (mirroir des enums Postgres) ─────────────

export type OrderEventType =
  | "client_cancellation"
  | "stock_break"
  | "product_deleted"
  | "shop_deleted"
  | "customer_dispute"
  | "dispute_resolved"
  | "delivery_refusal"
  | "post_delivery_return"
  | "vendor_error"
  | "kawzone_error"
  | "supplier_unavailable"
  | "commercial_gesture"
  | "payment_blocked"
  | "delivery_blocked"
  | "order_abandoned";

export type OrderDecisionType =
  | "cancel_article"
  | "cancel_suborder"
  | "wait_restock"
  | "wait_supplier"
  | "wait_client"
  | "replace_same"
  | "replace_higher"
  | "replace_lower"
  | "partial_delivery"
  | "accept_return"
  | "refuse_return"
  | "accept_exchange"
  | "issue_refund"
  | "issue_credit_note"
  | "apply_penalty"
  | "commercial_gesture"
  | "escalate_sav"
  | "mark_dispute_resolved"
  | "override_no_action";

export type FinancialMovementType =
  | "cash_in"
  | "cash_out"
  | "credit_note_issued"
  | "credit_note_used"
  | "penalty_kept"
  | "penalty_to_vendor"
  | "commission_due_to_vendor"
  | "commission_paid"
  | "loss_kawzone"
  | "loss_vendor"
  | "loss_shared"
  | "gain_kawzone"
  | "gain_vendor";

export type MovementDirection = "debit" | "credit";
export type CostAttribution = "kawzone" | "vendor" | "client" | "shared";

// ─── Lignes telles que stockées en DB ───────────────────────────

import type { Json } from "@/integrations/supabase/types";

export interface OrderEvent {
  id: string;
  order_id: string;
  vendor_id: string | null;
  order_item_id: string | null;
  event_type: OrderEventType;
  reason: string | null;
  payload: Json;
  created_at: string;
  created_by: string | null;
}

export interface OrderDecision {
  id: string;
  event_id: string;
  decision_type: OrderDecisionType;
  rationale: string | null;
  payload: Json;
  supersedes_decision_id: string | null;
  created_at: string;
  created_by: string | null;
}

export interface FinancialMovement {
  id: string;
  decision_id: string;
  movement_type: FinancialMovementType;
  direction: MovementDirection;
  amount: number;
  currency: string;
  cost_attribution: CostAttribution;
  cost_split: Json;
  method: string | null;
  reference: string | null;
  note: string | null;
  occurred_at: string;
  recorded_by: string | null;
}


// ─── Vue comptable agrégée (miroir de v_sub_order_accounting) ──

export interface SubOrderAccounting {
  order_id: string;
  vendor_id: string | null;
  gross_value: number;
  cancelled_value: number;
  refunded_value: number;
  credited_value: number;
  extra_collected_value: number;
  penalty_value: number;
  loss_value: number;
  commission_to_remit_vendor: number;
  net_value: number;
  outstanding_to_refund_client: number;
  outstanding_credit_to_issue: number;
}

// ─── Dimension "Qui attend quoi ?" — Action attendue ────────────

export type AwaitsParty =
  | "awaits_admin"
  | "awaits_vendor"
  | "awaits_supplier"
  | "awaits_client"
  | "awaits_carrier"
  | "awaits_nothing";

const EVENT_DEFAULT_AWAITS: Record<OrderEventType, AwaitsParty> = {
  client_cancellation: "awaits_admin",
  stock_break: "awaits_admin",
  product_deleted: "awaits_admin",
  shop_deleted: "awaits_admin",
  customer_dispute: "awaits_admin",
  dispute_resolved: "awaits_nothing",
  delivery_refusal: "awaits_admin",
  post_delivery_return: "awaits_admin",
  vendor_error: "awaits_admin",
  kawzone_error: "awaits_admin",
  supplier_unavailable: "awaits_supplier",
  commercial_gesture: "awaits_admin",
  payment_blocked: "awaits_client",
  delivery_blocked: "awaits_carrier",
  order_abandoned: "awaits_admin",
};

const DECISION_DEFAULT_AWAITS: Partial<Record<OrderDecisionType, AwaitsParty>> = {
  wait_restock: "awaits_vendor",
  wait_supplier: "awaits_supplier",
  wait_client: "awaits_client",
  replace_same: "awaits_vendor",      // vendeur doit envoyer le remplacement
  replace_higher: "awaits_client",    // client doit régler le complément
  replace_lower: "awaits_admin",      // Kawzone doit rembourser la différence
  partial_delivery: "awaits_admin",
  issue_refund: "awaits_admin",       // tant que cash_out n'est pas posé
  issue_credit_note: "awaits_admin",  // tant que credit_note_issued n'est pas posé
  apply_penalty: "awaits_admin",
  escalate_sav: "awaits_admin",
  mark_dispute_resolved: "awaits_nothing",
};

/** Liste des parties qui attendent une action sur cette sous-commande.
 *  Un événement sans décision rattachée → awaits_admin.
 *  Une décision wait_* → awaits_<partie correspondante>.
 *  Une décision issue_refund/issue_credit_note sans mouvement → awaits_admin. */
export function computeAwaits(
  events: OrderEvent[],
  decisions: OrderDecision[],
  movements: FinancialMovement[],
): Set<AwaitsParty> {
  const result = new Set<AwaitsParty>();
  const decByEvent = new Map<string, OrderDecision[]>();
  for (const d of decisions) {
    const arr = decByEvent.get(d.event_id);
    if (arr) arr.push(d); else decByEvent.set(d.event_id, [d]);
  }
  const mvtsByDecision = new Map<string, FinancialMovement[]>();
  for (const m of movements) {
    const arr = mvtsByDecision.get(m.decision_id);
    if (arr) arr.push(m); else mvtsByDecision.set(m.decision_id, [m]);
  }
  // Override chain : décision la plus récente seulement
  const supersededIds = new Set(decisions.map(d => d.supersedes_decision_id).filter(Boolean) as string[]);

  for (const e of events) {
    const decs = (decByEvent.get(e.id) ?? []).filter(d => !supersededIds.has(d.id));
    if (decs.length === 0) {
      result.add(EVENT_DEFAULT_AWAITS[e.event_type]);
      continue;
    }
    for (const d of decs) {
      // Refund/credit décidé mais non exécuté → still awaits admin
      if (d.decision_type === "issue_refund") {
        const settled = (mvtsByDecision.get(d.id) ?? []).some(m => m.movement_type === "cash_out");
        if (!settled) result.add("awaits_admin");
        continue;
      }
      if (d.decision_type === "issue_credit_note") {
        const settled = (mvtsByDecision.get(d.id) ?? []).some(m => m.movement_type === "credit_note_issued");
        if (!settled) result.add("awaits_admin");
        continue;
      }
      const w = DECISION_DEFAULT_AWAITS[d.decision_type];
      if (w) result.add(w);
    }
  }
  if (result.size === 0) result.add("awaits_nothing");
  return result;
}

// ─── Dimension Risque ───────────────────────────────────────────

export type RiskLevel = "none" | "low" | "medium" | "high" | "critical";

export type RiskReason =
  | "shop_deleted_with_open_order"
  | "product_deleted_with_open_order"
  | "pending_refund_over_7d"
  | "pending_refund_over_30d"
  | "open_dispute"
  | "payment_blocked"
  | "supplier_silent_over_14d"
  | "order_idle_over_30d";

const REASON_WEIGHT: Record<RiskReason, number> = {
  shop_deleted_with_open_order: 100,
  product_deleted_with_open_order: 70,
  pending_refund_over_30d: 100,
  pending_refund_over_7d: 60,
  open_dispute: 60,
  payment_blocked: 40,
  supplier_silent_over_14d: 40,
  order_idle_over_30d: 20,
};

export interface RiskAssessment {
  level: RiskLevel;
  score: number;
  reasons: RiskReason[];
}

const daysSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 86400000;

export function computeRisk(args: {
  events: OrderEvent[];
  decisions: OrderDecision[];
  movements: FinancialMovement[];
  accounting?: SubOrderAccounting | null;
  isOpen: boolean;
  lastActivityAt?: string | null;
}): RiskAssessment {
  const reasons: RiskReason[] = [];
  const { events, decisions, movements, accounting, isOpen, lastActivityAt } = args;

  if (isOpen) {
    if (events.some(e => e.event_type === "shop_deleted")) reasons.push("shop_deleted_with_open_order");
    if (events.some(e => e.event_type === "product_deleted")) reasons.push("product_deleted_with_open_order");
    if (events.some(e => e.event_type === "customer_dispute")) reasons.push("open_dispute");
    if (events.some(e => e.event_type === "payment_blocked")) reasons.push("payment_blocked");

    const supplier = events.filter(e => e.event_type === "supplier_unavailable").sort((a,b) => b.created_at.localeCompare(a.created_at))[0];
    if (supplier && daysSince(supplier.created_at) > 14) reasons.push("supplier_silent_over_14d");

    if (lastActivityAt && daysSince(lastActivityAt) > 30) reasons.push("order_idle_over_30d");
  }

  // Refund décidé mais non exécuté : âge de la décision la plus ancienne non réglée
  const cashOutByDecision = new Set(movements.filter(m => m.movement_type === "cash_out").map(m => m.decision_id));
  const pendingRefunds = decisions.filter(d => d.decision_type === "issue_refund" && !cashOutByDecision.has(d.id));
  if (pendingRefunds.length > 0) {
    const oldestAge = Math.max(...pendingRefunds.map(d => daysSince(d.created_at)));
    if (oldestAge > 30) reasons.push("pending_refund_over_30d");
    else if (oldestAge > 7) reasons.push("pending_refund_over_7d");
  }
  // Idem pour outstanding via vue comptable (filet)
  if (accounting && accounting.outstanding_to_refund_client > 0 && pendingRefunds.length === 0) {
    reasons.push("pending_refund_over_7d");
  }

  const score = reasons.reduce((s, r) => s + REASON_WEIGHT[r], 0);
  const level: RiskLevel =
    score >= 100 ? "critical" :
    score >= 60 ? "high" :
    score >= 30 ? "medium" :
    score > 0 ? "low" : "none";

  return { level, score, reasons };
}

// ─── Labels (FR) ────────────────────────────────────────────────

export const EVENT_LABELS: Record<OrderEventType, string> = {
  client_cancellation: "Annulation client",
  stock_break: "Rupture de stock",
  product_deleted: "Produit supprimé",
  shop_deleted: "Boutique supprimée",
  customer_dispute: "Litige client",
  dispute_resolved: "Litige résolu",
  delivery_refusal: "Refus à la livraison",
  post_delivery_return: "Retour après livraison",
  vendor_error: "Erreur vendeur",
  kawzone_error: "Erreur Kawzone",
  supplier_unavailable: "Fournisseur indisponible",
  commercial_gesture: "Geste commercial",
  payment_blocked: "Paiement bloqué",
  delivery_blocked: "Livraison bloquée",
  order_abandoned: "Commande abandonnée",
};

export const DECISION_LABELS: Record<OrderDecisionType, string> = {
  cancel_article: "Annuler l'article",
  cancel_suborder: "Annuler la sous-commande",
  wait_restock: "Attendre réapprovisionnement",
  wait_supplier: "Attendre fournisseur",
  wait_client: "Attendre client",
  replace_same: "Remplacer (même prix)",
  replace_higher: "Remplacer (plus cher)",
  replace_lower: "Remplacer (moins cher)",
  partial_delivery: "Livrer partiellement",
  accept_return: "Accepter le retour",
  refuse_return: "Refuser le retour",
  accept_exchange: "Accepter l'échange",
  issue_refund: "Décider d'un remboursement",
  issue_credit_note: "Décider d'un avoir",
  apply_penalty: "Appliquer une pénalité",
  commercial_gesture: "Geste commercial",
  escalate_sav: "Escalader au SAV",
  mark_dispute_resolved: "Marquer le litige comme résolu",
  override_no_action: "Aucune action (override)",
};

export const MOVEMENT_LABELS: Record<FinancialMovementType, string> = {
  cash_in: "Encaissement",
  cash_out: "Remboursement cash",
  credit_note_issued: "Avoir émis",
  credit_note_used: "Avoir consommé",
  penalty_kept: "Pénalité Kawzone",
  penalty_to_vendor: "Pénalité vendeur",
  commission_due_to_vendor: "Commission due au vendeur",
  commission_paid: "Commission payée au vendeur",
  loss_kawzone: "Perte Kawzone",
  loss_vendor: "Perte vendeur",
  loss_shared: "Perte partagée",
  gain_kawzone: "Gain Kawzone",
  gain_vendor: "Gain vendeur",
};

export const AWAITS_LABELS: Record<AwaitsParty, string> = {
  awaits_admin: "En attente de Kawzone",
  awaits_vendor: "En attente vendeur",
  awaits_supplier: "En attente fournisseur",
  awaits_client: "En attente client",
  awaits_carrier: "En attente transporteur",
  awaits_nothing: "Flux nominal",
};
