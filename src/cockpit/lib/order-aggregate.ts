// ═══════════════════════════════════════════════════════════════
// ORDER AGGREGATE — Première version (squelette fonctionnel v0.1)
//
// Source unique de vérité pour répondre, à partir d'une commande :
//   • quels articles sont PRÊTS à partir ?
//   • quels articles BLOQUENT (rupture non traitée) ?
//   • quels articles ATTENDENT un fournisseur (import en cours) ?
//   • quels articles ATTENDENT un réappro (wait_restock non repris) ?
//   • quels articles sont LIVRÉS ?
//   • quels articles sont ANNULÉS / EXCLUS ?
//   • quelle est l'action prioritaire (next_action) ?
//   • combien d'€ attendent un règlement financier ?
//
// ▸ Pure function : aucune dépendance React, aucun appel réseau.
// ▸ Ne mute rien. Lit `OrderArticle[]` + status commande, renvoie un objet figé.
// ▸ Couverture v0.1 : ~30% des scénarios. Les cas non couverts tombent dans
//   `next_action: "review"` plutôt que de planter — c'est volontaire.
// ═══════════════════════════════════════════════════════════════

import type { OrderArticle, ArticleStatus, StockBreakAction } from "./article-states";
import { getReplaceImpact } from "./article-states";

// ─── Catégories de groupement (sections visibles dans le Cockpit) ───
export type ArticleBucket =
  | "ready"               // Prêt à partir / déjà préparé
  | "blocked"             // Rupture non résolue → décision admin requise
  | "waiting_supplier"    // Import : commandé, en attente d'arrivée
  | "waiting_restock"     // Décision wait_restock prise, stock pas encore revenu
  | "waiting_money"       // Règlement financier en attente (refund/credit/extra)
  | "in_progress"         // Suit son flux normal (pending/available/received…)
  | "delivered"           // Livré au client
  | "cancelled";          // Annulé / exclu du colis

// ─── Action prioritaire au niveau commande ───
export type AggregateNextAction =
  | "resolve_break"        // Au moins un article bloque
  | "order_supplier"       // Import à passer au fournisseur
  | "receive_warehouse"    // Import en transit, à réceptionner
  | "settle_money"         // Règlement financier en attente
  | "prepare_shipment"     // Tout est prêt, on peut préparer/expédier
  | "ship"                 // Préparé, à expédier
  | "wait_restock"         // Tout le reste tourne autour d'attentes réappro
  | "done"                 // Commande terminée
  | "review";              // Cas non encore couvert par l'agrégateur v0.1

export interface BucketedArticle {
  article: OrderArticle;
  bucket: ArticleBucket;
  reason: string;          // Phrase courte expliquant POURQUOI cet article est dans ce bucket
}

// ─── Préparation IMPORT : pesée (squelette, données pas encore branchées) ───
// L'agrégateur expose dès maintenant les points d'entrée. Tant que les champs
// `actual_weight` / `estimated_weight` ne sont pas posés sur OrderArticle,
// chaque article importé tombera en `weight_state: "unknown"`.
export type WeightState = "known" | "estimated" | "unknown";

export interface WeighingReadiness {
  applicable: boolean;             // false si commande 100% locale
  total_import_articles: number;
  by_state: Record<WeightState, number>;
  articles: Array<{
    article: OrderArticle;
    weight_state: WeightState;
    reason: string;
  }>;
}

export interface NextActionDriver {
  bucket: ArticleBucket;
  article_id: string;
  product_name: string;
  reason: string;
}

export interface OrderAggregate {
  counters: Record<ArticleBucket, number>;
  by_bucket: Record<ArticleBucket, BucketedArticle[]>;
  articles: BucketedArticle[];
  next_action: AggregateNextAction;
  next_action_reason: string;
  /** ★ Pourquoi cette action a été choisie (priorité métier appliquée). */
  next_action_why: string;
  /** ★ Article qui provoque l'action prioritaire (null si done / review). */
  next_action_driver: NextActionDriver | null;
  pending_money: {
    refund: number;
    credit: number;
    extra_payment: number;
    total_abs: number;
  };
  /** ★ Préparation IMPORT pesée (points d'entrée, pas encore alimentés). */
  weighing: WeighingReadiness;
  flags: {
    has_blocking: boolean;
    has_ready: boolean;
    all_delivered: boolean;
    fully_cancelled: boolean;
    can_ship_today: boolean;
  };
}

// ─── Helpers internes ─────────────────────────────────────────────

function isDelivered(a: OrderArticle): boolean {
  return a.status === "delivered" || (a.delivered_qty ?? 0) >= a.quantity;
}

