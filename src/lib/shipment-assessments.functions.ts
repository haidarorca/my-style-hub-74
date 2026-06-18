import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertPermission } from "./admin-auth.core";

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
    await assertPermission(context.userId, "orders");

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
// Pré-remplissage : si tous les items ont un poids déclaré + dimensions,
// on initialise l'évaluation au statut "fees_calculated" avec les valeurs
// déclarées. L'agent passe alors en mode VÉRIFICATION (et non pesée).
// Sinon (poids inconnu pour au moins un item), statut "awaiting_weighing".
export const getOrCreateShipmentAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "orders");

    const { data: existing } = await (supabaseAdmin as any)
      .from("order_shipment_assessments")
      .select("*")
      .eq("order_id", data.order_id)
      .maybeSingle();
    if (existing) return existing as ShipmentAssessment;

    // Pre-fill shipping_service_id from the order (chosen at checkout)
    const { data: order } = await (supabaseAdmin as any)
      .from("orders")
      .select("shipping_service_id")
      .eq("id", data.order_id)
      .maybeSingle();
    let svcPrice: number | null = null;
    if (order?.shipping_service_id) {
      const { data: svc } = await (supabaseAdmin as any)
        .from("shipping_services")
        .select("price_per_kg")
        .eq("id", order.shipping_service_id)
        .maybeSingle();
      if (svc?.price_per_kg != null) svcPrice = Number(svc.price_per_kg);
    }

    // Pré-remplissage à partir des poids/dimensions déclarés par les vendeurs.
    let declaredRealKg = 0;
    let declaredVolKg = 0;
    let allHaveDeclaredWeight = false;
    let maxL = 0, maxW = 0, maxH = 0;
    try {
      const { data: items } = await (supabaseAdmin as any)
        .from("order_items")
        .select("product_id, quantity")
        .eq("order_id", data.order_id);
      const itemList = (items ?? []) as Array<{ product_id: string; quantity: number }>;
      if (itemList.length > 0) {
        const productIds = Array.from(new Set(itemList.map((i) => i.product_id).filter(Boolean)));
        const { data: products } = await (supabaseAdmin as any)
          .from("products")
          .select("id, weight_kg, length_cm, width_cm, height_cm")
          .in("id", productIds);
        const pMap = new Map<string, any>((products ?? []).map((p: any) => [p.id, p]));
        allHaveDeclaredWeight = itemList.every((it) => {
          const p = pMap.get(it.product_id);
          return p && Number(p.weight_kg ?? 0) > 0;
        });
        if (allHaveDeclaredWeight) {
          for (const it of itemList) {
            const p = pMap.get(it.product_id) ?? {};
            const qty = Number(it.quantity ?? 1);
            const real = Number(p.weight_kg ?? 0);
            const l = Number(p.length_cm ?? 0);
            const w = Number(p.width_cm ?? 0);
            const h = Number(p.height_cm ?? 0);
            const vol = l > 0 && w > 0 && h > 0 ? (l * w * h) / 5000 : 0;
            declaredRealKg += real * qty;
            declaredVolKg += vol * qty;
            if (l > maxL) maxL = l;
            if (w > maxW) maxW = w;
            if (h > maxH) maxH = h;
          }
        }
      }
    } catch { /* on retombe sur le mode "pesée" classique */ }

    const useDeclared = allHaveDeclaredWeight && declaredRealKg > 0;
    const chargeable = useDeclared ? Math.max(declaredRealKg, declaredVolKg) : 0;
    const airFreightFee = useDeclared && svcPrice != null
      ? Math.round(chargeable * svcPrice)
      : null;

    const insertPayload: Record<string, unknown> = {
      order_id: data.order_id,
      created_by: context.userId,
      status: useDeclared ? "fees_calculated" : "awaiting_weighing",
      shipping_service_id: order?.shipping_service_id ?? null,
      price_per_kg_snapshot: svcPrice,
    };
    if (useDeclared) {
      insertPayload.real_weight_kg = Math.round(declaredRealKg * 1000) / 1000;
      insertPayload.volumetric_weight_kg = declaredVolKg > 0
        ? Math.round(declaredVolKg * 1000) / 1000
        : null;
      insertPayload.length_cm = maxL || null;
      insertPayload.width_cm = maxW || null;
      insertPayload.height_cm = maxH || null;
      insertPayload.air_freight_fee = airFreightFee;
      insertPayload.admin_comment = "Pré-rempli depuis les poids déclarés par les vendeurs — à vérifier à la réception.";
    }

    const { data: created, error } = await (supabaseAdmin as any)
      .from("order_shipment_assessments")
      .insert(insertPayload)
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

