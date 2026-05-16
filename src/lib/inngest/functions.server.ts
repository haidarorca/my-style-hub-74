import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runTranslationSync } from "@/lib/sync-translations.core.server";
import { refreshAdminStatsCache } from "@/lib/admin-stats.core.server";

// 1) Translation sync — every 6h + on-demand event
export const translationSyncJob = inngest.createFunction(
  {
    id: "translation-sync",
    retries: 2,
    triggers: [{ cron: "0 */6 * * *" }, { event: "translation/sync.requested" }],
  },
  async ({ step }) => {
    return await step.run("run-sync", async () => runTranslationSync());
  },
);

// 2) Admin stats cache refresh — every 15 min + on-demand event
export const refreshStatsJob = inngest.createFunction(
  {
    id: "refresh-admin-stats",
    retries: 1,
    triggers: [{ cron: "*/15 * * * *" }, { event: "stats/refresh.requested" }],
  },
  async ({ step }) => {
    await step.run("refresh", async () => refreshAdminStatsCache());
    return { ok: true };
  },
);

// 3) Cleanup expired verification/reset codes — daily 03:00 UTC
export const cleanupExpiredCodesJob = inngest.createFunction(
  {
    id: "cleanup-expired-codes",
    retries: 1,
    triggers: [{ cron: "0 3 * * *" }],
  },
  async () => {
    const now = new Date().toISOString();
    const [a, b] = await Promise.all([
      supabaseAdmin.from("email_verification_codes").delete().lt("expires_at", now),
      supabaseAdmin.from("password_reset_codes").delete().lt("expires_at", now),
    ]);
    return {
      verification_deleted: a.error ? 0 : a.count ?? 0,
      reset_deleted: b.error ? 0 : b.count ?? 0,
    };
  },
);

export const inngestFunctions = [translationSyncJob, refreshStatsJob, cleanupExpiredCodesJob];
