import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runTranslationSync, type Report } from "./sync-translations.core.server";
import { sendInngestEvent } from "./inngest/client";

/**
 * Manual sync trigger. Now lightweight: enqueues an Inngest job
 * and returns immediately. Set `wait=true` to run synchronously
 * (admin "Synchroniser maintenant" button can offer either).
 */
export const syncTranslations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Report> => {
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "super_admin"]);
    if (!roleRows || roleRows.length === 0) throw new Error("Accès refusé : admin requis");

    // Default: run synchronously so the admin sees the report.
    // For background mode, send Inngest event instead.
    return await runTranslationSync();
  });

/** Fire-and-forget background trigger (no waiting on report). */
export const enqueueTranslationSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "super_admin"]);
    if (!roleRows || roleRows.length === 0) throw new Error("Accès refusé : admin requis");
    await sendInngestEvent({ name: "translation/sync.requested", data: {} });
    return { ok: true, enqueued: true };
  });
