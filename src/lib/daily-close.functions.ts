// ═══════════════════════════════════════════════════════════════
// CLÔTURE DU JOUR — Une seule requête, 10 réponses
//
// Répond aux 10 questions que le propriétaire de Kawzone se pose
// chaque soir, sans devoir naviguer dans plusieurs écrans :
//   1.  CA du jour
//   2.  Encaissements du jour
//   3.  Sorties du jour
//   4.  Bénéfice estimé du jour (net mouvements)
//   5.  Remboursements à effectuer aux clients
//   6.  Vendeurs à payer (commissions à reverser)
//   7.  Clients qui doivent encore (compléments)
//   8.  Dossiers SAV ouverts
//   9.  Dossiers bloqués (SAV côté Kawzone > 3j, ou status blocked)
//   10. Risques financiers (impact > seuil, ou ancienneté > 7j)
//
// Périmètre : uniquement les boutiques Kawzone (Admin + Commission).
// ═══════════════════════════════════════════════════════════════

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadKawzoneScope, inScope } from "./kawzone-scope";

async function assertAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (!isAdmin && !isSuper) throw new Error("Forbidden");
}

const RISK_AMOUNT_THRESHOLD = 50_000; // FCFA
const RISK_AGE_DAYS = 7;
const BLOCKED_AGE_DAYS = 3;

export interface VendorDebt {
  vendor_id: string;
  vendor_name: string | null;
  amount: number;
  orders_count: number;
}
export interface ClientDebt {
  order_id: string;
  client_name: string | null;
  amount: number;
}
export interface RefundDue {
  order_id: string;
  client_name: string | null;
  amount_to_refund: number;
  amount_to_credit: number;
}
export interface SavRisk {
  id: string;
  title: string;
  owner_party: string;
  age_days: number;
  impact_amount: number;
  reason: "amount" | "age";
}
export interface BlockedCase {
  id: string;
  title: string;
  age_days: number;
  impact_amount: number;
  status: string;
}

export interface DailyClose {
  date: string;
  // 1
  revenue_today: number;
  orders_today: number;
  // 2-3-4
  cash_in_today: number;
  cash_out_today: number;
  estimated_profit_today: number;
  // 5
  refunds_due_total: number;
  refunds_due: RefundDue[];
  // 6
  vendors_to_pay_total: number;
  vendors_to_pay: VendorDebt[];
  // 7
  clients_owe_total: number;
  clients_owe: ClientDebt[];
  // 8
  sav_open_count: number;
  sav_open_total_impact: number;
  // 9
  blocked_cases: BlockedCase[];
  // 10
  financial_risks: SavRisk[];
  // méta
  generated_at: string;
}

