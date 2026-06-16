// ═══════════════════════════════════════════════════════════════
// CENTRE FINANCIER — Server functions (lecture seule)
//
// Aucune écriture ici : la saisie passe par le Drawer (events /
// decisions / movements). Ce module agrège uniquement pour
// affichage et exports futurs.
// ═══════════════════════════════════════════════════════════════

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadKawzoneScope, inScope } from "./kawzone-scope";
import type {
  FinancialMovement,
  FinancialMovementType,
  MovementDirection,
  CostAttribution,
} from "@/cockpit/lib/events";

async function assertAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (!isAdmin && !isSuper) throw new Error("Forbidden: admin role required");
}

export interface JournalRow extends FinancialMovement {
  order_id: string | null;
  vendor_id: string | null;
  order_item_id: string | null;
}

export interface FinanceSummary {
  total_in: number;
  total_out: number;
  net: number;
  pending_refund_to_client: number;
  pending_credit_to_client: number;
  pending_commission_to_vendor: number;
  pending_extra_from_client: number;
  by_type: Record<string, { in: number; out: number; count: number }>;
}

export interface SubOrderAccountingRow {
  order_id: string;
  vendor_id: string;
  gross_value: number;
  cancelled_value: number;
  refunded_value: number;
  credited_value: number;
  extra_collected_value: number;
  penalty_value: number;
  loss_value: number;
  commission_to_remit_vendor: number;
  net_value: number;
  outstanding_to_refund_client: number;
  outstanding_credit_to_issue: number;
}

// ─── listJournal ───────────────────────────────────────────────
export const listJournal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    from?: string | null;
    to?: string | null;
    movement_types?: FinancialMovementType[] | null;
    direction?: MovementDirection | null;
    cost_attribution?: CostAttribution | null;
    limit?: number;
  } = {}) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const scope = await loadKawzoneScope(context.supabase);
    // Join via decisions → events pour récupérer order_id / vendor_id / item
    let q = context.supabase
      .from("financial_movements")
      .select(`
        *,
        decision:order_decisions!inner(
          id,
          event:order_events!inner(order_id, vendor_id, order_item_id)
        )
      `)
      .order("occurred_at", { ascending: false })
      .limit(Math.min(data.limit ?? 1000, 5000));
    if (data.from) q = q.gte("occurred_at", data.from);
    if (data.to) q = q.lte("occurred_at", data.to);
    if (data.movement_types?.length) q = q.in("movement_type", data.movement_types);
    if (data.direction) q = q.eq("direction", data.direction);
    if (data.cost_attribution) q = q.eq("cost_attribution", data.cost_attribution);
    const { data: rows, error } = await q;
    if (error) throw error;
    const mapped = (rows ?? []).map((r: any) => ({
      ...r,
      order_id: r.decision?.event?.order_id ?? null,
      vendor_id: r.decision?.event?.vendor_id ?? null,
      order_item_id: r.decision?.event?.order_item_id ?? null,
    })) as JournalRow[];
    // Périmètre Kawzone : exclure mouvements liés à boutiques externes
    return inScope(mapped, scope, /* keepNull */ true);
  });

// ─── getSummary ────────────────────────────────────────────────
export const getFinanceSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { from?: string | null; to?: string | null } = {}) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const scope = await loadKawzoneScope(context.supabase);

    // Mouvements scoppés via join → event.vendor_id
    let q = context.supabase
      .from("financial_movements")
      .select(`
        movement_type, direction, amount,
        decision:order_decisions!inner(
          event:order_events!inner(vendor_id)
        )
      `);
    if (data.from) q = q.gte("occurred_at", data.from);
    if (data.to) q = q.lte("occurred_at", data.to);
    const { data: mvtsRaw, error } = await q;
    if (error) throw error;
    const mvts = (mvtsRaw ?? []).filter((m: any) => {
      const v = m.decision?.event?.vendor_id;
      return v == null || scope.vendorIdSet.has(v);
    });

    // Engagements en cours via la vue agrégée — filtrés sur périmètre
    const { data: acc, error: e2 } = await context.supabase
      .from("v_sub_order_accounting")
      .select("vendor_id, outstanding_to_refund_client, outstanding_credit_to_issue, commission_to_remit_vendor");
    if (e2) throw e2;
    const accScoped = inScope((acc ?? []) as any[], scope, false);

    const summary: FinanceSummary = {
      total_in: 0, total_out: 0, net: 0,
      pending_refund_to_client: 0,
      pending_credit_to_client: 0,
      pending_commission_to_vendor: 0,
      pending_extra_from_client: 0,
      by_type: {},
    };
    for (const m of mvts) {
      const amt = Number(m.amount ?? 0);
      const dir = m.direction as MovementDirection;
      const isIn = dir === "credit"; // credit = entrée caisse
      if (isIn) summary.total_in += amt; else summary.total_out += amt;
      const key = String(m.movement_type);
      if (!summary.by_type[key]) summary.by_type[key] = { in: 0, out: 0, count: 0 };
      summary.by_type[key][isIn ? "in" : "out"] += amt;
      summary.by_type[key].count += 1;
    }
    summary.net = summary.total_in - summary.total_out;
    for (const a of accScoped) {
      summary.pending_refund_to_client += Number(a.outstanding_to_refund_client ?? 0);
      summary.pending_credit_to_client += Number(a.outstanding_credit_to_issue ?? 0);
      summary.pending_commission_to_vendor += Number(a.commission_to_remit_vendor ?? 0);
      summary.pending_extra_from_client += Number((a as any).outstanding_extra_from_client ?? 0);
    }
    return summary;
  });

// ─── listOutstanding (dettes & créances) ───────────────────────
export const listOutstanding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const scope = await loadKawzoneScope(context.supabase);
    const { data, error } = await context.supabase
      .from("v_sub_order_accounting")
      .select("*")
      .or("outstanding_to_refund_client.gt.0,outstanding_credit_to_issue.gt.0,commission_to_remit_vendor.gt.0,outstanding_extra_from_client.gt.0")
      .limit(1000);
    if (error) throw error;
    return inScope((data ?? []) as SubOrderAccountingRow[], scope, false);
  });
