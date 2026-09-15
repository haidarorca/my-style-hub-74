import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Gestion des administrateurs & de leurs permissions.
 * Toutes ces opérations sont réservées au super administrateur et vérifiées
 * côté serveur (impossible de contourner par appel direct de l'API).
 * Un administrateur ne peut jamais modifier ses propres droits.
 */

const PermSchema = z.string().min(2).max(60);

async function guard(userId: string, targetUserId?: string) {
  const { assertSuperAdmin } = await import("@/lib/admin-auth.core");
  await assertSuperAdmin(userId);
  if (targetUserId && targetUserId === userId) {
    throw new Error(
      "Vous ne pouvez pas modifier vos propres droits d'administrateur.",
    );
  }
}

async function assertTargetNotSuperAdmin(targetUserId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", targetUserId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (data) {
    throw new Error("Un super administrateur ne peut pas être modifié ici.");
  }
}

/** Remplace l'ensemble des permissions d'un administrateur. */
export const setAdminPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        user_id: z.string().uuid(),
        permissions: z.array(PermSchema).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await guard(context.userId, data.user_id);
    await assertTargetNotSuperAdmin(data.user_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAdminActionSync } = await import("@/lib/admin-auth.core");

    const unique = Array.from(new Set(data.permissions));

    const { error: delErr } = await supabaseAdmin
      .from("admin_permissions")
      .delete()
      .eq("user_id", data.user_id);
    if (delErr) throw new Error(delErr.message);

    if (unique.length > 0) {
      const { error } = await supabaseAdmin.from("admin_permissions").insert(
        unique.map((permission) => ({
          user_id: data.user_id,
          permission: permission as never,
          granted_by: context.userId,
        })),
      );
      if (error) throw new Error(error.message);
    }

    await logAdminActionSync({
      action: "admin.permissions.set",
      targetType: "user",
      targetId: data.user_id,
      details: { permissions: unique },
    });
    return { ok: true, permissions: unique };
  });

/** Promeut un utilisateur existant au rôle administrateur. */
export const promoteToAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ email: z.string().email() }).parse(input))
  .handler(async ({ data, context }) => {
    await guard(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAdminActionSync } = await import("@/lib/admin-auth.core");

    const email = data.email.trim().toLowerCase();
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!prof) throw new Error("Aucun utilisateur trouvé avec cet email.");

    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: prof.id, role: "admin" }, { onConflict: "user_id,role" });
    if (error) throw new Error(error.message);

    await logAdminActionSync({
      action: "admin.create",
      targetType: "user",
      targetId: prof.id,
      details: { email },
    });
    return { ok: true, user_id: prof.id };
  });

/** Suspend ou réactive un administrateur. */
export const setAdminSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid(), suspended: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await guard(context.userId, data.user_id);
    await assertTargetNotSuperAdmin(data.user_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAdminActionSync } = await import("@/lib/admin-auth.core");

    const { error } = await supabaseAdmin
      .from("user_roles")
      .update({ is_suspended: data.suspended })
      .eq("user_id", data.user_id)
      .eq("role", "admin");
    if (error) throw new Error(error.message);

    await logAdminActionSync({
      action: data.suspended ? "admin.suspend" : "admin.unsuspend",
      targetType: "user",
      targetId: data.user_id,
    });
    return { ok: true };
  });

/** Retire complètement le rôle admin (le compte redevient un compte client). */
export const revokeAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await guard(context.userId, data.user_id);
    await assertTargetNotSuperAdmin(data.user_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAdminActionSync } = await import("@/lib/admin-auth.core");

    await supabaseAdmin.from("admin_permissions").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", "admin");
    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.user_id, role: "acheteur" }, { onConflict: "user_id,role" });

    await logAdminActionSync({
      action: "admin.remove",
      targetType: "user",
      targetId: data.user_id,
    });
    return { ok: true };
  });
