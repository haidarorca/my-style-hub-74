import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ShipmentAssessmentStatus =
  | "pending_arrival"
  | "awaiting_weighing"
  | "fees_calculated"
  | "awaiting_client_validation"
  | "validated"
  | "rejected"
  | "ready_to_ship"
  | "shipped";

export interface ShipmentAssessment {
  id: string;
  order_id: string;
  status: ShipmentAssessmentStatus;
  real_weight_kg: number | null;
  volumetric_weight_kg: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  air_freight_fee: number | null;
  service_fee: number | null;
  extra_fees: number | null;
  total_fees: number | null;
  admin_comment: string | null;
  parcel_photo_url: string | null;
  client_validated_at: string | null;
  client_rejected_at: string | null;
  client_response_note: string | null;
  shipping_service_id: string | null;
  price_per_kg_snapshot: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"])
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("Accès refusé : admin requis");
}

// ---------- Admin: list assessments ----------
export const listShipmentAssessments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        status: z.string().nullable().default(null),
        q: z.string().max(200).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    let q = (supabaseAdmin as any)
      .from("order_shipment_assessments")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(200);

    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r: any) => r.order_id);
    let orders: any[] = [];
    if (ids.length) {
      const { data: o } = await supabaseAdmin
        .from("orders")
        .select("id, customer_name, customer_phone, total, status, created_at, destination_country_id")
        .in("id", ids);
      orders = o ?? [];
      if (data.q.trim()) {
        const term = data.q.trim().toLowerCase();
        orders = orders.filter(
          (o) =>
            (o.customer_name ?? "").toLowerCase().includes(term) ||
            (o.customer_phone ?? "").toLowerCase().includes(term) ||
            o.id.toLowerCase().includes(term),
        );
      }
    }
    const orderMap = new Map(orders.map((o) => [o.id, o]));
    const filtered = (rows ?? []).filter((r: any) => orderMap.has(r.order_id));
    return {
      assessments: filtered as ShipmentAssessment[],
      orders: Object.fromEntries(orderMap),
    };
  });

// ---------- Admin: get or create assessment for one order ----------
export const getOrCreateShipmentAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: existing } = await (supabaseAdmin as any)
      .from("order_shipment_assessments")
      .select("*")
      .eq("order_id", data.order_id)
      .maybeSingle();
    if (existing) return existing as ShipmentAssessment;

    const { data: created, error } = await (supabaseAdmin as any)
      .from("order_shipment_assessments")
      .insert({ order_id: data.order_id, created_by: context.userId, status: "awaiting_weighing" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return created as ShipmentAssessment;
  });

// ---------- Admin: update assessment (fees, weight, photo, etc.) ----------
const UpdateSchema = z.object({
  id: z.string().uuid(),
  real_weight_kg: z.number().nullable().optional(),
  volumetric_weight_kg: z.number().nullable().optional(),
  length_cm: z.number().nullable().optional(),
  width_cm: z.number().nullable().optional(),
  height_cm: z.number().nullable().optional(),
  air_freight_fee: z.number().min(0).nullable().optional(),
  service_fee: z.number().min(0).nullable().optional(),
  extra_fees: z.number().min(0).nullable().optional(),
  admin_comment: z.string().max(2000).nullable().optional(),
  parcel_photo_url: z.string().url().nullable().optional(),
  shipping_service_id: z.string().uuid().nullable().optional(),
  price_per_kg_snapshot: z.number().min(0).nullable().optional(),
  status: z
    .enum([
      "pending_arrival",
      "awaiting_weighing",
      "fees_calculated",
      "awaiting_client_validation",
      "ready_to_ship",
      "shipped",
    ])
    .optional(),
});

export const updateShipmentAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { id, ...patch } = data;
    const { data: row, error } = await (supabaseAdmin as any)
      .from("order_shipment_assessments")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as ShipmentAssessment;
  });

// ---------- Admin: send to client for validation ----------
export const sendShipmentForValidation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row, error } = await (supabaseAdmin as any)
      .from("order_shipment_assessments")
      .update({ status: "awaiting_client_validation" })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as ShipmentAssessment;
  });

// ---------- Client: get own assessment ----------
export const getMyShipmentAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Verify the order belongs to the user
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, buyer_id, customer_name, total")
      .eq("id", data.order_id)
      .maybeSingle();
    if (!order) throw new Error("Commande introuvable");
    if (order.buyer_id !== context.userId) throw new Error("Accès refusé");

    const { data: assessment } = await (supabaseAdmin as any)
      .from("order_shipment_assessments")
      .select("*")
      .eq("order_id", data.order_id)
      .maybeSingle();
    return { order, assessment: (assessment ?? null) as ShipmentAssessment | null };
  });

// ---------- Client: validate or reject ----------
export const respondToShipmentAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        order_id: z.string().uuid(),
        decision: z.enum(["validated", "rejected"]),
        note: z.string().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, buyer_id")
      .eq("id", data.order_id)
      .maybeSingle();
    if (!order || order.buyer_id !== context.userId) throw new Error("Accès refusé");

    const patch: Record<string, unknown> = {
      status: data.decision,
      client_response_note: data.note ?? null,
    };
    if (data.decision === "validated") patch.client_validated_at = new Date().toISOString();
    else patch.client_rejected_at = new Date().toISOString();

    const { data: row, error } = await (supabaseAdmin as any)
      .from("order_shipment_assessments")
      .update(patch)
      .eq("order_id", data.order_id)
      .eq("status", "awaiting_client_validation")
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as ShipmentAssessment;
  });
