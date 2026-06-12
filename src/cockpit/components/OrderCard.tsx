// @ts-nocheck
import { Badge } from "@/components/ui/badge";
import { Phone, MapPin } from "lucide-react";
import { STATUS_LABELS, STATUS_COLORS, fmtF, mapStatus } from "@/cockpit/lib/workflow";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";

interface Props {
  order: LogisticsOrderRow;
  index: number;
  onClick: () => void;
}

export function OrderCard({ order, index, onClick }: Props) {
  const status = mapStatus(order);
  const remaining = order.amount_remaining ?? 0;
  const isLocal = !order.shipping_service_id && order.order_type !== "import";

  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 text-left transition-colors"
    >
      {/* Numero */}
      <div className="shrink-0 w-12">
        <div className="font-mono text-sm font-bold text-gray-800">#{index + 1}</div>
        <div className="text-[9px] text-gray-400 truncate">{order.order_id?.slice(-6)}</div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-sm font-semibold truncate">{order.customer_name ?? "—"}</span>
          <Badge variant="outline" className={`text-[8px] h-4 px-1 ${isLocal ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"}`}>
            {isLocal ? "LOCAL" : "IMPORT"}
          </Badge>
        </div>

        {order.customer_phone && (
          <div className="flex items-center gap-1 text-[11px] text-gray-500">
            <Phone className="h-3 w-3" />
            {order.customer_phone}
          </div>
        )}

        {order.destination_address && (
          <div className="flex items-center gap-1 text-[11px] text-gray-400 truncate">
            <MapPin className="h-3 w-3" />
            {order.destination_address}
          </div>
        )}
      </div>

      {/* Montant + Statut */}
      <div className="shrink-0 text-right">
        <div className="text-sm font-bold">{fmtF(order.order_total)}</div>
        {remaining > 0 ? (
          <div className="text-xs text-red-500 font-medium">Reste: {fmtF(remaining)}</div>
        ) : (
          <div className="text-xs text-emerald-500">Paye</div>
        )}
        <Badge variant="outline" className={`text-[8px] h-4 px-1 mt-1 ${STATUS_COLORS[status]}`}>
          {STATUS_LABELS[status]}
        </Badge>
      </div>
    </button>
  );
}
