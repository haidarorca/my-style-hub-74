/**
 * admin-logistics.functions.ts — Server functions pour le tableau ERP logistique
 * Opérations centralisées : lecture, filtres, paiement, tracking, colonnes perso
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertPermission, logAdminAction } from "./admin-auth.core";

/* ── Types ── */

export type LogisticsOrderRow = {
  order_id: string;
  order_status: string;
  customer_name: string | null;
  customer_phone: string | null;
  order_total: number;
  order_created_at: string;
  destination_country_id: string | null;
  assessment_id: string | null;
  logistics_status: string | null;
  real_weight_kg: number | null;
  volumetric_weight_kg: number | null;
  air_freight_fee: number | null;
  service_fee: number | null;
  extra_fees: number | null;
  total_shipping_fees: number | null;
  payment_status: string | null;
  amount_requested: number | null;
  amount_paid: number | null;
  amount_remaining: number | null;
  payment_method: string | null;
  payment_reference: string | null;
  confirmed_at: string | null;
  tracking_number: string | null;
  carrier_name: string | null;
  warehouse_received_at: string | null;
  weighed_at: string | null;
  shipped_at: string | null;
  estimated_arrival_at: string | null;
  item_count: number;
};

export type LogisticsPage = {
  rows: LogisticsOrderRow[];
  total: number;
  page: number;
  pageSize: number;
};

/* ── Schémas ── */

const ListSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
  orderStatus: z.string().default(""),
  logisticsStatus: z.string().default(""),
  paymentStatus: z.string().default(""),
  q: z.string().max(200).default(""),
  hasRemaining: z.boolean().nullable().default(null),
  dateFrom: z.string().nullable().default(null),
  dateTo: z.string().nullable().default(null),
});

/* ── 1. LISTE CENTRALISÉE ── */

export const listLogisticsOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => (input ? ListSchema.parse(input) : ListSchema.parse({})))
  .handler(async ({ data, context }): Promise<LogisticsPage> => {
    await assertPermission(context.userId, "orders");

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    // La vue inclut maintenant TOUTES les commandes confirmed
    // avec has_import_items pour filtrer uniquement les commandes logistiques
    let q = supabaseAdmin
      .from("logistics_order_view")
      .select("*", { count: "exact" })
      .eq("has_import_items", true)
      .order("order_created_at", { ascending: false });

    // Filtres
    if (data.orderStatus) q = q.eq("order_status", data.orderStatus);
    if (data.logisticsStatus) q = q.eq("logistics_status", data.logisticsStatus);
    if (data.paymentStatus) q = q.eq("payment_status", data.paymentStatus);
    if (data.hasRemaining === true) q = q.gt("amount_remaining", 0);
    if (data.hasRemaining === false) q = q.lte("amount_remaining", 0);
    if (data.dateFrom) q = q.gte("order_created_at", data.dateFrom);
    if (data.dateTo) q = q.lte("order_created_at", data.dateTo + "T23:59:59");

    if (data.q.trim()) {
      const term = `%${data.q.trim()}%`;
      q = q.or(`customer_name.ilike.${term},customer_phone.ilike.${term},order_id.ilike.${term},tracking_number.ilike.${term}`);
    }

    const { data: rows, error, count } = await q.range(from, to);
    if (error) throw new Error(error.message);

    return {
      rows: (rows ?? []) as unknown as LogisticsOrderRow[],
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

/**
 * Crée automatiquement l'évaluation logistique pour une commande
 * si elle n'existe pas encore. Appelé quand l'admin clique "Peser".
 */
export const getOrCreateShipmentAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "orders");

    const { data: result, error } = await supabaseAdmin.rpc(
      "get_or_create_shipment_assessment" as never,
      { _order_id: data.order_id } as never,
    );

    if (error) throw new Error(error.message);

    logAdminAction({
      action: "shipment.assessment_created",
      targetType: "order",
      targetId: data.order_id,
      newValues: { assessment_id: result },
    });

    return { assessment_id: result as string };
  });

/* ── 2. CONFIRMER PAIEMENT ── */

const ConfirmPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  amountConfirmed: z.number().min(0),
  notes: z.string().max(500).optional(),
});

export const confirmShipmentPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConfirmPaymentSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "orders");

    // Lire l'ancien état pour audit
    const { data: before } = await supabaseAdmin
      .from("shipment_payments")
      .select("*")
      .eq("id", data.paymentId)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from("shipment_payments")
      .update({
        amount_paid: data.amountConfirmed,
        payment_status: data.amountConfirmed >= (before?.amount_requested ?? 0) ? "confirmed" : "partial",
        confirmed_by: context.userId,
        confirmed_at: new Date().toISOString(),
        notes: data.notes ?? before?.notes,
      })
      .eq("id", data.paymentId);

    if (error) throw new Error(error.message);

    logAdminAction({
      action: "shipment.payment_confirm",
      targetType: "shipment_payment",
      targetId: data.paymentId,
      oldValues: { payment_status: before?.payment_status, amount_paid: before?.amount_paid },
      newValues: { payment_status: "confirmed", amount_paid: data.amountConfirmed },
    });

    return { ok: true };
  });

/* ── 3. METTRE À JOUR TRACKING ── */

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

    const { error } = await supabaseAdmin
      .from("shipment_tracking")
      .update(update)
      .eq("order_shipment_assessment_id", data.assessmentId);

    if (error) throw new Error(error.message);

    logAdminAction({
      action: "shipment.tracking_update",
      targetType: "shipment_tracking",
      targetId: data.assessmentId,
      newValues: update,
    });

    return { ok: true };
  });

/* ── 4. COLONNES PERSONNALISÉES ── */

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
  .inputValidator((input) => z.object({
    columnId: z.string().uuid(),
    assessmentId: z.string().uuid(),
    value: z.union([z.string().nullable(), z.number(), z.boolean()]),
  }).parse(input))
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
      case "number": insert.value_number = Number(data.value); break;
      case "date": insert.value_date = data.value ? new Date(data.value as string).toISOString() : null; break;
      case "boolean": insert.value_boolean = Boolean(data.value); break;
      default: insert.value_text = String(data.value ?? ""); break;
    }

    const { error } = await supabaseAdmin
      .from("shipment_custom_values")
      .upsert(insert, { onConflict: "column_id, order_shipment_assessment_id" });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ── 5. STATS RAPIDES ── */

export const getLogisticsStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPermission(context.userId, "orders");

    const { data, error } = await supabaseAdmin.rpc("get_logistics_stats" as never, {} as never);
    if (error) throw new Error(error.message);

    return data as {
      to_weigh: number;
      awaiting_payment: number;
      partial_payment: number;
      to_ship: number;
      shipped: number;
      total_remaining: number;
    };
  });
