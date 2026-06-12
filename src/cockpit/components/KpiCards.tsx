// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   KPI Cards — Compteurs avec regles exactes
   
   Regles:
   - A confirmer : mapStatus === "new"
   - Paiements   : mapStatus === "payment_pending"
   - A peser     : logistics_status === "awaiting_weighing"
   - Pret        : logistics_status IN ("validated", "ready_to_ship")
   - Expedie     : mapStatus === "shipped"
   - Dettes      : SUM(remaining) non livrees / non annulees
   ═══════════════════════════════════════════════════════════════ */

import { ClipboardList, AlertTriangle, Scale, PackageCheck, Truck, TrendingUp } from "lucide-react";
import { fmtF } from "@/cockpit/lib/workflow";

interface Props {
  newCount: number;
  pendingPayment: number;
  toWeigh: number;
  ready: number;
  shipped: number;
  totalDebt: number;
}

export function KpiCards({ newCount, pendingPayment, toWeigh, ready, shipped, totalDebt }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {/* A confirmer */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5 text-center">
        <ClipboardList className="h-4 w-4 text-purple-600 mx-auto mb-1" />
        <div className="text-[10px] font-semibold text-purple-800">A confirmer</div>
        <div className="text-xl font-bold text-purple-900">{newCount}</div>
      </div>

      {/* Paiement en attente */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-center">
        <AlertTriangle className="h-4 w-4 text-amber-600 mx-auto mb-1" />
        <div className="text-[10px] font-semibold text-amber-800">Paiements</div>
        <div className="text-xl font-bold text-amber-900">{pendingPayment}</div>
      </div>

      {/* A peser */}
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5 text-center">
        <Scale className="h-4 w-4 text-orange-600 mx-auto mb-1" />
        <div className="text-[10px] font-semibold text-orange-800">A peser</div>
        <div className="text-xl font-bold text-orange-900">{toWeigh}</div>
      </div>

      {/* Pret a expedier */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-center">
        <PackageCheck className="h-4 w-4 text-emerald-600 mx-auto mb-1" />
        <div className="text-[10px] font-semibold text-emerald-800">Pret</div>
        <div className="text-xl font-bold text-emerald-900">{ready}</div>
      </div>

      {/* Expedie */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2.5 text-center">
        <Truck className="h-4 w-4 text-indigo-600 mx-auto mb-1" />
        <div className="text-[10px] font-semibold text-indigo-800">Expedie</div>
        <div className="text-xl font-bold text-indigo-900">{shipped}</div>
      </div>

      {/* Dette totale */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-center">
        <TrendingUp className="h-4 w-4 text-red-600 mx-auto mb-1" />
        <div className="text-[10px] font-semibold text-red-800">Dettes</div>
        <div className="text-lg font-bold text-red-900">{fmtF(totalDebt)}</div>
      </div>
    </div>
  );
}
