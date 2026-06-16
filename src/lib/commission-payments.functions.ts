// ═══════════════════════════════════════════════════════════════
// COMMISSION PAYMENTS — Marquer une commission comme payée au vendeur
//
// Boucle de clôture du flux "Commission" :
//   1. recordEvent (commercial_gesture → "Versement commission")
//   2. recordDecision (commercial_gesture)
//   3. financial_movements (commission_paid, debit) — débite la dette
//
// Une fois le mouvement posé, la vue v_sub_order_accounting
// déduit `commission_paid_value` de `commission_to_remit_vendor`,
// la commande peut donc être archivée.
// ═══════════════════════════════════════════════════════════════

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (!isAdmin && !isSuper) throw new Error("Forbidden");
}

export const markCommissionPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    order_id: string;
    vendor_id: string;
    amount: number;
    method?: string | null;
    reference?: string | null;
    note?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (!(data.amount > 0)) throw new Error("amount must be > 0");
    const sb = context.supabase;

    // 1. Event
    const { data: evt, error: e1 } = await sb.from("order_events").insert({
      order_id: data.order_id,
      vendor_id: data.vendor_id,
      event_type: "commercial_gesture",
      reason: "Versement commission vendeur",
      payload: { kind: "commission_payment", amount: data.amount },
      created_by: context.userId,
    }).select("id").single();
    if (e1) throw e1;

    // 2. Decision
    const { data: dec, error: e2 } = await sb.from("order_decisions").insert({
      event_id: (evt as any).id,
      decision_type: "commercial_gesture",
      rationale: "Paiement commission",
      payload: { amount: data.amount },
      created_by: context.userId,
    }).select("id").single();
    if (e2) throw e2;

    // 3. Movement
    const { data: mv, error: e3 } = await sb.from("financial_movements").insert({
      decision_id: (dec as any).id,
      movement_type: "commission_paid",
      direction: "debit",
      amount: data.amount,
      currency: "XOF",
      cost_attribution: "vendor",
      method: data.method ?? null,
      reference: data.reference ?? null,
      note: data.note ?? "Commission payée",
      occurred_at: new Date().toISOString(),
      recorded_by: context.userId,
    }).select("*").single();
    if (e3) throw e3;

    return { event_id: (evt as any).id, decision_id: (dec as any).id, movement: mv };
  });

// Paiement en bloc : règle l'intégralité des commissions dues pour un vendeur.
// Crée un mouvement commission_paid par (order_id, vendor_id) du montant exact restant.
export const payAllOutstandingForVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { vendor_id: string; method?: string | null; reference?: string | null }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = context.supabase;
    const { data: rows, error } = await sb
      .from("v_sub_order_accounting" as any)
      .select("order_id, vendor_id, commission_to_remit_vendor")
      .eq("vendor_id", data.vendor_id)
      .gt("commission_to_remit_vendor", 0);
    if (error) throw error;
    const results: any[] = [];
    for (const r of (rows ?? []) as any[]) {
      const amt = Number(r.commission_to_remit_vendor);
      if (!(amt > 0)) continue;
      // Event
      const { data: evt } = await sb.from("order_events").insert({
        order_id: r.order_id, vendor_id: r.vendor_id,
        event_type: "commercial_gesture",
        reason: "Versement commission vendeur (bulk)",
        payload: { kind: "commission_payment", amount: amt },
        created_by: context.userId,
      }).select("id").single();
      const { data: dec } = await sb.from("order_decisions").insert({
        event_id: (evt as any).id, decision_type: "commercial_gesture",
        rationale: "Paiement commission", payload: { amount: amt },
        created_by: context.userId,
      }).select("id").single();
      const { data: mv } = await sb.from("financial_movements").insert({
        decision_id: (dec as any).id, movement_type: "commission_paid",
        direction: "debit", amount: amt, currency: "XOF",
        cost_attribution: "vendor",
        method: data.method ?? null, reference: data.reference ?? null,
        note: "Commission payée — règlement global",
        occurred_at: new Date().toISOString(),
        recorded_by: context.userId,
      }).select("id").single();
      results.push({ order_id: r.order_id, amount: amt, movement_id: (mv as any)?.id });
    }
    return { paid_count: results.length, total: results.reduce((s, r) => s + r.amount, 0), results };
  });
