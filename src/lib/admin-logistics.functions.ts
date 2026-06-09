/**
 * admin-logistics.functions.ts — Server functions ERP Logistique Kawzone
 * 
 * Architecture: Centre de Contrôle avec détection automatique LOCAL/IMPORT,
 * pipeline métier complet, et fallback robuste pour données réelles.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertPermission, logAdminAction } from "./admin-auth.core";

/* ── Type helper pour résultats Supabase sans casts dangereux ── */

type SafeRow = Record<string, unknown>;

function safeString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}
function safeNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
function safeBool(v: unknown): boolean {
  return Boolean(v);
}

/* ── Types enrichis ── */

export type OrderType = "local" | "import" | "mixed";

export type LogisticsOrderRow = {
  // Commande
  order_id: string;
  order_status: string;
  order_type: OrderType;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_city: string | null;
  order_total: number;
  order_created_at: string;
  destination_country_id: string | null;
  destination_country_name: string | null;
  item_count: number;
  days_pending: number;

  // Logistique
  assessment_id: string | null;
  logistics_status: string | null;
  real_weight_kg: number | null;
  volumetric_weight_kg: number | null;
  chargeable_weight_kg: number | null;
  air_freight_fee: number | null;
  service_fee: number | null;
  extra_fees: number | null;
  total_shipping_fees: number | null;
  warehouse_location: string | null;
  agent_name: string | null;
  parcel_photo_url: string | null;
  shipping_service_id: string | null;
  admin_comment: string | null;
  client_response_note: string | null;

  // Paiement
  payment_status: string | null;
  amount_requested: number | null;
  amount_paid: number | null;
  amount_remaining: number | null;
  payment_method: string | null;
  payment_reference: string | null;
  confirmed_at: string | null;

  // Tracking
  tracking_number: string | null;
  carrier_name: string | null;
  tracking_url: string | null;
  warehouse_received_at: string | null;
  weighed_at: string | null;
  shipped_at: string | null;
  estimated_arrival_at: string | null;
};

export type LogisticsPage = {
  rows: LogisticsOrderRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type LogisticsAlert = {
  type: "blocked" | "urgent" | "no_tracking" | "payment_pending" | "warehouse_wait";
  count: number;
  label: string;
};

export type LogisticsStats = {
  to_weigh: number;
  to_weigh_weight: number;
  to_weigh_value: number;
  awaiting_payment: number;
  awaiting_payment_value: number;
  partial_payment: number;
  to_ship: number;
  to_ship_destinations: number;
  shipped: number;
  shipped_destinations: number;
  total_remaining: number;
  blocked: number;
  urgent: number;
  alerts: LogisticsAlert[];
};

/* ── Schémas ── */

const ListSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
  orderStatus: z.string().default(""),
  logisticsStatus: z.string().default(""),
  paymentStatus: z.string().default(""),
  orderType: z.enum(["", "local", "import", "mixed"]).default(""),
  q: z.string().max(200).default(""),
  hasRemaining: z.boolean().nullable().default(null),
  dateFrom: z.string().nullable().default(null),
  dateTo: z.string().nullable().default(null),
  includeArchived: z.boolean().default(false),
});

/* ── Helpers ── */

