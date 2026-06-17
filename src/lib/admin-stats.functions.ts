import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertPermission } from "./admin-auth.core";
import { refreshAdminStatsCache, type StatsOverview } from "./admin-stats.core.server";
import { sendInngestEvent } from "./inngest/client";


const STALE_MS = 15 * 60 * 1000;

/** Fast read of cached stats. Recomputes inline only if cache is missing or older than 15 min. */
export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StatsOverview> => {
    await assertPermission(context.userId, "settings");

    const { data } = await supabaseAdmin
      .from("admin_stats_cache")
      .select("value, updated_at")
      .eq("key", "overview")
      .maybeSingle();

    const row = data as { value: StatsOverview; updated_at: string } | null;
    if (row) {
      const age = Date.now() - new Date(row.updated_at).getTime();
      if (age < STALE_MS) return row.value;
      // Stale — kick async refresh, return stale value immediately for snappy UI.
      void sendInngestEvent({ name: "stats/refresh.requested", data: {} });
      return row.value;
    }

    // Cold start — compute synchronously.
    return refreshAdminStatsCache();
  });

/** Manual force-refresh (admin button). */
export const refreshAdminStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StatsOverview> => {
    await assertPermission(context.userId, "settings");
    return refreshAdminStatsCache();
  });
