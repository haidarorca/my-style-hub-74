import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Schema = z.object({
  order_id: z.string().uuid(),
  address: z.string().trim().min(3).max(500),
  city: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  customer_name: z.string().trim().max(160).optional().nullable(),
  /** Pays de destination exact — corrigeable par l'admin. */
  destination_country_id: z.string().uuid().optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
});

/** Correction de l'adresse de livraison d'une commande par un administrateur (journalisée). */
export const updateOrderAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Schema.parse(i))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("./admin-auth.core");
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before, error: e1 } = await supabaseAdmin
      .from("orders")
      .select("address, city, customer_phone, customer_name, destination_country_id, note")
      .eq("id", data.order_id)
      .maybeSingle();
    if (e1 || !before) throw new Error("Commande introuvable");

    const patch: Record<string, unknown> = { address: data.address, city: data.city ?? null };
    if (data.phone) patch.customer_phone = data.phone;
    if (data.customer_name) patch.customer_name = data.customer_name;
    if (data.note !== undefined) patch.note = data.note ?? null;
    if (data.destination_country_id !== undefined) {
      patch.destination_country_id = data.destination_country_id ?? null;
    }

    const { error } = await supabaseAdmin.from("orders").update(patch as any).eq("id", data.order_id);
    if (error) throw new Error("Modification refusée : " + error.message);

    // Nom lisible des pays pour la ligne d'audit.
    const countryIds = [before.destination_country_id, data.destination_country_id].filter(Boolean) as string[];
    const countryNames = new Map<string, string>();
    if (countryIds.length > 0) {
      const { data: cs } = await (supabaseAdmin as any)
        .from("countries").select("id, name").in("id", countryIds);
      for (const c of cs ?? []) countryNames.set(c.id, c.name);
    }
    const countryLabel = (id: string | null | undefined) =>
      id ? countryNames.get(id) ?? "Pays inconnu" : "Pays non renseigné";

    const email = (context as any).claims?.email ?? "Admin";
    const fmt = (a: any, c: any, p: any, n: any, ctry: any) =>
      [n, a, c, countryLabel(ctry), p].filter(Boolean).join(", ") || "—";

    await (supabaseAdmin as any).from("payment_audit").insert({
      order_id: data.order_id,
      action: "Adresse modifiée",
      admin_name: email,
      admin_id: context.userId,
      details:
        `${fmt(before.address, before.city, before.customer_phone, before.customer_name, before.destination_country_id)}` +
        ` → ` +
        `${fmt(data.address, data.city, data.phone || before.customer_phone, data.customer_name || before.customer_name, data.destination_country_id ?? before.destination_country_id)}`,
    });
    return { ok: true };
  });
