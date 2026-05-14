import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CreateVendorSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(100),
  full_name: z.string().min(1).max(120),
  shop_name: z.string().min(1).max(120),
  phone: z.string().min(3).max(40).optional().nullable(),
});

export const createVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateVendorSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Verify caller is admin
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Accès refusé : admin requis");

    // Create user (auto-confirm so vendor can log in immediately)
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Création échouée");

    const userId = created.user.id;

    // Profile may have been created by the new-user trigger; upsert shop info
    await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email: data.email,
      full_name: data.full_name,
      shop_name: data.shop_name,
      phone: data.phone ?? null,
    });

    // Replace default 'acheteur' role with 'vendeur'
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "vendeur" });
    if (roleErr) throw new Error(roleErr.message);

    return { ok: true, user_id: userId };
  });

const DeleteVendorSchema = z.object({ user_id: z.string().uuid() });

export const deleteVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteVendorSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles").select("role")
      .eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Accès refusé");

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
