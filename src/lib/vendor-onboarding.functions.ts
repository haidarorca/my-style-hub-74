import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { notifyNewVendorSignup } from "@/lib/notifications.functions";

const BecomeVendorSchema = z.object({
  shop_name: z.string().trim().min(1).max(120),
  full_name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(3).max(40),
  shop_whatsapp: z.string().trim().max(40).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  shop_description: z.string().trim().max(500).optional().nullable(),
  shop_hours: z.string().trim().max(200).optional().nullable(),
  shop_hours_schedule: z.any().optional().nullable(),
  shop_logo_url: z.string().url().max(1000).optional().nullable(),
  shop_banner_url: z.string().url().max(1000).optional().nullable(),
  source_country_id: z.string().uuid(),
  ships_internationally: z.boolean(),
  allowed_destination_country_ids: z.array(z.string().uuid()).max(300),
  vendor_mode: z.enum(["commission", "no_commission"]).default("no_commission"),
});

export const becomeVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => BecomeVendorSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    const allowed = data.ships_internationally ? data.allowed_destination_country_ids : [];

    const { error: upErr } = await supabaseAdmin.from("profiles").update({
      shop_name: data.shop_name,
      full_name: data.full_name,
      phone: data.phone,
      shop_whatsapp: data.shop_whatsapp ?? null,
      address: data.address ?? null,
      shop_description: data.shop_description ?? null,
      shop_hours: data.shop_hours ?? null,
      shop_hours_schedule: data.shop_hours_schedule ?? null,
      shop_logo_url: data.shop_logo_url ?? null,
      shop_banner_url: data.shop_banner_url ?? null,
      source_country_id: data.source_country_id,
      ships_internationally: data.ships_internationally,
      allowed_destination_country_ids: allowed,
      vendor_mode: data.vendor_mode,
    }).eq("id", userId);
    if (upErr) throw new Error(upErr.message);

    // Replace existing roles with vendeur (preserve admin if present)
    const { data: existing } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId);
    const hasVendor = (existing ?? []).some((r) => r.role === "vendeur");
    if (!hasVendor) {
      // Remove default acheteur role if present, then add vendeur
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", "acheteur");
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles").insert({ user_id: userId, role: "vendeur" });
      if (roleErr) throw new Error(roleErr.message);

      // NOTIFIER les super admins qu'un nouveau vendeur s'est inscrit
      try {
        await notifyNewVendorSignup(userId, data.shop_name);
      } catch (notifyError) {
        console.error("[vendor-onboarding] notification admin echouee", { userId, error: notifyError });
      }
    }

    return { ok: true };
  });
