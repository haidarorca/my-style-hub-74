// @ts-nocheck
import { ClipboardList, AlertTriangle, Scale, PackageCheck, TrendingUp } from "lucide-react";
import { fmtF } from "@/cockpit/lib/workflow";

interface Props {
  newCount: number;
  pendingPayment: number;
  toWeigh: number;
  ready: number;
  totalDebt: number;
}

export function KpiCards({ newCount, pendingPayment, toWeigh, ready, totalDebt }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {/* A confirmer */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <ClipboardList className="h-4 w-4 text-purple-600" />
          <span className="text-[11px] font-semibold text-purple-800">A confirmer</span>
        </div>
        <div className="text-2xl font-bold text-purple-900">{newCount}</div>
      </div>

      {/* Paiement en attente */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span className="text-[11px] font-semibold text-amber-800">Paiements</span>
        </div>
        <div className="text-2xl font-bold text-amber-900">{pendingPayment}</div>
      </div>

      {/* A peser */}
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Scale className="h-4 w-4 text-orange-600" />
          <span className="text-[11px] font-semibold text-orange-800">A peser</span>
        </div>
        <div className="text-2xl font-bold text-orange-900">{toWeigh}</div>
      </div>

      {/* Pret a expedier */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <PackageCheck className="h-4 w-4 text-emerald-600" />
          <span className="text-[11px] font-semibold text-emerald-800">Pret</span>
        </div>
        <div className="text-2xl font-bold text-emerald-900">{ready}</div>
      </div>

      {/* Dette totale — pleine largeur */}
      <div className="col-span-2 bg-red-50 border border-red-200 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-red-600" />
            <span className="text-[11px] font-semibold text-red-800">Dettes clients</span>
          </div>
          <div className="text-xl font-bold text-red-900">{fmtF(totalDebt)}</div>
        </div>
      </div>
    </div>
  );
}
