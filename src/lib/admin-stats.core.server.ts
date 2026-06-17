import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type StatsOverview = {
  customers: { total: number; active: number; blocked: number };
  vendors: { total: number; active: number; pending: number };
  orders: { total: number; revenue_30d: number; pending: number };
  generated_at: string;
};

/**
 * Recomputes the admin stats cache. Heavy — only run from background
 * (Inngest cron or manual admin refresh).
 */
export async function refreshAdminStatsCache(): Promise<StatsOverview> {
  const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  const [acheteursRes, vendorsRes, ordersTotalRes, orders30Res, pendingOrdersRes, vendorsPendingRes] =
    await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, is_suspended", { count: "exact", head: false }).eq("role", "acheteur"),
      supabaseAdmin.from("profiles").select("id, vendor_status", { count: "exact", head: false }),
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("orders").select("total").gte("created_at", since30),
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }).in("status", ["new", "processing", "pending"]),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("vendor_status", "pending"),
    ]);

  const acheteurs = (acheteursRes.data ?? []) as Array<{ is_suspended: boolean }>;
  const customers = {
    total: acheteurs.length,
    blocked: acheteurs.filter((a) => a.is_suspended).length,
    active: acheteurs.filter((a) => !a.is_suspended).length,
  };

  const vendorsData = (vendorsRes.data ?? []) as Array<{ vendor_status: string }>;
  const vendors = {
    total: vendorsData.length,
    active: vendorsData.filter((v) => v.vendor_status === "active").length,
    pending: vendorsPendingRes.count ?? 0,
  };

  const revenue30 = ((orders30Res.data ?? []) as Array<{ total: number | null }>).reduce(
    (s, o) => s + Number(o.total ?? 0),
    0,
  );

  const stats: StatsOverview = {
    customers,
    vendors,
    orders: {
      total: ordersTotalRes.count ?? 0,
      revenue_30d: Math.round(revenue30 * 100) / 100,
      pending: pendingOrdersRes.count ?? 0,
    },
    generated_at: new Date().toISOString(),
  };

  await supabaseAdmin
    .from("admin_stats_cache")
    .upsert({ key: "overview", value: stats, updated_at: new Date().toISOString() }, { onConflict: "key" });

  return stats;
}
