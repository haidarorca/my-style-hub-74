import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runTranslationSync } from "@/lib/sync-translations.core.server";
import { refreshAdminStatsCache } from "@/lib/admin-stats.core.server";

// 1) Translation sync — every 6h
export const translationSyncJob = inngest.createFunction(
  { id: "translation-sync", retries: 2 },
  { cron: "0 */6 * * *" },
  async ({ step }) => {
    return await step.run("run-sync", async () => runTranslationSync());
  },
);

// 2) Admin stats cache refresh — every 15 min
export const refreshStatsJob = inngest.createFunction(
  { id: "refresh-admin-stats", retries: 1 },
  { cron: "*/15 * * * *" },
  async ({ step }) => {
    await step.run("refresh", async () => refreshAdminStatsCache());
    return { ok: true };
  },
);

// 3) On-demand stats refresh (event-triggered)
export const refreshStatsOnDemandJob = inngest.createFunction(
  { id: "refresh-admin-stats-on-demand", retries: 1 },
  { event: "stats/refresh.requested" },
  async ({ step }) => {
    await step.run("refresh", async () => refreshAdminStatsCache());
    return { ok: true };
  },
);

// 4) On-demand translation sync (event-triggered)
export const translationSyncOnDemandJob = inngest.createFunction(
  { id: "translation-sync-on-demand", retries: 1 },
  { event: "translation/sync.requested" },
  async ({ step }) => {
    return await step.run("run-sync", async () => runTranslationSync());
  },
);

// 5) Cleanup expired verification/reset codes — daily 03:00 UTC
export const cleanupExpiredCodesJob = inngest.createFunction(
  { id: "cleanup-expired-codes", retries: 1 },
  { cron: "0 3 * * *" },
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

export const inngestFunctions = [
  translationSyncJob,
  translationSyncOnDemandJob,
  refreshStatsJob,
  refreshStatsOnDemandJob,
  cleanupExpiredCodesJob,
];
