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
  async () => {
    // Remplacé par le Centre de traduction (tâches lancées depuis le tableau de bord).
    void runTranslationSync;
    return { skipped: true };
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

// 4) Import CJ en arrière-plan — un seul worker actif par job.
export const cjImportJob = inngest.createFunction(
  {
    id: "cj-import-job",
    retries: 3,
    concurrency: [{ key: "event.data.jobId", limit: 1 }, { limit: 2 }],
    triggers: [{ event: "cj/import.run" }],
  },
  async ({ event, step }) => {
    const jobId = String((event.data as any)?.jobId ?? "");
    if (!jobId) return { ok: false };
    const { processJobBatch } = await import("@/lib/cj/jobs.server");
    // Budget par exécution ; au-delà on se relance (chaînage borné et espacé).
    for (let i = 0; i < 120; i += 1) {
      const r = await step.run(`batch-${i}`, () => processJobBatch(jobId, 20_000));
      if (r.state === "done" || r.state === "stopped") return { ok: true, state: r.state, batches: i + 1 };
      if (r.state === "rate_limited") await step.sleep(`cooldown-${i}`, "60s");
    }
    await step.sleep("pause-before-next", "5s");
    await step.sendEvent("continue", { name: "cj/import.run", data: { jobId } });
    return { ok: true, state: "continued" };
  },
);

// 5) Imports programmés + relance des jobs interrompus — toutes les 15 min.
export const cjImportWatchdog = inngest.createFunction(
  { id: "cj-import-watchdog", retries: 1, triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => {
    const { runDueSchedules, staleActiveJobs } = await import("@/lib/cj/jobs.server");
    const created = await step.run("schedules", () => runDueSchedules());
    const stale = await step.run("stale", () => staleActiveJobs());
    const ids = [...new Set([...created, ...stale])];
    if (ids.length) {
      await step.sendEvent("kick", ids.map((jobId) => ({ name: "cj/import.run", data: { jobId } })));
    }
    return { created: created.length, restarted: stale.length };
  },
);

export const inngestFunctions = [translationSyncJob, refreshStatsJob, cleanupExpiredCodesJob, cjImportJob, cjImportWatchdog];
