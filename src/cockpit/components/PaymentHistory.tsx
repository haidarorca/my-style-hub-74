// @ts-nocheck
import { CreditCard, Calendar, User } from "lucide-react";
import type { PaymentRecord } from "@/cockpit/hooks/useRealOrders";
import { fmtF } from "@/cockpit/lib/workflow";

interface Props {
  payments: PaymentRecord[];
}

export function PaymentHistory({ payments }: Props) {
  if (payments.length === 0) {
    return <div className="text-xs text-gray-400 py-2">Aucun paiement enregistre</div>;
  }

  return (
    <div className="space-y-2">
      {payments.map((p) => {
        const date = new Date(p.timestamp);
        return (
          <div key={p.id} className="bg-white border rounded-lg p-2.5 text-sm">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Calendar className="h-3 w-3" />
                {date.toLocaleDateString("fr-FR")} - {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </div>
              <div className="font-bold text-emerald-700">{fmtF(p.amount)}</div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium">{p.method}</span>
              {p.reference && <span className="text-gray-500">Ref: {p.reference}</span>}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-0.5">
              <User className="h-3 w-3" />
              {p.adminName}
            </div>
          </div>
        );
      })}
    </div>
  );
}
