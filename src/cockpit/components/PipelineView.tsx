import { getOrderNumber } from "@/cockpit/lib/orderNumbers";
import { fmtF, STATUS_COLORS, isImport } from "@/cockpit/lib/workflow";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";

interface Props {
  orders: LogisticsOrderRow[];
  totalPaidMap: Record<string, number>;
  onSelect: (o: LogisticsOrderRow) => void;
}

interface Column {
  key: string;
  title: string;
  color: string;
  bgColor: string;
  statuses: string[];
}

const COLUMNS: Column[] = [
  { key: "new", title: "À confirmer", color: "border-t-purple-500", bgColor: "bg-purple-50", statuses: ["", "new"] },
  { key: "contacted", title: "Contactée", color: "border-t-blue-500", bgColor: "bg-blue-50", statuses: ["contacted"] },
  { key: "awaiting_payment", title: "Paiement attendu", color: "border-t-amber-500", bgColor: "bg-amber-50", statuses: ["awaiting_payment"] },
  { key: "in_progress", title: "En cours", color: "border-t-cyan-500", bgColor: "bg-cyan-50", statuses: ["confirmed", "preparing", "ordered_supplier", "received_warehouse", "in_transit", "arrived_senegal"] },
  { key: "to_weigh", title: "À peser", color: "border-t-orange-500", bgColor: "bg-orange-50", statuses: ["awaiting_weighing"] },
  { key: "fees_validation", title: "Fret / Validation", color: "border-t-pink-500", bgColor: "bg-pink-50", statuses: ["fees_calculated", "awaiting_client_validation", "payment_fees"] },
  { key: "ready", title: "Prête", color: "border-t-emerald-500", bgColor: "bg-emerald-50", statuses: ["ready", "ready_delivery"] },
  { key: "shipped", title: "Expédiée", color: "border-t-indigo-500", bgColor: "bg-indigo-50", statuses: ["shipped"] },
];

export function PipelineView({ orders, totalPaidMap, onSelect }: Props) {
  // Distribuer les commandes dans les colonnes
  const columnsWithOrders = COLUMNS.map(col => ({
    ...col,
    orders: orders.filter(o => col.statuses.includes((o.logistics_status ?? "").trim())),
  }));

  return (
    <div className="flex gap-3 overflow-x-auto px-3 py-3 snap-x snap-mandatory" style={{ scrollbarWidth: "thin" }}>
      {columnsWithOrders.map(col => (
        <div key={col.key} className={`flex-shrink-0 w-[260px] snap-start rounded-lg border ${col.color} border-t-4 bg-gray-50`}>
          {/* Header */}
          <div className={`px-3 py-2 ${col.bgColor} rounded-t-lg flex items-center justify-between`}>
            <span className="text-xs font-bold text-gray-700">{col.title}</span>
            <span className="text-xs bg-white rounded-full px-2 py-0.5 font-bold text-gray-600">{col.orders.length}</span>
          </div>
          {/* Cards */}
          <div className="p-2 space-y-2 min-h-[100px]">
            {col.orders.length === 0 ? (
              <div className="text-[10px] text-gray-400 text-center py-4 italic">Vide</div>
            ) : col.orders.map(order => {
              const kz = getOrderNumber(order.order_id ?? "");
              const imp = isImport(order);
              const grandTotal = (order.order_total ?? 0) + (order.total_shipping_fees ?? 0);
              const paid = totalPaidMap[order.order_id ?? ""] ?? 0;
              const remaining = Math.max(0, grandTotal - paid);
              return (
                <button key={order.order_id} onClick={() => onSelect(order)} className="w-full bg-white rounded-md p-2.5 text-left shadow-sm hover:shadow-md transition-shadow border border-gray-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[10px] font-bold text-gray-800">{kz}</span>
                    <span className={`text-[8px] px-1 py-0.5 rounded ${imp ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"}`}>{imp ? "IMP" : "LOC"}</span>
                  </div>
                  <div className="text-xs font-medium truncate">{order.customer_name ?? "—"}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] font-bold">{fmtF(order.order_total ?? 0)}</span>
                    {remaining > 0 && <span className="text-[9px] text-red-500">{fmtF(remaining)}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
