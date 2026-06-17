// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   HOOK : useAdmin1Kpi — Calcul des 4 KPI
   ═══════════════════════════════════════════════════════════════ */

import { useMemo } from "react";
import type { KawzoneOrder, PaymentLog } from "@/admin1/types/admin1";
import type { KpiData } from "@/admin1/types/admin1";

export function useAdmin1Kpi(orders: KawzoneOrder[], payments: PaymentLog[]): KpiData {
  return useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);

    /* 1. Tresorerie du jour */
    const todayPayments = payments.filter((p) => p.recorded_at.startsWith(today));
    const treasury = {
      total: todayPayments.reduce((s, p) => s + p.amount, 0),
      wave: todayPayments.filter((p) => p.method === "wave").reduce((s, p) => s + p.amount, 0),
      orange_money: todayPayments.filter((p) => p.method === "orange_money").reduce((s, p) => s + p.amount, 0),
      cash: todayPayments.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0),
      bank: todayPayments.filter((p) => p.method === "bank_transfer").reduce((s, p) => s + p.amount, 0),
    };

    /* 2. Cash dehors (dettes) */
    const totalDebt = orders.reduce((s, o) => s + (o.balance > 0 ? o.balance : 0), 0);

    /* 3. Flux logistique */
    const toConfirm = orders.filter((o) => o.status === "new").length;
    const toWeigh = orders.filter((o) => o.status === "warehouse_arrived").length;

    /* 4. Alertes bloquees (>5 jours) */
    const now = Date.now();
    const blocked = orders.filter((o) => {
      if (o.status === "delivered" || o.status === "cancelled") return false;
      const updated = new Date(o.updated_at).getTime();
      const daysDiff = (now - updated) / (1000 * 60 * 60 * 24);
      return daysDiff > 5;
    }).length;

    return {
      treasury_today: treasury,
      total_debt: totalDebt,
      to_confirm: toConfirm,
      to_weigh: toWeigh,
      blocked_alerts: blocked,
    };
  }, [orders, payments]);
}
