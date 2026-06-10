// @ts-nocheck
import { TrendingUp, AlertTriangle, Package, Clock } from "lucide-react";
import type { KpiData } from "@/admin1/types/admin1";
import { fmtF } from "@/admin1/lib/admin1.config";
import { cn } from "@/lib/utils";

export function KpiDashboard({ kpi }: { kpi: KpiData }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {/* 1. Tresorerie du jour */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="h-5 w-5 text-emerald-600" />
          <span className="text-sm font-semibold text-emerald-800">Tresorerie du jour</span>
        </div>
        <div className="text-2xl font-bold text-emerald-900">{fmtF(kpi.treasury_today.total)}</div>
        <div className="mt-2 space-y-0.5 text-[11px] text-emerald-700">
          {kpi.treasury_today.wave > 0 && <div>Wave: {fmtF(kpi.treasury_today.wave)}</div>}
          {kpi.treasury_today.orange_money > 0 && <div>OM: {fmtF(kpi.treasury_today.orange_money)}</div>}
          {kpi.treasury_today.cash > 0 && <div>Cash: {fmtF(kpi.treasury_today.cash)}</div>}
          {kpi.treasury_today.bank > 0 && <div>Virement: {fmtF(kpi.treasury_today.bank)}</div>}
          {kpi.treasury_today.total === 0 && <div className="text-emerald-500">Aucun encaissement aujourd'hui</div>}
        </div>
      </div>

      {/* 2. Cash dehors */}
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <span className="text-sm font-semibold text-red-800">Cash dehors (dettes)</span>
        </div>
        <div className="text-2xl font-bold text-red-900">{fmtF(kpi.total_debt)}</div>
        <div className="mt-1 text-[11px] text-red-600">Solde restant du sur toutes les commandes</div>
      </div>

      {/* 3. Flux logistique */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Package className="h-5 w-5 text-blue-600" />
          <span className="text-sm font-semibold text-blue-800">Flux logistique</span>
        </div>
        <div className="flex gap-4">
          <div>
            <div className="text-2xl font-bold text-blue-900">{kpi.to_confirm}</div>
            <div className="text-[11px] text-blue-600">A confirmer</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-900">{kpi.to_weigh}</div>
            <div className="text-[11px] text-blue-600">A peser</div>
          </div>
        </div>
      </div>

      {/* 4. Alertes bloquees */}
      <div className={cn(
        "rounded-xl border p-4",
        kpi.blocked_alerts > 0 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"
      )}>
        <div className="flex items-center gap-2 mb-2">
          <Clock className={cn("h-5 w-5", kpi.blocked_alerts > 0 ? "text-amber-600" : "text-slate-500")} />
          <span className={cn("text-sm font-semibold", kpi.blocked_alerts > 0 ? "text-amber-800" : "text-slate-700")}>
            Alertes bloquees
          </span>
        </div>
        <div className={cn("text-2xl font-bold", kpi.blocked_alerts > 0 ? "text-amber-900" : "text-slate-600")}>
          {kpi.blocked_alerts}
        </div>
        <div className="mt-1 text-[11px] text-slate-500">Immobiles depuis +5 jours</div>
      </div>
    </div>
  );
}
