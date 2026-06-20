// ═══════════════════════════════════════════════════════════════
// SUB-ORDERS — Vue dérivée par vendeur (Phase 3).
//
// Une "sub_order" = projection d'une commande mère par `vendor_id`.
// C'est l'unité opérationnelle principale du Cockpit.
//
// Règle de visibilité Cockpit (validée) :
//   - is_admin_shop = true             → "kawzone"     (visible)
//   - sinon, commission_amount > 0     → "commission"  (visible)
//   - sinon                            → "autonomous"  (HORS Cockpit)
//
// Le scope est calculé directement à partir des articles : on évite
// un aller-retour serveur supplémentaire — `getOrderItems` capture
// déjà `is_admin_shop` et `commission_amount` pour chaque ligne.
// ═══════════════════════════════════════════════════════════════

import type { OrderArticle } from "./article-states";
import { aggregateOrder, type OrderAggregate } from "./order-aggregate";
import { formatSubOrderLabel } from "./orderNumbers";
import type { LineKind } from "@/lib/line-kind";

export type SubOrderKind = "local" | "import" | "local_and_import";
export type SubOrderCockpitScope = "kawzone" | "commission" | "autonomous";

export interface DerivedSubOrder {
  vendor_id: string;
  vendor_name: string;
  sub_order_key: string;
  index: number;
  total: number;
  label: string;
  kind: SubOrderKind;
  /** LineKind figé (= partie après "::" dans sub_order_key). */
  line_kind: LineKind;
  articles: OrderArticle[];
  aggregate: OrderAggregate;
  /** Scope dérivé des articles — détermine la visibilité Cockpit. */
  cockpit_scope: SubOrderCockpitScope;
  /** Raccourci : true si la sous-commande appartient au Cockpit principal. */
  is_kawzone_managed: boolean;
  /** Finances par sous-commande. */
  financials: {
    product_total: number;
    article_count: number;
    delivered_count: number;
    blocked_count: number;
    /** Somme commission_amount Kawzone (toutes lignes non annulées). */
    commission_total: number;
    /** Marge Kawzone = commission encaissée (revenus nets pour Kawzone). */
    kawzone_margin: number;
    /** Total remboursements client (settlement.type === "refund"). */
    refund_total: number;
    /** Total avoirs client (settlement.type === "credit"). */
    credit_total: number;
  };
}

function computeScope(articles: OrderArticle[]): SubOrderCockpitScope {
  let hasAdmin = false;
  let hasCommission = false;
  for (const a of articles) {
    if (a.status === "cancelled") continue;
    if (a.is_admin_shop) hasAdmin = true;
    if ((a.commission_amount ?? 0) > 0) hasCommission = true;
  }
  if (hasAdmin) return "kawzone";
  if (hasCommission) return "commission";
  return "autonomous";
}

export function deriveSubOrders(
  articles: OrderArticle[] | null | undefined,
  orderStatus?: string,
  motherOrderId?: string,
): DerivedSubOrder[] {
  const list = articles ?? [];
  if (list.length === 0) return [];

  const groups = new Map<string, OrderArticle[]>();
  for (const a of list) {
    // sub_order_key est la clé primaire ; fallback sur vendor_id pour compatibilité
    const key = a.sub_order_key ?? a.vendor_id ?? "unknown";
    const arr = groups.get(key);
    if (arr) arr.push(a);
    else groups.set(key, [a]);
  }

  type RawSub = Omit<DerivedSubOrder, "index" | "total" | "label">;
  const raw: RawSub[] = [];
  for (const [sub_order_key, subArticles] of groups) {
    const first = subArticles[0];
    const vendor_name = first.vendor_name ?? "Vendeur inconnu";
    const vendor_id = first.vendor_id ?? sub_order_key;
    const aggregate = aggregateOrder(subArticles, orderStatus);

    const hasLocal = subArticles.some(a => a.is_local);
    const hasImport = subArticles.some(a => a.is_import);
    const kind: SubOrderKind =
      hasLocal && hasImport ? "local_and_import"
      : hasImport ? "import"
      : "local";

    const active = subArticles.filter(a => a.status !== "cancelled");
    const product_total = active.reduce((s, a) => s + (a.line_total ?? 0), 0);
    const commission_total = active.reduce((s, a) => s + (a.commission_amount ?? 0), 0);
    const refund_total = subArticles.reduce((s, a) => {
      const st = a.settlement;
      return st && st.type === "refund" ? s + (st.amount ?? 0) : s;
    }, 0);
    const credit_total = subArticles.reduce((s, a) => {
      const st = a.settlement;
      return st && st.type === "credit" ? s + (st.amount ?? 0) : s;
    }, 0);

    const cockpit_scope = computeScope(subArticles);

    // line_kind = partie après "::" dans sub_order_key (fallback: déduit de kind).
    const parsedKind = sub_order_key.includes("::") ? sub_order_key.split("::")[1] : "";
    const line_kind: LineKind =
      parsedKind === "LOCAL" || parsedKind === "IMPORT_KNOWN_WEIGHT" || parsedKind === "IMPORT_UNKNOWN_WEIGHT"
        ? (parsedKind as LineKind)
        : (hasImport ? "IMPORT_UNKNOWN_WEIGHT" : "LOCAL");

    raw.push({
      vendor_id,
      vendor_name,
      sub_order_key,
      kind,
      line_kind,
      articles: subArticles,
      aggregate,
      cockpit_scope,
      is_kawzone_managed: cockpit_scope !== "autonomous",
      financials: {
        product_total,
        article_count: subArticles.length,
        delivered_count: aggregate.counters.delivered,
        blocked_count: aggregate.counters.blocked,
        commission_total,
        kawzone_margin: commission_total,
        refund_total,
        credit_total,
      },
    });
  }

  // Tri opérationnel : bloquants, puis règlements en attente, puis prêts.
  const sorted = raw.sort((a, b) => {
    const score = (s: RawSub) =>
      (s.aggregate.flags.has_blocking ? 1000 : 0) +
      (s.aggregate.pending_money.total_abs > 0 ? 500 : 0) +
      (s.aggregate.flags.can_ship_today ? 100 : 0) +
      s.financials.product_total / 1_000_000;
    return score(b) - score(a);
  });

  // Numérotation uniquement sur les sous-commandes Kawzone (pas les autonomes)
  const kawzoneSubs = sorted.filter(s => s.is_kawzone_managed);
  const kawzoneTotal = kawzoneSubs.length;

  // Index dans la séquence Kawzone uniquement
  const kawzoneIndexMap = new Map<string, number>();
  kawzoneSubs.forEach((s, i) => kawzoneIndexMap.set(s.sub_order_key, i + 1));

  return sorted.map(s => ({
    ...s,
    index: kawzoneIndexMap.get(s.sub_order_key) ?? 0,
    total: kawzoneTotal,
    label: s.is_kawzone_managed
      ? formatSubOrderLabel(motherOrderId ?? "", kawzoneIndexMap.get(s.sub_order_key) ?? 0, kawzoneTotal)
      : `${s.vendor_name} (autonome)`,
  }));
}
