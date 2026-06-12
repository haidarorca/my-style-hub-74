// @ts-nocheck
import { Clock, CheckCircle, CreditCard, Truck, Package, XCircle } from "lucide-react";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";
import type { PaymentRecord, AuditEntry } from "@/cockpit/hooks/useRealOrders";

interface Props {
  order: LogisticsOrderRow;
  payments: PaymentRecord[];
  audit: AuditEntry[];
}

export function Timeline({ order, payments, audit }: Props) {
  const events: { date: string; label: string; icon: any; color: string }[] = [];

  // Creation
  if (order.order_created_at) {
    events.push({ date: order.order_created_at, label: "Commande creee", icon: Package, color: "text-gray-500" });
  }

  // Confirmation
  if (order.logistics_status === "confirmed" || audit.some(a => a.action.includes("confirme"))) {
    const confirmDate = audit.find(a => a.action.includes("confirme"))?.timestamp;
    events.push({ date: confirmDate || order.updated_at, label: "Commande confirmee", icon: CheckCircle, color: "text-blue-500" });
  }

  // First payment
  const sortedPayments = [...payments].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  if (sortedPayments.length > 0) {
    events.push({ date: sortedPayments[0].timestamp, label: `Premier paiement: ${sortedPayments[0].amount.toLocaleString()} F`, icon: CreditCard, color: "text-emerald-500" });
  }

  // Last payment
  if (sortedPayments.length > 1) {
    const last = sortedPayments[sortedPayments.length - 1];
    events.push({ date: last.timestamp, label: `Dernier paiement: ${last.amount.toLocaleString()} F`, icon: CreditCard, color: "text-emerald-500" });
  }

  // Shipped
  if (order.shipped_at) {
    events.push({ date: order.shipped_at, label: "Commande expediee", icon: Truck, color: "text-indigo-500" });
  }

  // Delivered
  if (order.logistics_status === "delivered") {
    events.push({ date: order.updated_at, label: "Commande livree", icon: CheckCircle, color: "text-emerald-500" });
  }

  // Cancelled
  if (order.logistics_status === "cancelled") {
    events.push({ date: order.updated_at, label: "Commande annulee", icon: XCircle, color: "text-red-500" });
  }

  // Last action
  if (audit.length > 0) {
    const lastAudit = audit[0];
    events.push({ date: lastAudit.timestamp, label: `Action: ${lastAudit.action}`, icon: Clock, color: "text-amber-500" });
  }

  // Sort by date
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (events.length === 0) {
    return <div className="text-xs text-gray-400 py-2">Aucun evenement</div>;
  }

  return (
    <div className="space-y-0">
      {events.map((e, i) => {
        const date = new Date(e.date);
        const Icon = e.icon;
        return (
          <div key={i} className="flex gap-3 py-2">
            <div className="flex flex-col items-center">
              <div className={`w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center ${e.color}`}>
                <Icon className="h-3 w-3" />
              </div>
              {i < events.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 my-1" />}
            </div>
            <div className="flex-1 pb-3">
              <div className="text-sm font-medium">{e.label}</div>
              <div className="text-[10px] text-gray-500">
                {date.toLocaleDateString("fr-FR")} - {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
