// ═══════════════════════════════════════════════════════════════
// COCKPIT FILTERS — Modèle de filtres métier multi-dimensions.
//
// Règle : AND entre catégories, OR à l'intérieur d'une catégorie.
//
// Conçu pour rester extensible :
//   - ajouter une nouvelle catégorie = ajouter un champ à `CockpitFilterState`
//     + une branche dans `matchSubOrder`.
//   - ajouter un nouveau "problème opérationnel" = ajouter une entrée à
//     `OP_PROBLEMS` ci-dessous. Aucune autre modification nécessaire.
// ═══════════════════════════════════════════════════════════════

import type { SubOrderRow } from "@/cockpit/hooks/useSubOrderRows";
import type { VendorProfileMap } from "@/cockpit/hooks/useVendorProfiles";
import type { SubOrderHistory, SubOrderHistoryMap } from "@/cockpit/hooks/useSubOrderHistories";
import { getHistory } from "@/cockpit/hooks/useSubOrderHistories";
import { getOrderNumber, formatSubOrderLabel } from "@/cockpit/lib/orderNumbers";
import type { OrderEventType } from "@/cockpit/lib/events";

// ─── Types de filtres ──────────────────────────────────────────

export type MgmtType = "kawzone" | "commission";
export type Flow = "local" | "import";
export type FinancialState =
  | "refund_to_pay"
  | "credit_to_issue"
  | "extra_to_collect"
  | "vendor_settlement"
  | "none";

/** Catalogue des problèmes opérationnels filtrables.
 *  Chaque entrée référence un type d'événement métier. Pour en ajouter
 *  un nouveau plus tard : ajouter l'entrée ici + (si besoin) un label
 *  d'affichage dans le panneau. */
export const OP_PROBLEMS = [
  { key: "stock_break",          label: "Rupture",                event: "stock_break" as OrderEventType,         tone: "amber" },
  { key: "product_deleted",      label: "Produit supprimé",       event: "product_deleted" as OrderEventType,     tone: "red"   },
  { key: "shop_deleted",         label: "Boutique supprimée",     event: "shop_deleted" as OrderEventType,        tone: "red"   },
  { key: "customer_dispute",     label: "Litige client",          event: "customer_dispute" as OrderEventType,    tone: "red"   },
  { key: "payment_blocked",      label: "Paiement bloqué",        event: "payment_blocked" as OrderEventType,     tone: "red"   },
  { key: "delivery_blocked",     label: "Livraison bloquée",      event: "delivery_blocked" as OrderEventType,    tone: "amber" },
  { key: "supplier_unavailable", label: "Fournisseur indisponible", event: "supplier_unavailable" as OrderEventType, tone: "amber" },
] as const;

export type OpProblemKey = (typeof OP_PROBLEMS)[number]["key"];

export const FINANCIAL_LABELS: Record<FinancialState, string> = {
  refund_to_pay: "Remboursement à effectuer",
  credit_to_issue: "Avoir à créer",
  extra_to_collect: "Complément à encaisser",
  vendor_settlement: "Règlement vendeur à effectuer",
  none: "Aucun engagement financier",
};

export interface CockpitFilterState {
  search: string;
  mgmtTypes: MgmtType[];
  statuses: string[];
  flows: Flow[];
  vendorCountries: string[];        // country_id
  marketCountries: string[];        // country_id (destination)
  productOriginCountries: string[]; // origin_country libre (string)
  financial: FinancialState[];
  opProblems: OpProblemKey[];
  dateFrom: string | null;
  dateTo: string | null;
  daysMin: number | null;
  daysMax: number | null;
}

export const DEFAULT_COCKPIT_FILTERS: CockpitFilterState = {
  search: "",
  mgmtTypes: [],
  statuses: [],
  flows: [],
  vendorCountries: [],
  marketCountries: [],
  productOriginCountries: [],
  financial: [],
  opProblems: [],
  dateFrom: null,
  dateTo: null,
  daysMin: null,
  daysMax: null,
};

// ─── Dérivations métier ────────────────────────────────────────

/** Catégorise la situation financière d'une sous-commande à partir
 *  de son historique (événements / décisions / mouvements). */
export function computeFinancialState(history: SubOrderHistory | undefined): Set<FinancialState> {
  const out = new Set<FinancialState>();
  if (!history) { out.add("none"); return out; }

  const cashOutByDec = new Set(history.movements.filter(m => m.movement_type === "cash_out").map(m => m.decision_id));
  const creditByDec  = new Set(history.movements.filter(m => m.movement_type === "credit_note_issued").map(m => m.decision_id));
  const commissionByDec = new Set(history.movements.filter(m => m.movement_type === "commission_due_to_vendor").map(m => m.decision_id));

  for (const d of history.decisions) {
    if (d.decision_type === "issue_refund" && !cashOutByDec.has(d.id)) out.add("refund_to_pay");
    if (d.decision_type === "issue_credit_note" && !creditByDec.has(d.id)) out.add("credit_to_issue");
    if (d.decision_type === "replace_higher" && !cashOutByDec.has(d.id)) out.add("extra_to_collect");
  }
  for (const m of history.movements) {
    if (m.movement_type === "commission_due_to_vendor" && commissionByDec.has(m.decision_id)) {
      out.add("vendor_settlement");
    }
  }
  if (out.size === 0) out.add("none");
  return out;
}

