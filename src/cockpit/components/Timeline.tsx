import { Package, CheckCircle, CreditCard, Truck, XCircle, UserCheck, AlertCircle, Scale } from "lucide-react";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";
import type { PaymentRecord, AuditEntry } from "@/cockpit/types";

interface Props {
  order: LogisticsOrderRow;
  payments: PaymentRecord[];
  audit: AuditEntry[];
}

export function Timeline({ order, payments, audit }: Props) {
  const events: { date: string | null | undefined; label: string; sub?: string | null; icon: any; color: string; bg: string }[] = [];

  if (order.order_created_at) events.push({ date: order.order_created_at, label: "Commande créée", sub: "Système", icon: Package, color: "text-gray-600", bg: "bg-gray-100" });

  const confirmAudit = audit.find(a => a.action.includes("confirm"));
  if (confirmAudit || order.logistics_status === "confirmed") events.push({ date: confirmAudit?.timestamp ?? order.updated_at ?? order.order_created_at, label: "Confirmée", sub: confirmAudit?.adminName, icon: CheckCircle, color: "text-blue-600", bg: "bg-blue-100" });

  const weighAudit = audit.find(a => a.action.includes("pesée"));
  if (order.real_weight_kg || weighAudit) events.push({ date: weighAudit?.timestamp ?? order.updated_at, label: `Pesée: ${order.real_weight_kg ?? "?"}kg`, sub: weighAudit?.adminName, icon: Scale, color: "text-orange-600", bg: "bg-orange-100" });

  if (order.total_shipping_fees) events.push({ date: order.updated_at ?? order.order_created_at, label: "Fret calculé", sub: fmtF(order.total_shipping_fees), icon: CreditCard, color: "text-indigo-600", bg: "bg-indigo-100" });

  const sortedPay = [...payments].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  sortedPay.forEach((p, i) => events.push({ date: p.timestamp, label: `Paiement ${i + 1}: ${fmtF(p.amount)}`, sub: `${p.method}${p.reference ? " (" + p.reference + ")" : ""} — ${p.adminName}`, icon: CreditCard, color: "text-emerald-600", bg: "bg-emerald-100" }));

  const shipAudit = audit.find(a => a.action.includes("expédiée") || a.action.includes("shipped"));
  if (order.logistics_status === "shipped" || shipAudit) events.push({ date: order.shipped_at ?? shipAudit?.timestamp ?? order.updated_at, label: "Expédiée", sub: shipAudit?.adminName ?? order.tracking_number, icon: Truck, color: "text-indigo-600", bg: "bg-indigo-100" });

  const delAudit = audit.find(a => a.action.includes("livrée") || a.action.includes("delivered"));
  if (order.logistics_status === "delivered" || delAudit) events.push({ date: delAudit?.timestamp ?? order.updated_at, label: "Livrée", sub: delAudit?.adminName, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-100" });

  const cancelAudit = audit.find(a => a.action.includes("annul"));
  if (order.logistics_status === "cancelled" || cancelAudit) events.push({ date: cancelAudit?.timestamp ?? order.updated_at, label: "Annulée", sub: cancelAudit?.adminName, icon: XCircle, color: "text-red-600", bg: "bg-red-100" });

  events.sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime());
  if (events.length === 0) return <div className="text-xs text-gray-400 py-2 text-center">Aucun événement</div>;

  return (
    <div className="space-y-0">
      {events.map((e, i) => {
        const d = new Date(e.date ?? 0);
        const Icon = e.icon;
        return (
          <div key={i} className="flex gap-3 py-1.5">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full ${e.bg} flex items-center justify-center ${e.color}`}><Icon className="h-3.5 w-3.5" /></div>
              {i < events.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 my-1" />}
            </div>
            <div className="flex-1 pb-2">
              <div className="text-sm font-medium">{e.label}</div>
              {e.sub && <div className="text-[11px] text-gray-500">{e.sub}</div>}
              <div className="text-[10px] text-gray-400">{d.toLocaleDateString("fr-FR")} — {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function fmtF(n: number): string { return n.toLocaleString("fr-FR") + " FCFA"; }
