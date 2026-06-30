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
import { loadKawzoneScope, inScope } from "./kawzone-scope";

async function assertAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (!isAdmin && !isSuper) throw new Error("Forbidden");
}

export interface SystemPulse {
  // Retours & Annulations
  returns_open: number;
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
    const scope = await loadKawzoneScope(sb);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();

    // Dossiers Retours & Annulations ouverts
    const { count: returns_open_count } = await sb
      .from("return_cases")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "decided"]);
    const returns_open = returns_open_count ?? 0;


    // Engagements financiers ouverts — périmètre Kawzone
    const { data: accRowsRaw } = await sb
      .from("v_sub_order_accounting" as any)
      .select("vendor_id, outstanding_to_refund_client, outstanding_credit_to_issue, commission_to_remit_vendor");
    const accRows = inScope((accRowsRaw ?? []) as any[], scope, false);
    let outstanding_refund_client = 0;
    let outstanding_credit_client = 0;
    let outstanding_commission_vendor = 0;
    for (const r of accRows as any[]) {
      outstanding_refund_client += Number(r.outstanding_to_refund_client ?? 0);
      outstanding_credit_client += Number(r.outstanding_credit_to_issue ?? 0);
      outstanding_commission_vendor += Number(r.commission_to_remit_vendor ?? 0);
    }

    // Mouvements du jour — scoppés via join event.vendor_id
    const { data: movTodayRaw } = await sb
      .from("financial_movements")
      .select("amount, direction, decision:order_decisions!inner(event:order_events!inner(vendor_id))")
      .gte("occurred_at", todayStart);
    const movToday = ((movTodayRaw ?? []) as any[]).filter((m) => {
      const v = m.decision?.event?.vendor_id;
      return v == null || scope.vendorIdSet.has(v);
    });
    let net_today = 0;
    for (const r of movToday) {
      const amt = Number(r.amount ?? 0);
      net_today += r.direction === "credit" ? amt : -amt;
    }

    // Commandes : on filtre via order_items dans le périmètre Kawzone
    const computeOrderCount = async (
      statusFilter: (q: any) => any,
      sinceIso?: string,
    ): Promise<number> => {
      if (scope.vendorIds.length === 0) return 0;
      // Récupère les order_ids des items dans le périmètre (limité pour rester rapide)
      let itemsQ = sb
        .from("order_items")
        .select("order_id, orders!inner(status, created_at)")
        .in("vendor_id", scope.vendorIds);
      itemsQ = statusFilter(itemsQ);
      if (sinceIso) itemsQ = itemsQ.gte("orders.created_at", sinceIso);
      const { data: items } = await itemsQ.limit(5000);
      const set = new Set<string>();
      for (const it of (items ?? []) as any[]) set.add(it.order_id);
      return set.size;
    };
    const active_orders = await computeOrderCount(
      (q) => q.not("orders.status", "in", "(delivered,cancelled)"),
    );
    const archived_7d = await computeOrderCount(
      (q) => q.in("orders.status", ["delivered", "cancelled"]),
      sevenDaysAgo,
    );

    return {
      returns_open,

      outstanding_refund_client,
      outstanding_credit_client,
      outstanding_commission_vendor,
      movements_today: movToday.length,
      net_today,
      active_orders,
      archived_7d,
      generated_at: new Date().toISOString(),
    };
  });
