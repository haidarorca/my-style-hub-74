import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
    await assertAdmin(context.userId);
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
    await assertAdmin(context.userId);
    const { error } = await (supabaseAdmin as any)
      .from("shipping_services")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