function isCancelled(a: OrderArticle): boolean {
  if (a.status === "cancelled") return true;
  const sb = a.stock_break;
  if (sb && sb.resolved && (sb.action === "cancel" || (sb.action as StockBreakAction) === "partial_ship")) {
    return true;
  }
  return false;
}

function isBlocking(a: OrderArticle): boolean {
  return !!(a.stock_break && !a.stock_break.resolved);
}

function isWaitingRestock(a: OrderArticle): boolean {
  const sb = a.stock_break;
  return !!(sb && sb.resolved && sb.action === "wait_restock" && !sb.resumed_at);
}

function isWaitingSupplier(a: OrderArticle): boolean {
  // Import en cours : commandé fournisseur mais pas encore arrivé.
  return a.is_import && (a.status === "ordered" || a.status === "received") && !isDelivered(a);
}

function isReady(a: OrderArticle): boolean {
  if (isDelivered(a) || isCancelled(a) || isBlocking(a) || isWaitingRestock(a)) return false;
  return a.status === "ready" || a.status === "available";
}

function needsSettlement(a: OrderArticle): boolean {
  const sb = a.stock_break;
  if (!sb || !sb.resolved) return false;
  // Settlement explicitement posé → plus en attente.
  if (a.settlement) return false;
  const k = (sb.action as StockBreakAction);
  if (k === "refund" || k === "credit") return true;
  if (k === "replace_higher" || k === "replace_lower") return true;
  if (k === "replace") {
    const imp = getReplaceImpact(a);
    return !!(imp && imp.variant !== "replace_same");
  }
  return false;
}

function classify(a: OrderArticle): { bucket: ArticleBucket; reason: string } {
  if (isCancelled(a)) return { bucket: "cancelled", reason: "Article annulé / exclu du colis" };
  if (isDelivered(a)) return { bucket: "delivered", reason: "Livré au client" };
  if (isBlocking(a)) return { bucket: "blocked", reason: "Rupture non résolue — décision admin requise" };
  if (isWaitingRestock(a)) return { bucket: "waiting_restock", reason: "En attente du retour de stock" };
  if (needsSettlement(a)) return { bucket: "waiting_money", reason: "Règlement financier à effectuer" };
  if (isWaitingSupplier(a)) return { bucket: "waiting_supplier", reason: a.status === "ordered" ? "Commandé fournisseur — en transit" : "Reçu entrepôt — à préparer" };
  if (isReady(a)) return { bucket: "ready", reason: a.status === "ready" ? "Prêt à expédier" : "Disponible en stock" };
  return { bucket: "in_progress", reason: `Statut : ${a.status}` };
}

function emptyCounters(): Record<ArticleBucket, number> {
  return {
    ready: 0, blocked: 0, waiting_supplier: 0, waiting_restock: 0,
    waiting_money: 0, in_progress: 0, delivered: 0, cancelled: 0,
  };
}

function emptyByBucket(): Record<ArticleBucket, BucketedArticle[]> {
  return {
    ready: [], blocked: [], waiting_supplier: [], waiting_restock: [],
    waiting_money: [], in_progress: [], delivered: [], cancelled: [],
  };
}

function decideNextAction(
  counters: Record<ArticleBucket, number>,
  orderStatus: string | undefined,
): { action: AggregateNextAction; reason: string } {
  // Ordre de priorité métier : ce qui bloque > ce qui coûte de l'argent > ce qui avance.
  if (counters.blocked > 0)
    return { action: "resolve_break", reason: `${counters.blocked} rupture(s) à traiter` };
  if (counters.waiting_money > 0)
    return { action: "settle_money", reason: `${counters.waiting_money} règlement(s) en attente` };

  const activeCount = counters.ready + counters.blocked + counters.waiting_supplier
    + counters.waiting_restock + counters.in_progress + counters.waiting_money;

  if (activeCount === 0) {
    if (counters.delivered > 0) return { action: "done", reason: "Tous les articles sont livrés" };
    if (counters.cancelled > 0) return { action: "done", reason: "Commande entièrement annulée" };
  }

  // Tout ce qui reste peut partir ?
  const blockers = counters.blocked + counters.waiting_supplier + counters.waiting_restock + counters.waiting_money;
  if (counters.ready > 0 && blockers === 0) {
    if (orderStatus === "ready" || orderStatus === "ready_delivery") {
      return { action: "ship", reason: "Prêt à expédier" };
    }
    return { action: "prepare_shipment", reason: `${counters.ready} article(s) prêts — peut partir aujourd'hui` };
  }

  if (counters.waiting_supplier > 0) {
    return { action: "receive_warehouse", reason: `${counters.waiting_supplier} article(s) en transit fournisseur` };
  }
  if (counters.in_progress > 0) {
    // Import à commander encore ?
    return { action: "order_supplier", reason: `${counters.in_progress} article(s) à faire avancer` };
  }
  if (counters.waiting_restock > 0) {
    return { action: "wait_restock", reason: `${counters.waiting_restock} article(s) en attente réappro` };
  }
  return { action: "review", reason: "Cas non encore couvert par l'agrégateur v0.1" };
}

