// @ts-nocheck
import { TrendingUp, AlertTriangle, Package, Clock } from "lucide-react";
import type { KpiData } from "@/admin1/types/admin1";
import { fmtF } from "@/admin1/lib/admin1.config";
import { cn } from "@/lib/utils";

export function KpiDashboard({ kpi }: { kpi: KpiData }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      {/* 1. Tresorerie du jour */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
        <div className="flex items-center gap-1.5 mb-1">
          <TrendingUp className="h-4 w-4 text-emerald-600" />
          <span className="text-[11px] font-semibold text-emerald-800">Tresorerie</span>
        </div>
        <div className="text-lg font-bold text-emerald-900">{fmtF(kpi.treasury_today.total)}</div>
      </div>

      {/* 2. Cash dehors */}
      <div className="rounded-lg border border-red-200 bg-red-50 p-2.5">
        <div className="flex items-center gap-1.5 mb-1">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <span className="text-[11px] font-semibold text-red-800">Dettes</span>
        </div>
        <div className="text-lg font-bold text-red-900">{fmtF(kpi.total_debt)}</div>
      </div>

      {/* 3. Flux logistique */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5">
        <div className="flex items-center gap-1.5 mb-1">
          <Package className="h-4 w-4 text-blue-600" />
          <span className="text-[11px] font-semibold text-blue-800">A confirmer</span>
        </div>
        <div className="text-lg font-bold text-blue-900">{kpi.to_confirm}</div>
      </div>

      {/* 4. Alertes bloquees */}
      <div className={cn(
        "rounded-lg border p-2.5",
        kpi.blocked_alerts > 0 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"
      )}>
        <div className="flex items-center gap-1.5 mb-1">
          <Clock className={cn("h-4 w-4", kpi.blocked_alerts > 0 ? "text-amber-600" : "text-slate-500")} />
          <span className={cn("text-[11px] font-semibold", kpi.blocked_alerts > 0 ? "text-amber-800" : "text-slate-700")}>
            Bloquees
          </span>
        </div>
        <div className={cn("text-lg font-bold", kpi.blocked_alerts > 0 ? "text-amber-900" : "text-slate-600")}>
          {kpi.blocked_alerts}
        </div>
      </div>
    </div>
  );
}
