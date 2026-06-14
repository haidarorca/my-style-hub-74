import { getOrderNumber } from "@/cockpit/lib/orderNumbers";
import { fmtF, fmtDateTime, STATUS_COLORS, isImport } from "@/cockpit/lib/workflow";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";

interface Props {
  orders: LogisticsOrderRow[];
  totalPaidMap: Record<string, number>;
  freightMap: Record<string, number>;
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
  { key: "awaiting_payment", title: "Paiement", color: "border-t-amber-500", bgColor: "bg-amber-50", statuses: ["awaiting_payment", "payment_fees"] },
  { key: "in_progress", title: "En cours", color: "border-t-cyan-500", bgColor: "bg-cyan-50", statuses: ["confirmed", "preparing", "ordered_supplier", "received_warehouse"] },
  { key: "to_weigh", title: "À peser", color: "border-t-orange-500", bgColor: "bg-orange-50", statuses: ["awaiting_weighing"] },
  { key: "fees_calculated", title: "Calcul frais", color: "border-t-pink-500", bgColor: "bg-pink-50", statuses: ["fees_calculated"] },
  { key: "ready", title: "Prête", color: "border-t-emerald-500", bgColor: "bg-emerald-50", statuses: ["ready", "ready_delivery"] },
  { key: "shipped", title: "Expédiée", color: "border-t-indigo-500", bgColor: "bg-indigo-50", statuses: ["shipped"] },
];

export function PipelineView({ orders, totalPaidMap, freightMap, onSelect }: Props) {
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
              const oid = order.order_id ?? "";
              const productTotal = order.order_total ?? 0;
              const freight = freightMap[oid] ?? order.total_shipping_fees ?? 0;
              const grandTotal = productTotal + freight;
              const paid = totalPaidMap[oid] ?? 0;
              const remaining = Math.max(0, grandTotal - paid);
              return (
                <button key={order.order_id} onClick={() => onSelect(order)} className="w-full bg-white rounded-md p-2.5 text-left shadow-sm hover:shadow-md transition-shadow border border-gray-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[10px] font-bold text-gray-800">{kz}</span>
                    <span className={`text-[8px] px-1 py-0.5 rounded ${imp ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"}`}>{imp ? "IMP" : "LOC"}</span>
                  </div>
                  <div className="text-xs font-medium truncate">{order.customer_name ?? "—"}</div>
                  <div className="text-[9px] text-gray-400 mt-0.5 flex items-center gap-1">
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {fmtDateTime(order.order_created_at)}
                  </div>
                  {/* Décomposition des montants */}
                  <div className="mt-1 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-gray-500">Produit</span>
                      <span className="text-[10px] font-medium">{fmtF(productTotal)}</span>
                    </div>
                    {freight > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-orange-500">Fret</span>
                        <span className="text-[10px] font-medium text-orange-600">{fmtF(freight)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between border-t pt-0.5">
                      <span className="text-[9px] font-bold">Total</span>
                      <span className="text-[10px] font-bold">{fmtF(grandTotal)}</span>
                    </div>
                    {remaining > 0 ? (
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-gray-400">Reste</span>
                        <span className="text-[9px] text-red-500 font-medium">{fmtF(remaining)}</span>
                      </div>
                    ) : paid > 0 ? (
                      <div className="text-[9px] text-emerald-600 font-medium">Payé en totalité</div>
                    ) : null}
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