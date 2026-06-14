import { useRef, useCallback } from "react";
import { getOrderNumber } from "@/cockpit/lib/orderNumbers";
import { fmtF, fmtDateTime, STATUS_COLORS } from "@/cockpit/lib/workflow";
import { getOrderMixType } from "@/cockpit/lib/article-states";
import type { OrderArticle } from "@/cockpit/lib/article-states";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";

interface Props {
  orders: LogisticsOrderRow[];
  totalPaidMap: Record<string, number>;
  freightMap: Record<string, number>;
  onSelect: (o: LogisticsOrderRow) => void;
  articlesMap?: Record<string, OrderArticle[]>;
  orderTypeMap?: Record<string, "local" | "import" | "mixte">;
}

interface Column {
  key: string;
  title: string;
  short: string;
  color: string;
  bgColor: string;
  chipBg: string;
  chipText: string;
  statuses: string[];
}

const COLUMNS: Column[] = [
  { key: "new", title: "A confirmer", short: "Nouv.", color: "border-t-purple-500", bgColor: "bg-purple-50", chipBg: "bg-purple-100", chipText: "text-purple-700", statuses: ["", "new"] },
  { key: "contacted", title: "Contactee", short: "Contact.", color: "border-t-blue-500", bgColor: "bg-blue-50", chipBg: "bg-blue-100", chipText: "text-blue-700", statuses: ["contacted"] },
  { key: "awaiting_payment", title: "Paiement", short: "Paiemt.", color: "border-t-amber-500", bgColor: "bg-amber-50", chipBg: "bg-amber-100", chipText: "text-amber-700", statuses: ["awaiting_payment", "payment_fees"] },
  { key: "in_progress", title: "En cours", short: "Cours", color: "border-t-cyan-500", bgColor: "bg-cyan-50", chipBg: "bg-cyan-100", chipText: "text-cyan-700", statuses: ["confirmed", "preparing", "ordered_supplier", "received_warehouse"] },
  { key: "to_weigh", title: "A peser", short: "Peser", color: "border-t-orange-500", bgColor: "bg-orange-50", chipBg: "bg-orange-100", chipText: "text-orange-700", statuses: ["awaiting_weighing"] },
  { key: "fees_calculated", title: "Calcul frais", short: "Frais", color: "border-t-pink-500", bgColor: "bg-pink-50", chipBg: "bg-pink-100", chipText: "text-pink-700", statuses: ["fees_calculated"] },
  { key: "ready", title: "Prete", short: "Prete", color: "border-t-emerald-500", bgColor: "bg-emerald-50", chipBg: "bg-emerald-100", chipText: "text-emerald-700", statuses: ["ready", "ready_delivery"] },
  { key: "shipped", title: "Expediee", short: "Exped.", color: "border-t-indigo-500", bgColor: "bg-indigo-50", chipBg: "bg-indigo-100", chipText: "text-indigo-700", statuses: ["shipped"] },
];

export function PipelineView({ orders, totalPaidMap, freightMap, onSelect, articlesMap, orderTypeMap }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const columnsWithOrders = COLUMNS.map(col => ({
    ...col,
    orders: orders.filter(o => col.statuses.includes((o.logistics_status ?? "").trim())),
  }));

  const scrollToColumn = useCallback((key: string) => {
    const el = colRefs.current.get(key);
    if (el && scrollRef.current) {
      el.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    }
  }, []);

  return (
    <div className="space-y-2">
      {/* Navigation rapide */}
      <div className="px-3 pt-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1 snap-x snap-mandatory" style={{ scrollbarWidth: "none" }}>
          {columnsWithOrders.map(col => (
            <button
              key={col.key}
              onClick={() => scrollToColumn(col.key)}
              className={`snap-start flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-semibold ${col.chipBg} ${col.chipText} hover:opacity-80 active:scale-95 transition-all border border-transparent hover:border-current`}
            >
              <span className="w-2 h-2 rounded-full bg-current opacity-60" />
              {col.short}
              <span className="bg-white rounded-full px-1.5 py-0 text-[9px] font-bold">{col.orders.length}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Pipeline columns */}
      <div ref={scrollRef} className="flex gap-3 overflow-x-auto px-3 py-2 snap-x snap-mandatory" style={{ scrollbarWidth: "thin" }}>
        {columnsWithOrders.map(col => (
          <div
            key={col.key}
            ref={el => { if (el) colRefs.current.set(col.key, el); }}
            className={`flex-shrink-0 w-[260px] snap-start rounded-lg border ${col.color} border-t-4 bg-gray-50`}
          >
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
                const oid = order.order_id ?? "";
                const art = articlesMap?.[oid];
                // SEULE source de vérité : orderTypeMap (calculé depuis import_products).
                // Fallback sur articles si chargés, sinon "local" par défaut (le plus sûr).
                const typeFromMap = orderTypeMap?.[oid] ?? (art ? getOrderMixType(art) : undefined);
                const isMixte = typeFromMap === "mixte";
                const imp = typeFromMap === "import";
                const productTotal = order.order_total ?? 0;
                const freight = freightMap[oid] ?? order.total_shipping_fees ?? 0;
                const grandTotal = productTotal + freight;
                const paid = totalPaidMap[oid] ?? 0;
                const remaining = Math.max(0, grandTotal - paid);

                return (
                  <button key={order.order_id} onClick={() => onSelect(order)} className="w-full bg-white rounded-md p-2.5 text-left shadow-sm hover:shadow-md transition-shadow border border-gray-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[10px] font-bold text-gray-800">{kz}</span>
                      {isMixte ? (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-gradient-to-r from-indigo-100 to-emerald-100 text-indigo-700 font-bold">MIX</span>
                      ) : (
                        <span className={`text-[8px] px-1 py-0.5 rounded ${imp ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"}`}>{imp ? "IMP" : "LOC"}</span>
                      )}
                    </div>
                    <div className="text-xs font-medium truncate">{order.customer_name ?? "—"}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{fmtDateTime(order.order_created_at)}</div>

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
                        <div className="text-[9px] text-emerald-600 font-medium">Paye en totalite</div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
