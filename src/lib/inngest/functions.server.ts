import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runTranslationSync } from "@/lib/sync-translations.core.server";
import { refreshAdminStatsCache } from "@/lib/admin-stats.core.server";

// 1) Translation sync — runs every 6h and on-demand
export const translationSyncJob = inngest.createFunction(
  { id: "translation-sync", retries: 2 },
  [{ cron: "0 */6 * * *" }, { event: "translation/sync.requested" }],
  async ({ step }) => {
    const report = await step.run("run-sync", () => runTranslationSync());
    return report;
  },
);

// 2) Admin stats cache refresh — every 15 min
export const refreshStatsJob = inngest.createFunction(
  { id: "refresh-admin-stats", retries: 1 },
  [{ cron: "*/15 * * * *" }, { event: "stats/refresh.requested" }],
  async ({ step }) => {
    await step.run("refresh", () => refreshAdminStatsCache());
    return { ok: true };
  },
);

// 3) Cleanup expired verification/reset codes — daily
export const cleanupExpiredCodesJob = inngest.createFunction(
  { id: "cleanup-expired-codes", retries: 1 },
  [{ cron: "0 3 * * *" }, { event: "cleanup/expired-codes.requested" }],
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
