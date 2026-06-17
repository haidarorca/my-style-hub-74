// @ts-nocheck
import { Badge } from "@/components/ui/badge";
import type { OrderWithDetails } from "@/admin1/types/admin1";
import { STATUS_COLORS, STATUS_LABELS, fmtF } from "@/admin1/lib/admin1.config";
import { ChevronRight, Phone, User } from "lucide-react";

interface Props {
  orders: OrderWithDetails[];
  onSelect: (order: OrderWithDetails) => void;
}

export function OrderTable({ orders, onSelect }: Props) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Aucune commande.
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {orders.map((order) => (
        <button
          key={order.id}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
          onClick={() => onSelect(order)}
        >
          {/* Numero + Type */}
          <div className="shrink-0 w-14">
            <div className="font-mono text-xs font-bold text-gray-700">{order.order_number}</div>
            <Badge variant="outline" className="text-[8px] h-4 px-1 mt-0.5">
              {order.order_type.toUpperCase()}
            </Badge>
          </div>

          {/* Client */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-medium truncate">
              <User className="h-3 w-3 text-gray-400 shrink-0" />
              <span className="truncate">{order.customer_name}</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-gray-500">
              <Phone className="h-3 w-3" />
              {order.customer_phone}
            </div>
          </div>

          {/* Montants */}
          <div className="shrink-0 text-right">
            <div className="text-sm font-semibold">{fmtF(order.total_due)}</div>
            {order.balance > 0 ? (
              <div className="text-xs text-red-500">Reste: {fmtF(order.balance)}</div>
            ) : (
              <div className="text-xs text-emerald-500">Paye</div>
            )}
          </div>

          {/* Statut + Fleche */}
          <div className="shrink-0 flex items-center gap-1">
            <Badge variant="outline" className={`text-[8px] h-5 px-1 ${STATUS_COLORS[order.status]}`}>
              {STATUS_LABELS[order.status]}
            </Badge>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </div>
        </button>
      ))}
    </div>
  );
}
