// @ts-nocheck
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OrderWithDetails } from "@/admin1/types/admin1";
import { STATUS_COLORS, STATUS_LABELS, fmtF } from "@/admin1/lib/admin1.config";
import { ChevronRight, Phone } from "lucide-react";

interface Props {
  orders: OrderWithDetails[];
  onSelect: (order: OrderWithDetails) => void;
}

export function OrderTable({ orders, onSelect }: Props) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Aucune commande dans cette categorie.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Header desktop */}
      <div
        className="hidden lg:grid items-center gap-2 px-3 py-1.5 text-[10px] uppercase font-semibold text-muted-foreground border-b"
        style={{ gridTemplateColumns: "60px 1fr 100px 100px 100px 80px 28px" }}
      >
        <div>N°</div>
        <div>Client</div>
        <div className="text-right">Montant</div>
        <div className="text-right">Paye</div>
        <div className="text-right">Solde</div>
        <div className="text-center">Statut</div>
        <div></div>
      </div>

      {orders.map((order) => (
        <div
          key={order.id}
          className="group border-b border-gray-100 hover:bg-gray-50 transition-colors"
        >
          {/* Desktop */}
          <div
            className="hidden lg:grid items-center gap-2 px-3 py-2 cursor-pointer"
            style={{ gridTemplateColumns: "60px 1fr 100px 100px 100px 80px 28px" }}
            onClick={() => onSelect(order)}
          >
            <div className="font-mono text-xs font-bold text-gray-700">{order.order_number}</div>
            <div>
              <div className="text-sm font-medium truncate">{order.customer_name}</div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Phone className="h-3 w-3" /> {order.customer_phone}
              </div>
            </div>
            <div className="text-right text-sm font-medium">{fmtF(order.total_due)}</div>
            <div className="text-right text-sm text-emerald-600">{fmtF(order.total_paid)}</div>
            <div className="text-right text-sm font-medium">
              {order.balance > 0 ? (
                <span className="text-red-600">{fmtF(order.balance)}</span>
              ) : (
                <span className="text-emerald-600">OK</span>
              )}
            </div>
            <div className="text-center">
              <Badge variant="outline" className={`text-[9px] ${STATUS_COLORS[order.status]}`}>
                {STATUS_LABELS[order.status]}
              </Badge>
            </div>
            <div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-gray-900 transition-colors" />
            </div>
          </div>

          {/* Mobile */}
          <div className="lg:hidden p-3 cursor-pointer" onClick={() => onSelect(order)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold">{order.order_number}</span>
                <Badge variant="outline" className={`text-[9px] ${STATUS_COLORS[order.status]}`}>
                  {STATUS_LABELS[order.status]}
                </Badge>
              </div>
              <span className="text-sm font-medium">{fmtF(order.total_due)}</span>
            </div>
            <div className="text-sm mt-0.5">{order.customer_name}</div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{order.customer_phone}</span>
              {order.balance > 0 ? (
                <span className="text-red-600">Reste: {fmtF(order.balance)}</span>
              ) : (
                <span className="text-emerald-600">Paye</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