/** Liste des problèmes opérationnels présents sur une sous-commande. */
export function computeOpProblems(history: SubOrderHistory | undefined): Set<OpProblemKey> {
  const out = new Set<OpProblemKey>();
  if (!history) return out;
  for (const p of OP_PROBLEMS) {
    if (history.events.some(e => e.event_type === p.event)) out.add(p.key);
  }
  return out;
}

// ─── Prédicat principal ────────────────────────────────────────

interface MatchContext {
  vendorProfiles: VendorProfileMap | undefined;
  historyMap: SubOrderHistoryMap | undefined;
}

export function matchSubOrder(
  row: SubOrderRow,
  f: CockpitFilterState,
  ctx: MatchContext,
): boolean {
  // 0. Recherche texte multi-champs
  if (f.search.trim()) {
    const q = f.search.toLowerCase().trim();
    const profile = ctx.vendorProfiles?.get(row.vendor_id);
    const motherNum = getOrderNumber(row.mother_order_id).toLowerCase();
    const subNum = row.label.toLowerCase();
    const hay = [
      row.mother_order_id,
      motherNum,
      subNum,
      row.vendor_name,
      profile?.shop_name ?? "",
      row.order.customer_name ?? "",
      row.order.customer_phone ?? "",
    ].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }

  // 1. Type de gestion (Admin / Commission). L'autonome est exclu à la source.
  if (f.mgmtTypes.length > 0 && !f.mgmtTypes.includes(row.cockpit_scope as MgmtType)) return false;

  // 2. Statut logistique (multi)
  if (f.statuses.length > 0) {
    const s = (row.order.logistics_status ?? "new").trim() || "new";
    if (!f.statuses.includes(s)) return false;
  }

  // 3. Flux Local / Import (multi)
  if (f.flows.length > 0) {
    const hasLocal = row.kind === "local" || row.kind === "local_and_import";
    const hasImport = row.kind === "import" || row.kind === "local_and_import";
    const ok = (f.flows.includes("local") && hasLocal) || (f.flows.includes("import") && hasImport);
    if (!ok) return false;
  }

  // 4. Pays vendeur (multi) — basé sur profile.source_country_id
  if (f.vendorCountries.length > 0) {
    const profile = ctx.vendorProfiles?.get(row.vendor_id);
    const cid = profile?.source_country_id;
    if (!cid || !f.vendorCountries.includes(cid)) return false;
  }

  // 5. Marché de vente (multi) — destination_country_id de la commande mère
  if (f.marketCountries.length > 0) {
    const cid = row.order.destination_country_id;
    if (!cid || !f.marketCountries.includes(cid)) return false;
  }

  // 6. Pays d'origine produit (multi) — au moins 1 article a origin_country dans la sélection
  if (f.productOriginCountries.length > 0) {
    const found = row.articles.some(a => a.origin_country && f.productOriginCountries.includes(a.origin_country));
    if (!found) return false;
  }

  // 7. Situation financière (multi)
  if (f.financial.length > 0) {
    const history = getHistory(ctx.historyMap, row.mother_order_id, row.vendor_id);
    const states = computeFinancialState(history);
    const ok = f.financial.some(s => states.has(s));
    if (!ok) return false;
  }

  // 8. Problèmes opérationnels (multi)
  if (f.opProblems.length > 0) {
    const history = getHistory(ctx.historyMap, row.mother_order_id, row.vendor_id);
    const problems = computeOpProblems(history);
    const ok = f.opProblems.some(p => problems.has(p));
    if (!ok) return false;
  }

  // 9. Date de création
  if (f.dateFrom) {
    const t = new Date(f.dateFrom).getTime();
    if (new Date(row.order.order_created_at ?? 0).getTime() < t) return false;
  }
  if (f.dateTo) {
    const t = new Date(f.dateTo).getTime() + 86400000;
    if (new Date(row.order.order_created_at ?? 0).getTime() > t) return false;
  }

  // 10. Ancienneté
  if (f.daysMin !== null || f.daysMax !== null) {
    const days = Math.floor((Date.now() - new Date(row.order.order_created_at ?? Date.now()).getTime()) / 86400000);
    if (f.daysMin !== null && days < f.daysMin) return false;
    if (f.daysMax !== null && days > f.daysMax) return false;
  }

  return true;
}

/** Compte le nombre de catégories actives (pour le badge "Filtres (n)"). */
export function activeFilterCount(f: CockpitFilterState): number {
  let n = 0;
  if (f.search.trim()) n++;
  if (f.mgmtTypes.length) n++;
  if (f.statuses.length) n++;
  if (f.flows.length) n++;
  if (f.vendorCountries.length) n++;
  if (f.marketCountries.length) n++;
  if (f.productOriginCountries.length) n++;
  if (f.financial.length) n++;
  if (f.opProblems.length) n++;
  if (f.dateFrom || f.dateTo) n++;
  if (f.daysMin !== null || f.daysMax !== null) n++;
  return n;
}

// re-export pour praticité
export { formatSubOrderLabel };