// ---------- Admin: vérifier le poids déclaré (Circuit B, court-circuit) ----------
// Reçoit une saisie article-par-article + facultatif des frais ajustés.
// Si l'écart total déclaré/réel ≤ tolérance, passe directement à ready_to_ship.
// Sinon, reste sur fees_calculated (l'anomalie bloque l'expédition).
const VerifySchema = z.object({
  assessment_id: z.string().uuid(),
  items: z
    .array(
      z.object({
        order_item_id: z.string().optional(),
        product_id: z.string().optional(),
        declared_weight_kg: z.number().min(0).nullable().optional(),
        real_weight_kg: z.number().min(0),
        quantity: z.number().int().min(1).default(1),
      }),
    )
    .min(1),
  air_freight_fee: z.number().min(0).nullable().optional(),
  service_fee: z.number().min(0).nullable().optional(),
  admin_comment: z.string().max(2000).nullable().optional(),
});

export const verifyDeclaredWeight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => VerifySchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "orders");

    // Calcul agrégat
    const totalReal = data.items.reduce(
      (s, it) => s + Number(it.real_weight_kg) * Number(it.quantity ?? 1),
      0,
    );
    const totalDeclared = data.items.reduce(
      (s, it) => s + Number(it.declared_weight_kg ?? 0) * Number(it.quantity ?? 1),
      0,
    );

    // Tolérance : 10 % ou 0.5 kg.
    const tolerance = Math.max(0.5, totalDeclared * 0.10);
    const isAnomaly = totalDeclared > 0 && Math.abs(totalReal - totalDeclared) > tolerance;

    const patch: Record<string, unknown> = {
      real_weight_kg: Math.round(totalReal * 1000) / 1000,
      // On garde le statut sur fees_calculated tant qu'il y a une anomalie
      // pour bloquer l'expédition automatique.
      status: isAnomaly ? "fees_calculated" : "ready_to_ship",
    };
    if (data.air_freight_fee != null) patch.air_freight_fee = data.air_freight_fee;
    if (data.service_fee != null) patch.service_fee = data.service_fee;
    if (data.admin_comment) patch.admin_comment = data.admin_comment;

    const { data: row, error } = await (supabaseAdmin as any)
      .from("order_shipment_assessments")
      .update(patch)
      .eq("id", data.assessment_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { assessment: row as ShipmentAssessment, isAnomaly, totalReal, totalDeclared };
  });

export const updateShipmentAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "orders");
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
    await assertPermission(context.userId, "orders");
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

// ---------- Admin: validate manually (when payment received outside platform) ----------
export const adminValidateShipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        order_id: z.string().uuid(),
        note: z.string().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "orders");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, buyer_id")
      .eq("id", data.order_id)
      .maybeSingle();
    if (!order) throw new Error("Commande introuvable");

    const patch: Record<string, unknown> = {
      status: "validated",
      client_validated_at: new Date().toISOString(),
      client_response_note: data.note ? `[Admin] ${data.note}` : "Validé manuellement par l'admin",
    };

    const { data: row, error } = await (supabaseAdmin as any)
      .from("order_shipment_assessments")
      .update(patch)
      .eq("order_id", data.order_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as ShipmentAssessment;
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
