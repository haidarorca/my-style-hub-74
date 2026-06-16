// ═══════════════════════════════════════════════════════════════
// COCKPIT PULSE — Agrégat cross-zones (lecture seule)
//
// Une seule requête qui répond à : « Où en est le système ? »
// Utilisé par le shell unifié visible sur les 4 zones (Cockpit,
// SAV, Finance, Archive) pour donner une lecture instantanée et
// permettre de naviguer là où il faut agir.
// ═══════════════════════════════════════════════════════════════

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (!isAdmin && !isSuper) throw new Error("Forbidden");
}

export interface SystemPulse {
  // SAV
  sav_open: number;
  sav_oldest_days: number;
  sav_by_owner: { kawzone: number; vendor: number; supplier: number; client: number };
  sav_total_impact: number;
  // Finance
  outstanding_refund_client: number;
  outstanding_credit_client: number;
  outstanding_commission_vendor: number;
  movements_today: number;
  net_today: number;
  // Cockpit (commandes en cours)
  active_orders: number;
  // Archive (volume récent)
  archived_7d: number;
  // Méta
  generated_at: string;
}

export const getSystemPulse = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SystemPulse> => {
    await assertAdmin(context.supabase, context.userId);
    const sb = context.supabase;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();

    // SAV ouverts
    const { data: savRows } = await sb
      .from("sav_cases")
      .select("owner_party, opened_at, financial_impact_amount, status")
      .neq("status", "closed");
    const sav_by_owner = { kawzone: 0, vendor: 0, supplier: 0, client: 0 };
    let sav_oldest_days = 0;
    let sav_total_impact = 0;
    for (const r of savRows ?? []) {
      const owner = (r as any).owner_party as keyof typeof sav_by_owner;
      if (owner in sav_by_owner) sav_by_owner[owner] += 1;
      const days = Math.floor((Date.now() - new Date((r as any).opened_at).getTime()) / 86_400_000);
      if (days > sav_oldest_days) sav_oldest_days = days;
      sav_total_impact += Number((r as any).financial_impact_amount ?? 0);
    }

    // Engagements financiers ouverts (vue accounting)
    const { data: accRows } = await sb
      .from("v_sub_order_accounting" as any)
      .select("outstanding_to_refund_client, outstanding_credit_to_issue, commission_to_remit_vendor");
    let outstanding_refund_client = 0;
    let outstanding_credit_client = 0;
    let outstanding_commission_vendor = 0;
    for (const r of (accRows ?? []) as any[]) {
      outstanding_refund_client += Number(r.outstanding_to_refund_client ?? 0);
      outstanding_credit_client += Number(r.outstanding_credit_to_issue ?? 0);
      outstanding_commission_vendor += Number(r.commission_to_remit_vendor ?? 0);
    }

    // Mouvements du jour
    const { data: movToday } = await sb
      .from("financial_movements")
      .select("amount, direction")
      .gte("occurred_at", todayStart);
    let net_today = 0;
    for (const r of (movToday ?? []) as any[]) {
      const amt = Number(r.amount ?? 0);
      net_today += r.direction === "credit" ? amt : -amt;
    }

    // Commandes actives (non clôturées)
    const { count: active_orders } = await sb
      .from("orders")
      .select("id", { count: "exact", head: true })
      .not("status", "in", "(delivered,cancelled)");

    // Archive 7 derniers jours
    const { count: archived_7d } = await sb
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["delivered", "cancelled"])
      .gte("created_at", sevenDaysAgo);

    return {
      sav_open: (savRows ?? []).length,
      sav_oldest_days,
      sav_by_owner,
      sav_total_impact,
      outstanding_refund_client,
      outstanding_credit_client,
      outstanding_commission_vendor,
      movements_today: (movToday ?? []).length,
      net_today,
      active_orders: active_orders ?? 0,
      archived_7d: archived_7d ?? 0,
      generated_at: new Date().toISOString(),
    };
  });