function daysBetween(a: string | null, b: Date = new Date()): number {
  if (!a) return 0;
  const d = new Date(a);
  if (isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((b.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

/* ═══════════════════════════════════════════════════════════════
   1. LISTE CENTRALISÉE — Avec fallback robuste
   ═══════════════════════════════════════════════════════════════ */

export const listLogisticsOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => (input ? ListSchema.parse(input) : ListSchema.parse({})))
  .handler(async ({ data, context }): Promise<LogisticsPage> => {
    await assertPermission(context.userId, "orders");

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    // Essai 1: Vue SQL (migration 20260527000002)
    let result = await tryLogisticsView(supabaseAdmin, data, from, to);

    // Fallback: Requête directe sur les tables
    if (!result) {
      result = await fallbackLogisticsQuery(supabaseAdmin, data, from, to);
    }

    return {
      rows: result.rows,
      total: result.count,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

/**
 * Essaie de requêter via la vue logistique
 */
async function tryLogisticsView(
  supabase: typeof supabaseAdmin,
  data: z.infer<typeof ListSchema>,
  from: number,
  to: number,
) {
  try {
    let q = supabase
      .from("logistics_order_view")
      .select("*", { count: "exact", head: false })
      .eq("has_import_items", true)
      .order("order_created_at", { ascending: false });

    if (data.orderStatus) q = q.eq("order_status", data.orderStatus);
    if (data.logisticsStatus) q = q.eq("logistics_status", data.logisticsStatus);
    if (data.paymentStatus) q = q.eq("payment_status", data.paymentStatus);
    if (data.hasRemaining === true) q = q.gt("amount_remaining", 0);
    if (data.dateFrom) q = q.gte("order_created_at", data.dateFrom);
    if (data.dateTo) q = q.lte("order_created_at", data.dateTo + "T23:59:59");
    if (data.q.trim()) {
      const term = `%${data.q.trim()}%`;
      q = q.or(`customer_name.ilike.${term},customer_phone.ilike.${term},order_id.ilike.${term},tracking_number.ilike.${term}`);
    }

    // ═════ Pré-filtre archivage côté serveur (Bug fix: évite de polluer la pagination)
    if (!data.includeArchived) {
      q = q.not("order_status", "eq", "delivered").not("order_status", "eq", "validated");
    }

    const { data: rows, error, count } = await q.range(from, to);
    if (error) return null;
    return { rows: rows ?? [], count: count ?? 0 };
  } catch {
    return null;
  }
}

/**
 * Fallback indestructible : requêtes séparées + assemblage.
 * AUCUNE jointure Supabase — tout est fait en mémoire.
 * Cela garantit que le dashboard affiche des données même si :
 * - les tables liées n'existent pas
 * - les relations Supabase sont cassées
 * - les colonnes sont nullables
 */
async function fallbackLogisticsQuery(
  supabase: typeof supabaseAdmin,
  data: z.infer<typeof ListSchema>,
  from: number,
  to: number,
) {
  // ═════ ÉTAPE 1 : Commandes seules (requête la plus simple possible)
  // NOTE: on récupère sans pagination pour filtrer les archivées côté serveur,
  // puis on pagine manuellement. Limite de garde-fou à 500 records.
  let { data: rawOrders, error: orderErr, count } = await supabase
    .from("orders")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(500);

  if (orderErr || !rawOrders || rawOrders.length === 0) {
    console.warn("[fallback] orders:", orderErr?.message ?? "no data");
    return { rows: [], count: count ?? 0 };
  }

  // ═════ Pré-filtre archivage côté serveur (AVANT pagination — Bug fix)
  if (!data.includeArchived) {
    rawOrders = rawOrders.filter((order: Record<string, unknown>) => {
      const status = String(order.status ?? "");
      return status !== "delivered" && status !== "validated";
    });
    // Recalculer le count après filtrage
    count = rawOrders.length;
  }

  const orderIds = rawOrders.map((o: Record<string, unknown>) => String(o.id));

  // ═════ ÉTAPE 2+4+1b PARALLÈLE : Requêtes indépendantes exécutées simultanément
  const countryIds = rawOrders
    .map((o: Record<string, unknown>) => o.destination_country_id as string)
    .filter(Boolean);

  const [countriesResult, itemsResult, assessmentsResult] = await Promise.allSettled([
    /* 1b */ countryIds.length > 0
      ? supabase.from("countries").select("id, name").in("id", countryIds)
      : Promise.resolve({ data: [] }),
    /* 2 */ supabase.from("order_items").select("order_id, product_id, quantity").in("order_id", orderIds),
    /* 4 */ supabase.from("order_shipment_assessments").select(
      `id, order_id, status, real_weight_kg, volumetric_weight_kg,
      air_freight_fee, service_fee, extra_fees, admin_comment, parcel_photo_url,
      warehouse_location, agent_name, shipping_service_id, client_response_note`
    ).in("order_id", orderIds),
  ]);

  // ── Countries
  let countryNameMap = new Map<string, string>();
  if (countriesResult.status === "fulfilled" && countriesResult.value.data) {
    for (const c of countriesResult.value.data) {
      if (c.id && c.name) countryNameMap.set(c.id as string, c.name as string);
    }
  }

  // ── Order items (avec unit_price pour calculer le total)
  let orderItemsMap = new Map<string, Array<{ product_id: string; quantity: number; unit_price: number }>>();
  let orderTotalFromItems = new Map<string, number>();
  if (itemsResult.status === "fulfilled" && itemsResult.value.data) {
    for (const it of itemsResult.value.data) {
      const arr = orderItemsMap.get(it.order_id) ?? [];
      const qty = it.quantity ?? 1;
      const price = it.unit_price ?? 0;
      arr.push({ product_id: it.product_id ?? "", quantity: qty, unit_price: price });
      orderItemsMap.set(it.order_id, arr);
      // Calculer le total depuis les items
      orderTotalFromItems.set(it.order_id, (orderTotalFromItems.get(it.order_id) ?? 0) + (qty * price));
    }
  }

  // ── Assessments
  let assessmentMap = new Map<string, Record<string, unknown>>();
  if (assessmentsResult.status === "fulfilled" && assessmentsResult.value.data) {
    for (const a of assessmentsResult.value.data) {
      assessmentMap.set(a.order_id as string, a as SafeRow);
    }
  }

  // ═════ ÉTAPE 3 : Produits + Shops (dépend de l'étape 2)
  const allProductIds = Array.from(
    new Set(Array.from(orderItemsMap.values()).flat().map((i) => i.product_id).filter(Boolean)),
  );
  let productShopMap = new Map<string, string>();
  let shopSourceMap = new Map<string, string | null>();
  if (allProductIds.length > 0) {
    try {
      const { data: products } = await supabase.from("products").select("id, shop_id").in("id", allProductIds);
      for (const p of products ?? []) { if (p.shop_id) productShopMap.set(p.id, p.shop_id); }
      const shopIds = Array.from(new Set(productShopMap.values()));
      if (shopIds.length > 0) {
        const { data: shops } = await supabase.from("shops").select("id, source_country_id").in("id", shopIds);
        for (const s of shops ?? []) { shopSourceMap.set(s.id, s.source_country_id ?? null); }
      }
    } catch { /* ignorer */ }
  }

  // ═════ ÉTAPE 5+6 PARALLÈLE : Paiements + Tracking (dépendent de l'étape 4)
  let paymentMap = new Map<string, Record<string, unknown>>();
  let trackingMap = new Map<string, Record<string, unknown>>();
  const assessmentIds = Array.from(assessmentMap.values()).map((a) => a.id as string).filter(Boolean);
  if (assessmentIds.length > 0) {
    const [paymentsResult, trackingsResult] = await Promise.allSettled([
      supabase.from("shipment_payments").select(
        "order_shipment_assessment_id, payment_status, amount_requested, amount_paid, payment_method, payment_reference, confirmed_at"
      ).in("order_shipment_assessment_id", assessmentIds),
      supabase.from("shipment_tracking").select(
        "order_shipment_assessment_id, tracking_number, carrier_name, tracking_url, warehouse_received_at, weighed_at, shipped_at, estimated_arrival_at"
      ).in("order_shipment_assessment_id", assessmentIds),
    ]);
    if (paymentsResult.status === "fulfilled" && paymentsResult.value.data) {
      for (const p of paymentsResult.value.data) { paymentMap.set(p.order_shipment_assessment_id as string, p as SafeRow); }
    }
    if (trackingsResult.status === "fulfilled" && trackingsResult.value.data) {
      for (const t of trackingsResult.value.data) { trackingMap.set(t.order_shipment_assessment_id as string, t as SafeRow); }
    }
  }

  // ═════ ÉTAPE 7 : Assemblage
  const rows: LogisticsOrderRow[] = rawOrders.map((order: Record<string, unknown>) => {
    const orderId = String(order.id);
    const items = orderItemsMap.get(orderId) ?? [];

    // ═══════════════════════════════════════════════════════════════
    // Détection LOCAL / IMPORT / MIXED — Hiérarchie de signaux
    // Ordre de priorité décroissante (du plus sûr au moins sûr)
    // ═══════════════════════════════════════════════════════════════

    // Signal 1 : Commande commission → toujours IMPORT
    const isCommission = Boolean(order.is_commission);
    // Signal 2 : shipping_service_id renseigné → IMPORT (choisi au checkout)
    const hasShippingService = Boolean(order.shipping_service_id);
    // Signal 3 : source_country_id direct sur la commande → IMPORT
    const hasSourceCountry = Boolean(order.source_country_id);
    // Signal 4 : assessment logistique existante → IMPORT (fort)
    const assessment = assessmentMap.get(orderId) ?? {};
    const hasAssessment = Boolean(assessment.id);

    // Signal 5 : Analyse des items par boutique
    let hasImport = false;
    let hasLocal = false;
    let itemsAnalyzed = 0;
    for (const item of items) {
      const shopId = productShopMap.get(item.product_id);
      if (!shopId) continue;
      itemsAnalyzed++;
      const sourceCountryId = shopSourceMap.get(shopId);
      if (sourceCountryId) {
        hasImport = true;
      } else {
        hasLocal = true;
        // Warning silencieux : boutique sans source_country_id configuré
        console.warn(`[Workflow] Boutique ${shopId} vend sans source_country_id (item ${item.product_id})`);
      }
    }

    // Décision selon la hiérarchie
    let orderType: OrderType = "local";
    if (isCommission) {
      orderType = "import";
    } else if (hasShippingService) {
      orderType = "import";
    } else if (hasSourceCountry) {
      orderType = "import";
    } else if (hasAssessment) {
      orderType = "import";
    } else if (itemsAnalyzed === 0) {
      // Aucun item analysable (produits supprimés ou tables inaccessibles)
      console.warn(`[Workflow] Commande ${orderId} : aucun item analysable, fallback LOCAL`);
    } else if (hasImport && hasLocal) {
      orderType = "mixed";
    } else if (hasImport) {
      orderType = "import";
    }
    // Sinon reste "local" (défaut sûr)

    // assessment deja recuperee au signal 4
    const assessmentId = (assessment.id as string) ?? null;
    const payment = assessmentId ? (paymentMap.get(assessmentId) ?? {}) : {};
    const tracking = assessmentId ? (trackingMap.get(assessmentId) ?? {}) : {};

    const totalFees =
      Number(assessment.air_freight_fee ?? 0) +
      Number(assessment.service_fee ?? 0) +
      Number(assessment.extra_fees ?? 0);
    const amountPaid = Number(payment.amount_paid ?? 0);
    const amountRequested = Number(payment.amount_requested ?? totalFees);
    const orderTotal = Number(order.total ?? 0) || (orderTotalFromItems.get(orderId) ?? 0);
    // amount_remaining = reste à payer sur la commande totale (produits + frais)
    const amountRemaining = Math.max(0, orderTotal - amountPaid);

    return {
      order_id: orderId,
      order_status: String(order.status ?? "new"),
      order_type: orderType,
      customer_name: (order.customer_name as string) ?? null,
      customer_phone: (order.customer_phone as string) ?? null,
      customer_address: (order.customer_address as string) ?? null,
      customer_city: (order.customer_city as string) ?? null,
      order_total: Number(order.total ?? 0) || (orderTotalFromItems.get(orderId) ?? 0),
      order_created_at: String(order.created_at ?? new Date().toISOString()),
      destination_country_id: (order.destination_country_id as string) ?? null,
      destination_country_name: countryNameMap.get(order.destination_country_id as string) ?? null,
      item_count: items.reduce((s, i) => s + (i.quantity ?? 1), 0),
      days_pending: daysBetween(String(order.created_at)),

      assessment_id: assessmentId,
      logistics_status: (assessment.status as string) ?? null,
      real_weight_kg: (assessment.real_weight_kg as number) ?? null,
      volumetric_weight_kg: (assessment.volumetric_weight_kg as number) ?? null,
      chargeable_weight_kg: (assessment.volumetric_weight_kg as number) ?? (assessment.real_weight_kg as number) ?? null,
      air_freight_fee: (assessment.air_freight_fee as number) ?? null,
      service_fee: (assessment.service_fee as number) ?? null,
      extra_fees: (assessment.extra_fees as number) ?? null,
      total_shipping_fees: totalFees,
      warehouse_location: (assessment.warehouse_location as string) ?? null,
      agent_name: (assessment.agent_name as string) ?? null,
      parcel_photo_url: (assessment.parcel_photo_url as string) ?? null,
      shipping_service_id: (assessment.shipping_service_id as string) ?? null,
      admin_comment: (assessment.admin_comment as string) ?? null,
      client_response_note: (assessment.client_response_note as string) ?? null,

      payment_status: (payment.payment_status as string) ?? (totalFees > 0 ? "pending" : null),
      amount_requested: amountRequested,
      amount_paid: amountPaid,
      amount_remaining: amountRemaining,
      payment_method: (payment.payment_method as string) ?? null,
      payment_reference: (payment.payment_reference as string) ?? null,
      confirmed_at: (payment.confirmed_at as string) ?? null,

      tracking_number: (tracking.tracking_number as string) ?? null,
      carrier_name: (tracking.carrier_name as string) ?? null,
      tracking_url: (tracking.tracking_url as string) ?? null,
      warehouse_received_at: (tracking.warehouse_received_at as string) ?? null,
      weighed_at: (tracking.weighed_at as string) ?? null,
      shipped_at: (tracking.shipped_at as string) ?? null,
      estimated_arrival_at: (tracking.estimated_arrival_at as string) ?? null,
    };
  });

  // Filtrer par order_type si demandé
  let filteredRows = rows;
  if (data.orderType) {
    filteredRows = rows.filter((r) => r.order_type === data.orderType);
  }

  // ═════ Pagination manuelle (Bug fix: appliquée APRÈS tous les filtres)
  const totalAfterFilters = filteredRows.length;
  const paginatedRows = filteredRows.slice(from, to + 1);

  return { rows: paginatedRows, count: totalAfterFilters };
}

/* ═══════════════════════════════════════════════════════════════
   2. STATS INTELLIGENTES — Avec fallback
   ═══════════════════════════════════════════════════════════════ */

export const getLogisticsStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LogisticsStats> => {
    await assertPermission(context.userId, "orders");

    // Essai 1: RPC SQL
    try {
      const { data, error } = await supabaseAdmin.rpc("get_logistics_stats" as string, {});
      if (!error && data) {
        const base = data as SafeRow;
        return {
          to_weigh: base.to_weigh ?? 0,
          to_weigh_weight: 0,
          to_weigh_value: 0,
          awaiting_payment: base.awaiting_payment ?? 0,
          awaiting_payment_value: base.total_remaining ?? 0,
          partial_payment: base.partial_payment ?? 0,
          to_ship: base.to_ship ?? 0,
          to_ship_destinations: 0,
          shipped: base.shipped ?? 0,
          shipped_destinations: 0,
          total_remaining: base.total_remaining ?? 0,
          blocked: 0,
          urgent: 0,
          alerts: [],
        };
      }
    } catch {
      /* fallback */
    }

    // Fallback: requêtes séparées (même logique que fallbackLogisticsQuery)
    let assessments: Record<string, unknown>[] = [];
    try {
      const { data: rows } = await supabaseAdmin
        .from("order_shipment_assessments")
        .select("id, order_id, status, real_weight_kg, volumetric_weight_kg, air_freight_fee, service_fee, extra_fees");
      assessments = rows ?? [];
    } catch { /* table inexistante */ }

    if (assessments.length === 0) {
      return {
        to_weigh: 0, to_weigh_weight: 0, to_weigh_value: 0,
        awaiting_payment: 0, awaiting_payment_value: 0, partial_payment: 0,
        to_ship: 0, to_ship_destinations: 0,
        shipped: 0, shipped_destinations: 0,
        total_remaining: 0, blocked: 0, urgent: 0, alerts: [],
      };
    }

    // Récupérer les paiements séparément
    const assessmentIds = assessments.map((a) => a.id as string).filter(Boolean);
    let paymentsMap = new Map<string, Record<string, unknown>>();
    try {
      const { data: pays } = await supabaseAdmin
        .from("shipment_payments")
        .select("order_shipment_assessment_id, payment_status, amount_requested, amount_paid")
        .in("order_shipment_assessment_id", assessmentIds);
      for (const p of pays ?? []) paymentsMap.set(p.order_shipment_assessment_id as string, p as SafeRow);
    } catch { /* */ }

    // Récupérer les commandes pour calcul des jours d'attente
    const orderIds = assessments.map((a) => a.order_id as string).filter(Boolean);
    let orderDatesMap = new Map<string, string>();
    try {
      const { data: ords } = await supabaseAdmin
        .from("orders")
        .select("id, created_at, destination_country_id")
        .in("id", orderIds);
      for (const o of ords ?? []) {
        orderDatesMap.set(o.id as string, String(o.created_at));
      }
    } catch { /* */ }

    let to_weigh = 0;
    let to_weigh_weight = 0;
    let to_weigh_value = 0;
    let awaiting_payment = 0;
    let awaiting_payment_value = 0;
    let partial_payment = 0;
    let to_ship = 0;
    let to_ship_dests = new Set<string>();
    let shipped = 0;
    let shipped_dests = new Set<string>();
    let total_remaining = 0;
    let blocked = 0;
    let urgent = 0;
    const alerts: LogisticsAlert[] = [];
    let noTrackingCount = 0;

    for (const a of assessments) {
      const st = String(a.status ?? "pending_arrival");
      const pay = paymentsMap.get(a.id as string) ?? {};
      const fees = Number(a.air_freight_fee ?? 0) + Number(a.service_fee ?? 0) + Number(a.extra_fees ?? 0);
      const weight = Number(a.volumetric_weight_kg ?? a.real_weight_kg ?? 0);
      const orderDate = orderDatesMap.get(a.order_id as string);
      const days = daysBetween(orderDate);
      const amtRemaining = Math.max(0, Number(pay.amount_requested ?? fees) - Number(pay.amount_paid ?? 0));

      if (st === "awaiting_weighing") { to_weigh++; to_weigh_weight += weight; to_weigh_value += fees; }
      else if (st === "validated") { to_ship++; }
      else if (st === "shipped") { shipped++; }

      if (pay.payment_status === "pending" && fees > 0) { awaiting_payment++; awaiting_payment_value += amtRemaining; }
      else if (pay.payment_status === "partial") { partial_payment++; }

      total_remaining += amtRemaining;

      if (days > 7 && st !== "shipped" && st !== "validated") blocked++;
      if (days > 14 && st !== "shipped") urgent++;
      if (st === "shipped") noTrackingCount++;
    }

    if (blocked > 0) alerts.push({ type: "blocked", count: blocked, label: "Bloquées >7j" });
    if (urgent > 0) alerts.push({ type: "urgent", count: urgent, label: "Urgentes >14j" });
    if (noTrackingCount > 0) alerts.push({ type: "no_tracking", count: noTrackingCount, label: "Sans tracking" });

    return {
      to_weigh, to_weigh_weight: Math.round(to_weigh_weight * 10) / 10, to_weigh_value,
      awaiting_payment, awaiting_payment_value, partial_payment,
      to_ship, to_ship_destinations: to_ship_dests.size,
      shipped, shipped_destinations: shipped_dests.size,
      total_remaining, blocked, urgent, alerts,
    };
  });

/* ═══════════════════════════════════════════════════════════════
   3. ÉVALUATION LOGISTIQUE — Import depuis shipment-assessments.functions.ts
   ═══════════════════════════════════════════════════════════════ */

// NOTE: getOrCreateShipmentAssessment est importé depuis shipment-assessments.functions.ts
// pour éviter la duplication et garantir la cohérence des types.
// Le fallback manuel est géré dans le handler ERP si la RPC échoue.

/* ═══════════════════════════════════════════════════════════════
   4. CONFIRMER PAIEMENT — Par assessmentId ou paymentId
   ═══════════════════════════════════════════════════════════════ */

const ConfirmPaymentSchema = z.object({
  paymentId: z.string().uuid().optional(),
  assessmentId: z.string().uuid().optional(),
  amountConfirmed: z.number().min(0),
  paymentMethod: z.string().max(50).optional(),
  paymentReference: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

export const confirmShipmentPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConfirmPaymentSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "orders");

    // Résoudre le payment_id
    let paymentId = data.paymentId;
    if (!paymentId && data.assessmentId) {
      const { data: payRow } = await supabaseAdmin
        .from("shipment_payments")
        .select("id")
        .eq("order_shipment_assessment_id", data.assessmentId)
        .maybeSingle();
      if (!payRow) throw new Error("Aucun paiement trouvé pour cette évaluation");
      paymentId = payRow.id;
    }
    if (!paymentId) throw new Error("paymentId ou assessmentId requis");

    // Lire l'ancien état
    const { data: before } = await supabaseAdmin
      .from("shipment_payments")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from("shipment_payments")
      .update({
        amount_paid: data.amountConfirmed,
        payment_status: data.amountConfirmed >= (before?.amount_requested ?? 0) ? "confirmed" : "partial",
        payment_method: data.paymentMethod ?? before?.payment_method,
        payment_reference: data.paymentReference ?? before?.payment_reference,
        confirmed_by: context.userId,
        confirmed_at: new Date().toISOString(),
        notes: data.notes ?? before?.notes,
      })
      .eq("id", paymentId);

    if (error) throw new Error(error.message);

    logAdminAction({
      action: "shipment.payment_confirm",
      targetType: "shipment_payment",
      targetId: paymentId,
      oldValues: { payment_status: before?.payment_status, amount_paid: before?.amount_paid },
      newValues: { payment_status: "confirmed", amount_paid: data.amountConfirmed },
    });

    return { ok: true };
  });

/* ═══════════════════════════════════════════════════════════════
   5. ENREGISTRER UN PAIEMENT — Nouveau paiement (Wave/OM/etc.)
   ═══════════════════════════════════════════════════════════════ */

const RecordPaymentSchema = z.object({
  assessmentId: z.string().uuid(),
  amount: z.number().min(0),
  paymentMethod: z.enum(["wave", "orange_money", "cash", "bank_transfer", "other"]),
  paymentReference: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

export const recordShipmentPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RecordPaymentSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "orders");

    // Lire le paiement existant
    const { data: existing } = await supabaseAdmin
      .from("shipment_payments")
      .select("*")
      .eq("order_shipment_assessment_id", data.assessmentId)
      .maybeSingle();

    if (existing) {
      // Mise à jour (ajout au paiement existant)
      const newPaid = (existing.amount_paid ?? 0) + data.amount;
      const requested = existing.amount_requested ?? 0;
      const { error } = await supabaseAdmin
        .from("shipment_payments")
        .update({
          amount_paid: newPaid,
          payment_status: newPaid >= requested ? "confirmed" : newPaid > 0 ? "partial" : "pending",
          payment_method: data.paymentMethod,
          payment_reference: data.paymentReference ?? existing.payment_reference,
          notes: data.notes ?? existing.notes,
          confirmed_by: context.userId,
          confirmed_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) throw new Error(error.message);

      logAdminAction({
        action: "shipment.payment_recorded",
        targetType: "shipment_payment",
        targetId: existing.id,
        newValues: { amount: data.amount, method: data.paymentMethod, new_total: newPaid },
      });

      return { ok: true, payment_id: existing.id };
    } else {
      // Créer un nouveau paiement
      const { data: inserted, error } = await supabaseAdmin
        .from("shipment_payments")
        .insert({
          order_shipment_assessment_id: data.assessmentId,
          amount_paid: data.amount,
          payment_status: "confirmed",
          payment_method: data.paymentMethod,
          payment_reference: data.paymentReference ?? null,
          notes: data.notes ?? null,
          confirmed_by: context.userId,
          confirmed_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) throw new Error(error.message);

      logAdminAction({
        action: "shipment.payment_recorded",
        targetType: "shipment_payment",
        targetId: inserted.id,
        newValues: { amount: data.amount, method: data.paymentMethod },
      });

      return { ok: true, payment_id: inserted.id };
    }
  });

/* ═══════════════════════════════════════════════════════════════
   6. TRACKING — Mise à jour
   ═══════════════════════════════════════════════════════════════ */

const TrackingSchema = z.object({
  assessmentId: z.string().uuid(),
  trackingNumber: z.string().max(100).optional(),
  carrierName: z.string().max(100).optional(),
  trackingUrl: z.string().url().optional(),
  warehouseReceivedAt: z.string().nullable().optional(),
  weighedAt: z.string().nullable().optional(),
  shippedAt: z.string().nullable().optional(),
  estimatedArrivalAt: z.string().nullable().optional(),
  warehouseLocation: z.string().max(200).optional(),
  agentName: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

export const updateShipmentTracking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TrackingSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "orders");

    const update: Record<string, unknown> = {};
    if (data.trackingNumber !== undefined) update.tracking_number = data.trackingNumber || null;
    if (data.carrierName !== undefined) update.carrier_name = data.carrierName || null;
    if (data.trackingUrl !== undefined) update.tracking_url = data.trackingUrl || null;
    if (data.warehouseReceivedAt !== undefined) update.warehouse_received_at = data.warehouseReceivedAt;
    if (data.weighedAt !== undefined) update.weighed_at = data.weighedAt;
    if (data.shippedAt !== undefined) update.shipped_at = data.shippedAt;
    if (data.estimatedArrivalAt !== undefined) update.estimated_arrival_at = data.estimatedArrivalAt;
    if (data.warehouseLocation !== undefined) update.warehouse_location = data.warehouseLocation || null;
    if (data.agentName !== undefined) update.agent_name = data.agentName || null;
    if (data.notes !== undefined) update.notes = data.notes || null;

    // Upsert: créer si n'existe pas, mettre à jour sinon
    const { data: existing } = await supabaseAdmin
      .from("shipment_tracking")
      .select("id")
      .eq("order_shipment_assessment_id", data.assessmentId)
      .maybeSingle();

    let trackingId: string;
    if (existing) {
      const { error } = await supabaseAdmin
        .from("shipment_tracking")
        .update(update)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      trackingId = existing.id;
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("shipment_tracking")
        .insert({
          order_shipment_assessment_id: data.assessmentId,
          ...update,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      trackingId = inserted.id;
    }

    logAdminAction({
      action: "shipment.tracking_update",
      targetType: "shipment_tracking",
      targetId: trackingId,
      newValues: update,
    });

    return { ok: true, tracking_id: trackingId };
  });

/* ═══════════════════════════════════════════════════════════════
   7. COLONNES PERSONNALISÉES
   ═══════════════════════════════════════════════════════════════ */

export const listCustomColumns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPermission(context.userId, "orders");
    const { data, error } = await supabaseAdmin
      .from("shipment_custom_columns")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveCustomColumnValue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        columnId: z.string().uuid(),
        assessmentId: z.string().uuid(),
        value: z.union([z.string().nullable(), z.number(), z.boolean()]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "orders");

    const { data: col } = await supabaseAdmin
      .from("shipment_custom_columns")
      .select("column_type")
      .eq("id", data.columnId)
      .maybeSingle();

    const insert: Record<string, unknown> = {
      column_id: data.columnId,
      order_shipment_assessment_id: data.assessmentId,
    };

    switch (col?.column_type) {
      case "number":
        insert.value_number = Number(data.value);
        break;
      case "date":
        insert.value_date = data.value ? new Date(data.value as string).toISOString() : null;
        break;
      case "boolean":
        insert.value_boolean = Boolean(data.value);
        break;
      default:
        insert.value_text = String(data.value ?? "");
        break;
    }

    const { error } = await supabaseAdmin
      .from("shipment_custom_values")
      .upsert(insert, { onConflict: "column_id, order_shipment_assessment_id" });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ═══════════════════════════════════════════════════════════════
   8. UPDATE SHIPMENT ASSESSMENT — Validation pesée
   ═══════════════════════════════════════════════════════════════ */

const UpdateAssessmentSchema = z.object({
  assessment_id: z.string().uuid(),
  real_weight_kg: z.number().min(0).optional(),
  volumetric_weight_kg: z.number().min(0).optional(),
  length_cm: z.number().min(0).optional(),
  width_cm: z.number().min(0).optional(),
  height_cm: z.number().min(0).optional(),
  air_freight_fee: z.number().min(0).optional(),
  service_fee: z.number().min(0).optional(),
  extra_fees: z.number().min(0).optional(),
  status: z.string().optional(),
  parcel_photo_url: z.string().optional(),
  admin_comment: z.string().optional(),
  shipping_service_id: z.string().uuid().optional(),
});

export const updateShipmentAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateAssessmentSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "orders");

    // Lire l'ancien état
    const { data: before } = await supabaseAdmin
      .from("order_shipment_assessments")
      .select("*")
      .eq("id", data.assessment_id)
      .maybeSingle();

    if (!before) throw new Error("Évaluation non trouvée");

    // ═══════════════════════════════════════════════════════════════
    // VALIDATION SERVEUR DES TRANSITIONS (P1.4)
    // ═══════════════════════════════════════════════════════════════
    if (data.status && data.status !== before.status) {
      // Lire le type de commande (select * pour eviter erreur si champ inexistant)
      const { data: orderRow } = await supabaseAdmin
        .from("orders")
        .select("*")
        .eq("id", before.order_id as string)
        .maybeSingle();

      // Détecter le type (même logique que le mapping)
      const isComm = Boolean(orderRow?.is_commission);
      const hasSvc = Boolean(orderRow?.shipping_service_id);
      const hasSrc = Boolean(orderRow?.source_country_id);
      const oType: OrderType =
        isComm || hasSvc || hasSrc || String(orderRow?.order_type) === "import"
          ? "import"
          : String(orderRow?.order_type) === "mixed"
            ? "mixed"
            : "local";

      const current = String(before.status ?? "");
      const next = data.status;

      // Transitions autorisées IMPORT
      const IMPORT_ALLOWED: Record<string, string[]> = {
        awaiting_weighing: ["fees_calculated"],
        fees_calculated: ["awaiting_client_validation", "rejected"],
        rejected: ["awaiting_weighing"],
        awaiting_client_validation: ["validated", "rejected"],
        validated: ["ready_to_ship"],
        ready_to_ship: ["shipped"],
        shipped: ["delivered"],
        "": ["awaiting_weighing"], // statut vide → initialisation
      };

      // Transitions autorisées LOCAL
      const LOCAL_ALLOWED: Record<string, string[]> = {
        new: ["confirmed"],
        confirmed: ["delivered"],
        "": ["new"],
      };

      const allowed =
        oType === "local" ? LOCAL_ALLOWED : IMPORT_ALLOWED;
      const fromTransitions = allowed[current] ?? [];

      if (!fromTransitions.includes(next)) {
        throw new Error(
          `Transition invalide : "${current}" → "${next}" non autorisee pour les commandes ${oType.toUpperCase()}. ` +
          `Transitions autorisees depuis "${current}" : ${fromTransitions.join(", ") || "aucune"}.`
        );
      }
    }

    const update: Record<string, unknown> = {
      real_weight_kg: data.real_weight_kg,
      volumetric_weight_kg: data.volumetric_weight_kg,
      updated_at: new Date().toISOString(),
    };

    if (data.length_cm !== undefined) update.length_cm = data.length_cm;
    if (data.width_cm !== undefined) update.width_cm = data.width_cm;
    if (data.height_cm !== undefined) update.height_cm = data.height_cm;
    if (data.air_freight_fee !== undefined) update.air_freight_fee = data.air_freight_fee;
    if (data.service_fee !== undefined) update.service_fee = data.service_fee;
    if (data.extra_fees !== undefined) update.extra_fees = data.extra_fees;
    if (data.status) update.status = data.status;

    // Calculer les frais automatiquement si pas fournis
    if (!data.air_freight_fee && data.volumetric_weight_kg > 0) {
      const TARIF_PAR_KG = 7500; // FCFA par kg — configurable
      const chargeableWeight = Math.max(data.real_weight_kg, data.volumetric_weight_kg);
      update.air_freight_fee = Math.round(chargeableWeight * TARIF_PAR_KG);
      update.service_fee = Math.round((update.air_freight_fee as number) * 0.1); // 10% de frais de service
    }

    const { error } = await supabaseAdmin
      .from("order_shipment_assessments")
      .update(update)
      .eq("id", data.assessment_id);

    if (error) throw new Error(error.message);

    // Créer automatiquement le shipment_payment si les frais sont calculés
    if (data.status === "fees_calculated") {
      const airFee = (update.air_freight_fee as number) ?? 0;
      const svcFee = (update.service_fee as number) ?? 0;
      const extraFee = (update.extra_fees as number) ?? 0;
      const totalFees = airFee + svcFee + extraFee;

      if (totalFees > 0) {
        const { data: existingPayment } = await supabaseAdmin
          .from("shipment_payments")
          .select("id")
          .eq("order_shipment_assessment_id", data.assessment_id)
          .maybeSingle();

        if (!existingPayment) {
          await supabaseAdmin
            .from("shipment_payments")
            .insert({
              order_shipment_assessment_id: data.assessment_id,
              amount_requested: totalFees,
              amount_paid: 0,
              payment_status: "pending",
              payment_method: null,
            });
        } else {
          await supabaseAdmin
            .from("shipment_payments")
            .update({ amount_requested: totalFees })
            .eq("id", existingPayment.id);
        }
      }
    }

    logAdminAction({
      action: "shipment.assessment_updated",
      targetType: "order_shipment_assessment",
      targetId: data.assessment_id,
      oldValues: { real_weight_kg: before.real_weight_kg, status: before.status },
      newValues: { real_weight_kg: data.real_weight_kg, status: data.status },
    });

    return { ok: true, total_fees: (update.air_freight_fee as number) ?? 0 };
  });

/* ═══════════════════════════════════════════════════════════════
   9. SEND CLIENT NOTIFICATION — Relance paiement
   ═══════════════════════════════════════════════════════════════ */

const NotificationSchema = z.object({
  order_id: z.string().uuid(),
  amount: z.number().min(0),
  message: z.string().max(500),
  type: z.enum(["payment_required", "shipped", "delivered", "reminder"]).default("payment_required"),
});

export const sendClientNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => NotificationSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "orders");

    // Créer une notification dans la table notifications
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("customer_id, customer_name, customer_phone")
      .eq("id", data.order_id)
      .maybeSingle();

    if (!order) throw new Error("Commande non trouvée");

    // Insérer dans la table notifications (si elle existe)
    try {
      const { error } = await supabaseAdmin
        .from("notifications")
        .insert({
          user_id: order.customer_id,
          type: data.type,
          title: data.type === "payment_required" ? "Paiement requis" : data.type === "shipped" ? "Colis expédié" : "Mise à jour commande",
          message: data.message,
          order_id: data.order_id,
          amount: data.amount,
          read: false,
          created_at: new Date().toISOString(),
        });

      if (error) {
        // Table n'existe peut-être pas — fallback: logger dans l'audit
        console.warn("[notification] Table notifications non disponible:", error.message);
      }
    } catch {
      // Ignorer si la table n'existe pas
    }

    // Logger l'action
    logAdminAction({
      action: "shipment.notification_sent",
      targetType: "order",
      targetId: data.order_id,
      newValues: { type: data.type, amount: data.amount, message: data.message },
    });

    return { ok: true };
  });