export const getDailyClose = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { date?: string | null } = {}) => input)
  .handler(async ({ data, context }): Promise<DailyClose> => {
    await assertAdmin(context.supabase, context.userId);
    const sb = context.supabase;
    const scope = await loadKawzoneScope(sb);

    // Borne du jour cible
    const targetDate = data.date ? new Date(data.date) : new Date();
    const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const dayStartIso = dayStart.toISOString();
    const dayEndIso = dayEnd.toISOString();

    // ─── 1. CA du jour : SUM(qty*unit_price) des items de boutiques Kawzone
    //     pour les commandes créées dans la journée
    let revenue_today = 0;
    let orders_today_set = new Set<string>();
    if (scope.vendorIds.length > 0) {
      const { data: items } = await sb
        .from("order_items")
        .select("order_id, quantity, unit_price, orders!inner(created_at, status)")
        .in("vendor_id", scope.vendorIds)
        .gte("orders.created_at", dayStartIso)
        .lt("orders.created_at", dayEndIso)
        .neq("orders.status", "cancelled")
        .limit(5000);
      for (const it of (items ?? []) as any[]) {
        revenue_today += Number(it.quantity ?? 0) * Number(it.unit_price ?? 0);
        orders_today_set.add(it.order_id);
      }
    }

    // ─── 2/3/4. Mouvements du jour scoppés
    const { data: mvtsRaw } = await sb
      .from("financial_movements")
      .select("amount, direction, decision:order_decisions!inner(event:order_events!inner(vendor_id))")
      .gte("occurred_at", dayStartIso)
      .lt("occurred_at", dayEndIso);
    let cash_in_today = 0;
    let cash_out_today = 0;
    for (const m of (mvtsRaw ?? []) as any[]) {
      const v = m.decision?.event?.vendor_id;
      if (v != null && !scope.vendorIdSet.has(v)) continue;
      const amt = Number(m.amount ?? 0);
      if (m.direction === "credit") cash_in_today += amt;
      else cash_out_today += amt;
    }

    // ─── 5/6/7. Engagements ouverts (vue agrégée)
    const { data: accRaw } = await sb
      .from("v_sub_order_accounting" as any)
      .select(
        "order_id, vendor_id, outstanding_to_refund_client, outstanding_credit_to_issue, commission_to_remit_vendor, outstanding_extra_from_client, extra_collected_value, gross_value, refunded_value, credited_value",
      );
    const acc = inScope((accRaw ?? []) as any[], scope, false);

    // Récupère noms vendeurs + clients en bloc
    const vendorIds = Array.from(new Set(acc.map((a: any) => a.vendor_id).filter(Boolean)));
    const orderIds = Array.from(new Set(acc.map((a: any) => a.order_id).filter(Boolean)));
    const [{ data: vendorsRows }, { data: ordersRows }] = await Promise.all([
      vendorIds.length
        ? sb.from("profiles").select("id, shop_name, full_name").in("id", vendorIds)
        : Promise.resolve({ data: [] as any[] }),
      orderIds.length
        ? sb.from("orders").select("id, customer_name").in("id", orderIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const vendorName = new Map<string, string | null>(
      (vendorsRows ?? []).map((v: any) => [v.id, v.shop_name ?? v.full_name ?? null]),
    );
    const orderClient = new Map<string, string | null>(
      (ordersRows ?? []).map((o: any) => [o.id, o.customer_name ?? null]),
    );

    const refundsMap = new Map<string, RefundDue>();
    const vendorAgg = new Map<string, VendorDebt>();
    // T5/T9 — Clients qui doivent : compléments attendus pour remplacement plus cher
    const clientsOweMap = new Map<string, ClientDebt>();

    let refunds_due_total = 0;
    let vendors_to_pay_total = 0;
    let clients_owe_total = 0;

    for (const a of acc as any[]) {
      const toRefund = Number(a.outstanding_to_refund_client ?? 0);
      const toCredit = Number(a.outstanding_credit_to_issue ?? 0);
      const commission = Number(a.commission_to_remit_vendor ?? 0);
      const extraDue = Number(a.outstanding_extra_from_client ?? 0);

      if (toRefund > 0 || toCredit > 0) {
        const prev = refundsMap.get(a.order_id) ?? {
          order_id: a.order_id,
          client_name: orderClient.get(a.order_id) ?? null,
          amount_to_refund: 0,
          amount_to_credit: 0,
        };
        prev.amount_to_refund += toRefund;
        prev.amount_to_credit += toCredit;
        refundsMap.set(a.order_id, prev);
        refunds_due_total += toRefund + toCredit;
      }
      if (commission > 0 && a.vendor_id) {
        const prev = vendorAgg.get(a.vendor_id) ?? {
          vendor_id: a.vendor_id,
          vendor_name: vendorName.get(a.vendor_id) ?? null,
          amount: 0,
          orders_count: 0,
        };
        prev.amount += commission;
        prev.orders_count += 1;
        vendorAgg.set(a.vendor_id, prev);
        vendors_to_pay_total += commission;
      }
      if (extraDue > 0) {
        const prev = clientsOweMap.get(a.order_id) ?? {
          order_id: a.order_id,
          client_name: orderClient.get(a.order_id) ?? null,
          amount: 0,
        };
        prev.amount += extraDue;
        clientsOweMap.set(a.order_id, prev);
        clients_owe_total += extraDue;
      }
    }
    const refunds_due = Array.from(refundsMap.values()).sort(
      (a, b) => b.amount_to_refund + b.amount_to_credit - (a.amount_to_refund + a.amount_to_credit),
    );
    const vendors_to_pay = Array.from(vendorAgg.values()).sort((a, b) => b.amount - a.amount);
    const clients_owe = Array.from(clientsOweMap.values()).sort((a, b) => b.amount - a.amount);

    // ─── 8/9/10. Retours & Annulations (remplace l'ancien SAV)
    const { data: returnsRaw } = await sb
      .from("return_cases")
      .select("id, code, kind, status, opened_at, refund_suggested_xof, refund_final_xof")
      .in("status", ["open", "decided"]);
    const returnRows = (returnsRaw ?? []) as any[];
    const now = Date.now();
    let sav_open_total_impact = 0;
    const blocked_cases: BlockedCase[] = [];
    const financial_risks: SavRisk[] = [];
    for (const s of returnRows) {
      const ageDays = Math.floor((now - new Date(s.opened_at).getTime()) / 86_400_000);
      const impact = Number(s.refund_final_xof ?? s.refund_suggested_xof ?? 0);
      sav_open_total_impact += impact;
      if (ageDays >= BLOCKED_AGE_DAYS) {
        blocked_cases.push({
          id: s.id,
          title: `${s.code} — ${s.kind === "cancellation" ? "Annulation" : "Retour"}`,
          age_days: ageDays,
          impact_amount: impact,
          status: s.status,
        });
      }
      if (impact >= RISK_AMOUNT_THRESHOLD || ageDays >= RISK_AGE_DAYS) {
        financial_risks.push({
          id: s.id,
          title: `${s.code} — ${s.kind === "cancellation" ? "Annulation" : "Retour"}`,
          owner_party: "kawzone",
          age_days: ageDays,
          impact_amount: impact,
          reason: impact >= RISK_AMOUNT_THRESHOLD ? "amount" : "age",
        });
      }
    }
    blocked_cases.sort((a, b) => b.age_days - a.age_days);
    financial_risks.sort((a, b) => b.impact_amount - a.impact_amount);


    return {
      date: dayStart.toISOString().slice(0, 10),
      revenue_today,
      orders_today: orders_today_set.size,
      cash_in_today,
      cash_out_today,
      estimated_profit_today: cash_in_today - cash_out_today,
      refunds_due_total,
      refunds_due: refunds_due.slice(0, 50),
      vendors_to_pay_total,
      vendors_to_pay: vendors_to_pay.slice(0, 50),
      clients_owe_total,
      clients_owe: clients_owe.slice(0, 50),
      sav_open_count: savRows.length,
      sav_open_total_impact,
      blocked_cases: blocked_cases.slice(0, 50),
      financial_risks: financial_risks.slice(0, 50),
      generated_at: new Date().toISOString(),
    };
  });
