import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { notifyVendorStatusChange } from "@/lib/notifications.functions";

type ProfilePatch = Partial<{
  vendor_status: "active" | "pending" | "suspended" | "expired" | "blocked";
  access_starts_at: string | null;
  access_ends_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  blocked_at: string | null;
  blocked_reason: string | null;
  is_verified: boolean;
}>;

async function assertAdmin(supabase: { from: (t: string) => { select: (c: string) => { eq: (col: string, val: string) => { eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: unknown }> } } } } }, userId: string) {
  const { data } = await supabase
    .from("user_roles").select("role")
    .eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Accès refusé : admin requis");
}

const StatusSchema = z.object({
  user_id: z.string().uuid(),
  status: z.enum(["active", "pending", "suspended", "expired", "blocked"]),
  reason: z.string().max(500).optional().nullable(),
});

export const setVendorStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => StatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const patch: ProfilePatch = { vendor_status: data.status };
    const now = new Date().toISOString();
    if (data.status === "suspended") {
      patch.suspended_at = now;
      patch.suspended_reason = data.reason ?? null;
    } else if (data.status === "blocked") {
      patch.blocked_at = now;
      patch.blocked_reason = data.reason ?? null;
    } else if (data.status === "active") {
      patch.suspended_at = null;
      patch.suspended_reason = null;
      patch.blocked_at = null;
      patch.blocked_reason = null;
      patch.is_verified = true;
      patch.access_starts_at = now;
    }
    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.user_id);
    if (error) throw new Error(error.message);

    // NOTIFIER le vendeur du changement de statut
    if (data.status === "active" || data.status === "suspended" || data.status === "blocked") {
      try {
        const notifStatus = data.status === "active" ? "approved" : data.status === "blocked" ? "rejected" : "suspended";
        await notifyVendorStatusChange(data.user_id, notifStatus);
      } catch (notifyError) {
        console.error("[admin-vendor-status] notification vendeur echouee", { userId: data.user_id, status: data.status, error: notifyError });
      }
    }

    return { ok: true };
  });

const AccessSchema = z.object({
  user_id: z.string().uuid(),
  access_starts_at: z.string().datetime().nullable().optional(),
  access_ends_at: z.string().datetime().nullable(),
});

export const setVendorAccessWindow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => AccessSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const patch: ProfilePatch = { access_ends_at: data.access_ends_at };
    if (data.access_starts_at !== undefined) patch.access_starts_at = data.access_starts_at;

    if (data.access_ends_at === null || new Date(data.access_ends_at) > new Date()) {
      const { data: prof } = await supabaseAdmin
        .from("profiles").select("vendor_status").eq("id", data.user_id).maybeSingle();
      if (prof?.vendor_status === "expired") {
        patch.vendor_status = "active";
      }
    }

    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
