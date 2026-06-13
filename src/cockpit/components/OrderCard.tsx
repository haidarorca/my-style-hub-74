import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, MapPin, Package, Clock, AlertTriangle } from "lucide-react";
import { STATUS_LABELS, STATUS_COLORS, fmtF, isImport, getImportStepIndex, IMPORT_STEPS } from "@/cockpit/lib/workflow";
import { getOrderNumber } from "@/cockpit/lib/orderNumbers";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";

interface QuickAction {
  label: string;
  color: string;
  onClick: (e: React.MouseEvent) => void;
}

interface Props {
  order: LogisticsOrderRow;
  index: number;
  onClick: () => void;
  totalPaid?: number;
  freight?: number;
  grandTotal?: number;
  quickAction?: QuickAction;
}

export function OrderCard({ order, index, onClick, totalPaid, freight, grandTotal: gtProp, quickAction }: Props) {
  const imp = isImport(order);
  const status = order.logistics_status ?? "new";
  const kz = getOrderNumber(order.order_id ?? "");
  const productTotal = order.order_total ?? 0;
  const actualFreight = freight ?? order.total_shipping_fees ?? 0;
  const grandTotal = gtProp ?? productTotal + actualFreight;
  const paid = totalPaid ?? 0;
  const remaining = Math.max(0, grandTotal - paid);
  const stepIdx = imp ? getImportStepIndex(status) : -1;
  const label = STATUS_LABELS[status] ?? status;

  // Age de la commande en jours
  const ageDays = Math.floor((Date.now() - new Date(order.order_created_at ?? Date.now()).getTime()) / (1000 * 60 * 60 * 24));
  // Alertes: > 7 jours = warning, > 14 jours = danger (sauf si livree/annulee)
  const isBlocked = ageDays > 7 && status !== "delivered" && status !== "cancelled";
  const isUrgent = ageDays > 14 && status !== "delivered" && status !== "cancelled";

  return (
    <button onClick={onClick} className="w-full flex items-start gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 text-left transition-colors">
      <div className="shrink-0 w-16">
        <div className="font-mono text-[11px] font-bold text-gray-800">{kz}</div>
        <div className="text-[9px] text-gray-400">{order.order_id?.slice(-4)}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-sm font-semibold truncate">{order.customer_name ?? "—"}</span>
          <Badge variant="outline" className={`text-[8px] h-4 px-1 ${imp ? "bg-indigo-50 text-indigo-700" : "bg-emerald-50 text-emerald-700"}`}>
            {imp ? "IMPORT" : "LOCAL"}
          </Badge>
        </div>
        {order.customer_phone && <div className="flex items-center gap-1 text-[11px] text-gray-500"><Phone className="h-3 w-3" />{order.customer_phone}</div>}
        {order.destination_address && <div className="flex items-center gap-1 text-[11px] text-gray-400 truncate"><MapPin className="h-3 w-3" />{order.destination_address}</div>}
        {imp && stepIdx >= 0 && (
          <div className="flex items-center gap-1 mt-1">
            <Package className="h-3 w-3 text-indigo-400" />
            <span className="text-[10px] text-indigo-600 font-medium">{stepIdx + 1}/{IMPORT_STEPS.length} {IMPORT_STEPS[stepIdx]?.label}</span>
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-bold">{fmtF(grandTotal)}</div>
        {remaining > 0 ? <div className="text-xs text-red-500 font-medium">Reste {fmtF(remaining)}</div> : grandTotal > 0 ? <div className="text-xs text-emerald-500">Payé</div> : null}
        <div className="flex items-center justify-end gap-1 mt-1">
          <Badge variant="outline" className={`text-[8px] h-4 px-1 ${STATUS_COLORS[status] ?? ""}`}>{label}</Badge>
          {isUrgent && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
          {isBlocked && !isUrgent && <Clock className="h-3.5 w-3.5 text-amber-500" />}
        </div>
        <div className="text-[9px] text-gray-400 mt-0.5">{ageDays}j</div>
        {quickAction && (
          <Button size="sm" className={`mt-1.5 h-7 text-[10px] px-2 ${quickAction.color}`} onClick={quickAction.onClick}>
            {quickAction.label}
          </Button>
        )}
      </div>
    </button>
  );
}