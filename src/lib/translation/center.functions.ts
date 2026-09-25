import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TRANSLATION_LANG_CODES, TRANSLATION_SCOPE_IDS } from "./langs";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const ok = ((data ?? []) as Array<{ role: string }>).some((r) => r.role === "admin" || r.role === "super_admin");
  if (!ok) throw new Error("Accès refusé : administrateur requis");
}

const langsSchema = z.array(z.enum(TRANSLATION_LANG_CODES as [string, ...string[]])).min(1);
const scopesSchema = z.array(z.enum(TRANSLATION_SCOPE_IDS as [string, ...string[]])).min(1);

export const previewTranslation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ langs: langsSchema }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { getPreview } = await import("./center.server");
    return await getPreview(data.langs);
  });

export const startTranslation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ langs: langsSchema, scopes: scopesSchema }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getPreview, emptyBucket } = await import("./center.server");
    const db = supabaseAdmin as any;
    const { count } = await db.from("translation_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "running", "paused"]);
    if (count) throw new Error("Une traduction est déjà en cours ou en pause. Reprenez-la ou annulez-la d'abord.");
    const prev = await getPreview(data.langs);
    const stats: Record<string, unknown> = {};
    for (const s of data.scopes) {
      const p = (prev as any)[s] ?? { pending: 0, total: 0 };
      stats[s] = emptyBucket(p.total, p.pending);
    }
    const { data: job, error } = await db.from("translation_jobs")
      .insert({ langs: data.langs, scopes: data.scopes, stats, created_by: context.userId, status: "queued" })
      .select("id").single();
    if (error) throw new Error(error.message);
    await db.rpc("translation_arm_worker");
    return { id: job.id as string };
  });

export const controlTranslation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), action: z.enum(["pause", "resume", "cancel"]) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const now = new Date().toISOString();
    if (data.action === "pause") {
      await db.from("translation_jobs").update({ status: "paused", pause_reason: "Mise en pause par l'administrateur", updated_at: now }).eq("id", data.id).in("status", ["queued", "running"]);
    } else if (data.action === "resume") {
      await db.from("translation_jobs").update({ status: "queued", pause_reason: null, lease_until: null, updated_at: now }).eq("id", data.id).in("status", ["paused", "error"]);
      await db.rpc("translation_arm_worker");
    } else {
      await db.from("translation_jobs").update({ status: "cancelled", finished_at: now, updated_at: now, lease_until: null }).eq("id", data.id).in("status", ["queued", "running", "paused"]);
    }
    return { ok: true };
  });

export const getTranslationJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data } = await context.supabase.from("translation_jobs" as any)
      .select("id, status, langs, scopes, current_scope, stats, pause_reason, last_error, created_at, started_at, finished_at, updated_at")
      .order("created_at", { ascending: false }).limit(5);
    return (data ?? []) as any[];
  });
