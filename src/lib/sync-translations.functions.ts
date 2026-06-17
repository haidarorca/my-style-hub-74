import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runTranslationSync, type Report, type Scope } from "./sync-translations.core.server";
import { sendInngestEvent } from "./inngest/client";

const scopeSchema = z
  .object({
    scope: z.enum(["all", "products", "categories", "countries", "shops", "banners", "settings"]).default("all"),
  })
  .optional()
  .default({ scope: "all" });

/**
 * Manual sync trigger. Runs synchronously so the admin sees the full
 * report (per-bucket counts, remaining backlog, error samples).
 * Pass a scope to run a partial sync; default "all" syncs everything.
 */
export const syncTranslations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => scopeSchema.parse(input))
  .handler(async ({ context, data }): Promise<Report> => {
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "super_admin"]);
    if (!roleRows || roleRows.length === 0) throw new Error("Accès refusé : admin requis");
    return await runTranslationSync((data?.scope ?? "all") as Scope);
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