function computePendingMoney(articles: OrderArticle[]) {
  let refund = 0, credit = 0, extra_payment = 0;
  for (const a of articles) {
    if (!needsSettlement(a)) continue;
    const sb = a.stock_break!;
    const k = sb.action as StockBreakAction;
    if (k === "refund") refund += a.line_total;
    else if (k === "credit") credit += a.line_total;
    else if (k === "replace_higher") {
      const imp = getReplaceImpact(a); if (imp) extra_payment += Math.abs(imp.delta);
    } else if (k === "replace_lower") {
      const imp = getReplaceImpact(a); if (imp) refund += Math.abs(imp.delta);
    } else if (k === "replace") {
      const imp = getReplaceImpact(a);
      if (imp) {
        if (imp.delta > 0) extra_payment += imp.delta;
        else refund += Math.abs(imp.delta);
      }
    }
  }
  return { refund, credit, extra_payment, total_abs: refund + credit + extra_payment };
}

// ─── API publique ─────────────────────────────────────────────────

/** ★ aggregateOrder() v0.1 ★
 *  Première version fonctionnelle. Pure, déterministe, sans effets de bord.
 *  À enrichir au fil des scénarios. Les cas non couverts → bucket `in_progress`
 *  ou `next_action: "review"` (jamais d'exception). */
export function aggregateOrder(
  articles: OrderArticle[] | undefined | null,
  orderStatus?: string,
): OrderAggregate {
  const list = articles ?? [];
  const counters = emptyCounters();
  const by_bucket = emptyByBucket();
  const bucketed: BucketedArticle[] = list.map(a => {
    const { bucket, reason } = classify(a);
    counters[bucket]++;
    const row: BucketedArticle = { article: a, bucket, reason };
    by_bucket[bucket].push(row);
    return row;
  });

  const { action, reason } = decideNextAction(counters, orderStatus);
  const pending_money = computePendingMoney(list);

  const total = list.length;
  const flags = {
    has_blocking: counters.blocked > 0,
    has_ready: counters.ready > 0,
    all_delivered: total > 0 && counters.delivered === total,
    fully_cancelled: total > 0 && counters.cancelled === total,
    can_ship_today: counters.ready > 0
      && counters.blocked === 0
      && counters.waiting_supplier === 0
      && counters.waiting_restock === 0
      && counters.waiting_money === 0,
  };

  return { counters, by_bucket, articles: bucketed, next_action: action, next_action_reason: reason, pending_money, flags };
}

// ─── Libellés UI (séparés pour rester pure côté logique) ───
export const BUCKET_LABELS: Record<ArticleBucket, string> = {
  ready: "Prêts",
  blocked: "Bloqués",
  waiting_supplier: "Attente fournisseur",
  waiting_restock: "Attente réappro",
  waiting_money: "Attente règlement",
  in_progress: "En cours",
  delivered: "Livrés",
  cancelled: "Annulés",
};

export const BUCKET_COLORS: Record<ArticleBucket, string> = {
  ready: "bg-emerald-100 text-emerald-800 border-emerald-200",
  blocked: "bg-red-600 text-white border-red-700",
  waiting_supplier: "bg-blue-100 text-blue-800 border-blue-200",
  waiting_restock: "bg-slate-200 text-slate-800 border-slate-300",
  waiting_money: "bg-amber-100 text-amber-900 border-amber-300",
  in_progress: "bg-gray-100 text-gray-700 border-gray-200",
  delivered: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-gray-300 text-gray-800 border-gray-400",
};

export const NEXT_ACTION_LABELS: Record<AggregateNextAction, string> = {
  resolve_break: "Résoudre rupture",
  order_supplier: "Commander fournisseur",
  receive_warehouse: "Réceptionner entrepôt",
  settle_money: "Régler financièrement",
  prepare_shipment: "Préparer expédition",
  ship: "Expédier",
  wait_restock: "Attendre réappro",
  done: "Terminée",
  review: "À examiner",
};
