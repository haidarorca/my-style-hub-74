// ═══════════════════════════════════════════════════════════════
// SUB-ORDERS — Vue dérivée par (vendor_id + line_kind).
//
// Une "sub_order" = projection d'une commande mère par boutique ET catégorie.
// Une même boutique vendant du IMPORT_KNOWN_WEIGHT + IMPORT_UNKNOWN_WEIGHT
// produit DEUX sous-commandes opérationnelles distinctes.
//
// Catégories strictes :
//   LOCAL                  — pas de fret, pas de pesée
//   IMPORT_KNOWN_WEIGHT    — fret FIGÉ au checkout (sum des freight_fee)
//   IMPORT_UNKNOWN_WEIGHT  — fret SEULEMENT après pesée
//                            (zéro jusqu'à présence d'un air_freight_fee)
//
// Règle de visibilité Cockpit (inchangée) :
//   is_admin_shop=true       → "kawzone"
//   commission_amount>0      → "commission"
//   sinon                    → "autonomous"
// ═══════════════════════════════════════════════════════════════

import type { OrderArticle } from "./article-states";
import { aggregateOrder, type OrderAggregate } from "./order-aggregate";
import { formatSubOrderLabel } from "./orderNumbers";
import { subOrderKey, type LineKind } from "@/lib/line-kind";

/** Conservé pour compat composants legacy. Nouveau code : utiliser `line_kind`. */
export type SubOrderKind = "local" | "import" | "local_and_import";
export type SubOrderCockpitScope = "kawzone" | "commission" | "autonomous";

export interface DerivedSubOrder {
  /** Clé STABLE et UNIQUE : `${vendor_id}::${line_kind}`. */
  sub_order_key: string;
  /** Catégorie stricte de cette sous-commande. */
  line_kind: LineKind;
  vendor_id: string;
  vendor_name: string;
  index: number;
  total: number;
  label: string;
  /** @deprecated Mapping vers l'ancien type pour composants non migrés. */
  kind: SubOrderKind;
  articles: OrderArticle[];
  aggregate: OrderAggregate;
  cockpit_scope: SubOrderCockpitScope;
  is_kawzone_managed: boolean;
  financials: {
    product_total: number;
    article_count: number;
    delivered_count: number;
    blocked_count: number;
    commission_total: number;
    kawzone_margin: number;
    refund_total: number;
    credit_total: number;
    /** Fret figé au checkout (uniquement IMPORT_KNOWN_WEIGHT, sum des item.freight_fee). */
    declared_freight: number;
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

function inferLineKind(a: OrderArticle): LineKind {
  if (a.line_kind === "LOCAL" || a.line_kind === "IMPORT_KNOWN_WEIGHT" || a.line_kind === "IMPORT_UNKNOWN_WEIGHT") {
    return a.line_kind;
  }
  // Fallback : LOCAL si non-import, sinon UNKNOWN par défaut (jamais inventer un KNOWN).
  return a.is_import ? "IMPORT_UNKNOWN_WEIGHT" : "LOCAL";
}

function legacyKindFor(line_kind: LineKind): SubOrderKind {
  return line_kind === "LOCAL" ? "local" : "import";
}

export function deriveSubOrders(
  articles: OrderArticle[] | null | undefined,
  orderStatus?: string,
  motherOrderId?: string,
): DerivedSubOrder[] {
  const list = articles ?? [];
  if (list.length === 0) return [];

  // Grouper par (vendor_id + line_kind).
  const groups = new Map<string, { vendor_id: string; line_kind: LineKind; arr: OrderArticle[] }>();
  for (const a of list) {
    const vid = a.vendor_id ?? "unknown";
    const lk = inferLineKind(a);
    const key = a.sub_order_key ?? subOrderKey(vid, lk);
    const bucket = groups.get(key);
    if (bucket) bucket.arr.push(a);
    else groups.set(key, { vendor_id: vid, line_kind: lk, arr: [a] });
  }

  type RawSub = Omit<DerivedSubOrder, "index" | "total" | "label">;
  const raw: RawSub[] = [];
  for (const [key, { vendor_id, line_kind, arr: vendorArticles }] of groups) {
    const first = vendorArticles[0];
    const vendor_name = first.vendor_name ?? "Vendeur inconnu";
    const aggregate = aggregateOrder(vendorArticles, orderStatus);

    const active = vendorArticles.filter(a => a.status !== "cancelled");
    const product_total = active.reduce((s, a) => s + (a.line_total ?? 0), 0);
    const commission_total = active.reduce((s, a) => s + (a.commission_amount ?? 0), 0);
    // Fret figé : SOMME des __freight_fee de CETTE sous-commande UNIQUEMENT.
    // - LOCAL → toujours 0
    // - IMPORT_KNOWN_WEIGHT → fret figé au checkout (jamais recalculé)
    // - IMPORT_UNKNOWN_WEIGHT → 0 ici (fret réel = air_freight_fee de l'assessment, ailleurs)
    const declared_freight = line_kind === "IMPORT_KNOWN_WEIGHT"
      ? active.reduce((s, a) => s + (a.freight_fee ?? 0), 0)
      : 0;
    const refund_total = vendorArticles.reduce((s, a) => {
      const st = a.settlement;
      return st && st.type === "refund" ? s + (st.amount ?? 0) : s;
    }, 0);
    const credit_total = vendorArticles.reduce((s, a) => {
      const st = a.settlement;
      return st && st.type === "credit" ? s + (st.amount ?? 0) : s;
    }, 0);

    const cockpit_scope = computeScope(vendorArticles);

    raw.push({
      sub_order_key: key,
      line_kind,
      vendor_id,
      vendor_name,
      kind: legacyKindFor(line_kind),
      articles: vendorArticles,
      aggregate,
      cockpit_scope,
      is_kawzone_managed: cockpit_scope !== "autonomous",
      financials: {
        product_total,
        article_count: vendorArticles.length,
        delivered_count: aggregate.counters.delivered,
        blocked_count: aggregate.counters.blocked,
        commission_total,
        kawzone_margin: commission_total,
        refund_total,
        credit_total,
        declared_freight,
      },
    });
  }

  // Tri opérationnel : bloquants → règlements → prêts.
  const sorted = raw.sort((a, b) => {
    const score = (s: RawSub) =>
      (s.aggregate.flags.has_blocking ? 1000 : 0) +
      (s.aggregate.pending_money.total_abs > 0 ? 500 : 0) +
      (s.aggregate.flags.can_ship_today ? 100 : 0) +
      s.financials.product_total / 1_000_000;
    return score(b) - score(a);
  });

  const total = sorted.length;
  return sorted.map((s, i) => ({
    ...s,
    index: i + 1,
    total,
    label: formatSubOrderLabel(motherOrderId ?? "", i + 1, total),
  }));
}