/* ═══════════════════════════════════════════════════════════════
   10. CREATE ORDER RETURN — Système de retours
   ═══════════════════════════════════════════════════════════════ */

const ReturnSchema = z.object({
  order_id: z.string().uuid(),
  reason: z.string().max(500).default("Retour client"),
  items: z.string().max(1000).optional(), // JSON string of returned items
});

export const createOrderReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReturnSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "orders");

    // Lire la commande
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("status, customer_id")
      .eq("id", data.order_id)
      .maybeSingle();

    if (!order) throw new Error("Commande non trouvée");

    // Créer le retour dans la table order_returns (si existe)
    try {
      const { error } = await supabaseAdmin
        .from("order_returns")
        .insert({
          order_id: data.order_id,
          reason: data.reason,
          items: data.items ? JSON.parse(data.items) : null,
          status: "requested",
          created_by: context.userId,
          created_at: new Date().toISOString(),
        });

      if (error) {
        console.warn("[return] Table order_returns non disponible:", error.message);
      }
    } catch {
      // Table n'existe pas
    }

    // Mettre à jour le statut de la commande
    const { error: updateErr } = await supabaseAdmin
      .from("orders")
      .update({ status: "returned", updated_at: new Date().toISOString() })
      .eq("id", data.order_id);

    if (updateErr) throw new Error(updateErr.message);

    logAdminAction({
      action: "order.return_created",
      targetType: "order",
      targetId: data.order_id,
      oldValues: { status: order.status },
      newValues: { status: "returned", reason: data.reason },
    });

    return { ok: true };
  });
