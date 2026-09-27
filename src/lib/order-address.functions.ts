import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Schema = z.object({
  order_id: z.string().uuid(),
  address: z.string().trim().min(3).max(500),
  city: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
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
      .from("orders").select("address, city, customer_phone").eq("id", data.order_id).maybeSingle();
    if (e1 || !before) throw new Error("Commande introuvable");
    const patch: Record<string, unknown> = { address: data.address, city: data.city ?? null };
    if (data.phone) patch.customer_phone = data.phone;
    const { error } = await supabaseAdmin.from("orders").update(patch as any).eq("id", data.order_id);
    if (error) throw new Error("Modification refusée : " + error.message);
    const email = (context as any).claims?.email ?? "Admin";
    const fmt = (a: any, c: any, p: any) => [a, c, p].filter(Boolean).join(", ") || "—";
    await (supabaseAdmin as any).from("payment_audit").insert({
      order_id: data.order_id,
      action: "Adresse modifiée",
      admin_name: email,
      admin_id: context.userId,
      details: `${fmt(before.address, before.city, before.customer_phone)} → ${fmt(data.address, data.city, data.phone || before.customer_phone)}`,
    });
    return { ok: true };
  });
