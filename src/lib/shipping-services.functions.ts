import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertPermission } from "./admin-auth.core";

export interface ShippingService {
  id: string;
  name: string;
  source_country_id: string | null;
  destination_country_id: string | null;
  price_per_kg: number;
  pricing_unit: "kg" | "m3";
  delay_min_days: number | null;
  delay_max_days: number | null;
  description: string | null;
  is_enabled: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}


// PUBLIC list (used at checkout). Filter on route if provided.
export const listShippingServices = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        source_country_id: z.string().uuid().nullable().default(null),
        destination_country_id: z.string().uuid().nullable().default(null),
        only_enabled: z.boolean().default(true),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    let q = (supabaseAdmin as any)
      .from("shipping_services")
      .select("*")
      .order("position", { ascending: true })
      .order("name", { ascending: true });
    if (data.only_enabled) q = q.eq("is_enabled", true);
    if (data.source_country_id) {
      q = q.or(`source_country_id.is.null,source_country_id.eq.${data.source_country_id}`);
    }
    if (data.destination_country_id) {
      q = q.or(
        `destination_country_id.is.null,destination_country_id.eq.${data.destination_country_id}`,
      );
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows as ShippingService[];
  });

const UpsertSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(120),
  source_country_id: z.string().uuid().nullable(),
  destination_country_id: z.string().uuid().nullable(),
  price_per_kg: z.number().min(0).max(10_000_000),
  pricing_unit: z.enum(["kg", "m3"]).default("kg"),
  delay_min_days: z.number().int().min(0).max(365).nullable(),
  delay_max_days: z.number().int().min(0).max(365).nullable(),
  description: z.string().max(500).nullable(),
  is_enabled: z.boolean().default(true),
  position: z.number().int().min(0).max(9999).default(0),
});

export const upsertShippingService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "orders");
    const { id, ...patch } = data;
    if (id) {
      const { data: row, error } = await (supabaseAdmin as any)
        .from("shipping_services")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return row as ShippingService;
    }
    const { data: row, error } = await (supabaseAdmin as any)
      .from("shipping_services")
      .insert(patch)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as ShippingService;
  });

export const deleteShippingService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "orders");
    const { error } = await (supabaseAdmin as any)
      .from("shipping_services")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// PUBLIC list of enabled services (used by the cockpit weighing form
// to let the operator assign a shipping service when none has been
// chosen at checkout). Returns enriched display fields : délai estimé,
// pays de départ, drapeau — pour que l'opérateur distingue Avion /
// Maritime / Express d'un coup d'œil.
export const listEnabledShippingServices = createServerFn({ method: "GET" })
  .handler(async () => {
    // Pas de FK déclarée entre shipping_services.source_country_id et
    // countries.id — on évite tout embed PostgREST (qui échouerait) et on
    // résout les pays en deux temps.
    const { data, error } = await (supabaseAdmin as any)
      .from("shipping_services")
      .select(
        "id, name, price_per_kg, pricing_unit, description, position, delay_min_days, delay_max_days, source_country_id",
      )
      .eq("is_enabled", true)
      .order("position", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const countryIds = Array.from(
      new Set(rows.map((r: any) => r.source_country_id).filter(Boolean)),
    );
    const countryMap = new Map<string, { name: string | null; flag: string | null }>();
    if (countryIds.length > 0) {
      const { data: countries } = await (supabaseAdmin as any)
        .from("countries")
        .select("id, name, flag_emoji")
        .in("id", countryIds);
      for (const c of countries ?? []) {
        countryMap.set(c.id, { name: c.name ?? null, flag: c.flag_emoji ?? null });
      }
    }
    return rows.map((s: any) => {
      const c = s.source_country_id ? countryMap.get(s.source_country_id) : null;
      return {
        id: s.id as string,
        name: s.name as string,
        price_per_kg: Number(s.price_per_kg),
        pricing_unit: (s.pricing_unit ?? "kg") as "kg" | "m3",
        description: (s.description ?? null) as string | null,
        position: Number(s.position ?? 0),
        delay_min_days: (s.delay_min_days ?? null) as number | null,
        delay_max_days: (s.delay_max_days ?? null) as number | null,
        source_country_id: (s.source_country_id ?? null) as string | null,
        source_country_name: c?.name ?? null,
        source_country_flag: c?.flag ?? null,
      };
    });
  });

// ADMIN: assign / change the shipping service of an order from the cockpit.
// Also propagates the new tariff snapshot on the related shipment assessment
// (so the weighing reads the right rate immediately).
export const assignOrderShippingService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        order_id: z.string().uuid(),
        shipping_service_id: z.string().uuid(),
        /** Si fourni, met à jour CETTE évaluation précise (sous-commande
         *  d'une commande multi-buckets) au lieu de l'unique évaluation. */
        assessment_id: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "orders");

    // 1) Verify the service exists & is enabled.
    const { data: svc, error: svcErr } = await (supabaseAdmin as any)
      .from("shipping_services")
      .select("id, price_per_kg, is_enabled")
      .eq("id", data.shipping_service_id)
      .maybeSingle();
    if (svcErr) throw new Error(svcErr.message);
    if (!svc) throw new Error("Service d'expédition introuvable");
    if (!svc.is_enabled) throw new Error("Service d'expédition désactivé");

    // 2) Update the order header (kept for backward compat / single-bucket
    //    orders). Le drawer privilégie l'évaluation, donc ce champ reste
    //    informatif sur les commandes multi-buckets.
    const { error: ordErr } = await (supabaseAdmin as any)
      .from("orders")
      .update({ shipping_service_id: data.shipping_service_id })
      .eq("id", data.order_id);
    if (ordErr) throw new Error(ordErr.message);

    // 3) Update the targeted assessment snapshot.
    if (data.assessment_id) {
      await (supabaseAdmin as any)
        .from("order_shipment_assessments")
        .update({
          shipping_service_id: data.shipping_service_id,
          price_per_kg_snapshot: Number(svc.price_per_kg),
        })
        .eq("id", data.assessment_id);
    } else {
      // Fallback : commande à un seul bucket — on met à jour l'unique
      // évaluation rattachée.
      const { data: assessList } = await (supabaseAdmin as any)
        .from("order_shipment_assessments")
        .select("id")
        .eq("order_id", data.order_id);
      if (Array.isArray(assessList) && assessList.length === 1) {
        await (supabaseAdmin as any)
          .from("order_shipment_assessments")
          .update({
            shipping_service_id: data.shipping_service_id,
            price_per_kg_snapshot: Number(svc.price_per_kg),
          })
          .eq("id", assessList[0].id);
      }
    }

    return { ok: true, price_per_kg: Number(svc.price_per_kg) };
  });
