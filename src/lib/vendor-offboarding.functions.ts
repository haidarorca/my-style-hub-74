import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Schema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(200),
});

export const removeVendorAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Schema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    // Fetch the user's email from auth to ensure it matches
    const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userErr || !userData?.user) throw new Error("Utilisateur introuvable");
    const userEmail = userData.user.email ?? "";
    if (userEmail.toLowerCase() !== data.email.trim().toLowerCase()) {
      throw new Error("Email incorrect");
    }

    // Verify password by attempting sign-in with a temporary client
    const url = process.env.SUPABASE_URL!;
    const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const tmp = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: signErr } = await tmp.auth.signInWithPassword({ email: userEmail, password: data.password });
    if (signErr) throw new Error("Mot de passe incorrect");

    // Remove vendeur role
    const { error: delErr } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "vendeur");
    if (delErr) throw new Error(delErr.message);

    // Ensure user keeps an acheteur role
    const { data: remaining } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId);
    const hasAcheteur = (remaining ?? []).some((r) => r.role === "acheteur");
    if (!hasAcheteur) {
      await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "acheteur" });
    }

    // Reset vendor-specific profile fields and unverify
    await supabaseAdmin.from("profiles").update({
      is_verified: false,
      shop_name: null,
      shop_description: null,
      shop_logo_url: null,
      shop_banner_url: null,
      shop_whatsapp: null,
      shop_hours: null,
      shop_hours_schedule: null,
      ships_internationally: false,
      allowed_destination_country_ids: [],
    }).eq("id", userId);

    return { ok: true };
  });
