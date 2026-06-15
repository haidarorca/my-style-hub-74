import { useRef, useCallback } from "react";
import { getOrderNumber } from "@/cockpit/lib/orderNumbers";
import { fmtF, fmtDateTime, STATUS_COLORS } from "@/cockpit/lib/workflow";
import { getOrderMixType } from "@/cockpit/lib/article-states";
import { Store, Layers } from "lucide-react";
import type { OrderArticle } from "@/cockpit/lib/article-states";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";
import type { SubOrderRow } from "@/cockpit/hooks/useSubOrderRows";

interface Props {
  orders: LogisticsOrderRow[];
  totalPaidMap: Record<string, number>;
  freightMap: Record<string, number>;
  onSelect: (o: LogisticsOrderRow) => void;
  articlesMap?: Record<string, OrderArticle[]>;
  orderTypeMap?: Record<string, "local" | "import" | "mixte">;
  /** Phase 2 : rangée par sous-commande boutique. Si fourni, prime sur `orders`. */
  subRows?: SubOrderRow[];
  onSelectSubRow?: (row: SubOrderRow) => void;
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
  { key: "in_progress", title: "En cours", short: "Cours", color: "border-t-cyan-500", bgColor: "bg-cyan-50", chipBg: "bg-cyan-100", chipText: "text-cyan-700", statuses: ["confirmed", "preparing", "ordered_supplier", "received_warehouse"] },
  { key: "to_weigh", title: "A peser", short: "Peser", color: "border-t-orange-500", bgColor: "bg-orange-50", chipBg: "bg-orange-100", chipText: "text-orange-700", statuses: ["awaiting_weighing"] },
  { key: "fees_calculated", title: "Calcul frais", short: "Frais", color: "border-t-pink-500", bgColor: "bg-pink-50", chipBg: "bg-pink-100", chipText: "text-pink-700", statuses: ["fees_calculated", "payment_fees"] },
  { key: "ready", title: "Prete", short: "Prete", color: "border-t-emerald-500", bgColor: "bg-emerald-50", chipBg: "bg-emerald-100", chipText: "text-emerald-700", statuses: ["ready", "ready_delivery"] },
  { key: "shipped", title: "Expediee", short: "Exped.", color: "border-t-indigo-500", bgColor: "bg-indigo-50", chipBg: "bg-indigo-100", chipText: "text-indigo-700", statuses: ["shipped"] },
];

export function PipelineView({ orders, totalPaidMap, freightMap, onSelect, articlesMap, orderTypeMap, subRows, onSelectSubRow }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Phase 2 : si on a des subRows, on les groupe par colonne via le statut de la mère.
  // Sinon fallback sur les commandes mères (Phase 1).
  const useSubMode = !!subRows && subRows.length > 0;

  const columnsWithItems = COLUMNS.map(col => {
    if (useSubMode) {
      return {
        ...col,
        subs: subRows!.filter(r => col.statuses.includes((r.order.logistics_status ?? "").trim())),
        orders: [] as LogisticsOrderRow[],
      };
    }
    return {
      ...col,
      subs: [] as SubOrderRow[],
      orders: orders.filter(o => col.statuses.includes((o.logistics_status ?? "").trim())),
    };
  });

  const columnsWithOrders = columnsWithItems; // alias for legacy chip count

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
          {columnsWithOrders.map(col => {
            const count = useSubMode ? col.subs.length : col.orders.length;
            return (
              <button
                key={col.key}
                onClick={() => scrollToColumn(col.key)}
                className={`snap-start flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-semibold ${col.chipBg} ${col.chipText} hover:opacity-80 active:scale-95 transition-all border border-transparent hover:border-current`}
              >
                <span className="w-2 h-2 rounded-full bg-current opacity-60" />
                {col.short}
                <span className="bg-white rounded-full px-1.5 py-0 text-[9px] font-bold">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Pipeline columns */}
      <div ref={scrollRef} className="flex gap-3 overflow-x-auto px-3 py-2 snap-x snap-mandatory" style={{ scrollbarWidth: "thin" }}>
        {columnsWithOrders.map(col => {
          const count = useSubMode ? col.subs.length : col.orders.length;
          return (
            <div
              key={col.key}
              ref={el => { if (el) colRefs.current.set(col.key, el); }}
              className={`flex-shrink-0 w-[260px] snap-start rounded-lg border ${col.color} border-t-4 bg-gray-50`}
            >
              {/* Header */}
              <div className={`px-3 py-2 ${col.bgColor} rounded-t-lg flex items-center justify-between`}>
                <span className="text-xs font-bold text-gray-700">{col.title}</span>
                <span className="text-xs bg-white rounded-full px-2 py-0.5 font-bold text-gray-600">{count}</span>
              </div>

              {/* Cards */}
              <div className="p-2 space-y-2 min-h-[100px]">
                {count === 0 ? (
                  <div className="text-[10px] text-gray-400 text-center py-4 italic">Vide</div>
                ) : useSubMode ? col.subs.map(row => {
                  const a = row.aggregate;
                  const blocked = a.counters.blocked > 0;
                  const money = a.pending_money.total_abs > 0;
                  const ready = a.flags.can_ship_today;
                  const kindClass =
                    row.kind === "local" ? "bg-emerald-100 text-emerald-700"
                    : row.kind === "import" ? "bg-indigo-100 text-indigo-700"
                    : "bg-slate-100 text-slate-700";
                  const kindLabel =
                    row.kind === "local" ? "LOC"
                    : row.kind === "import" ? "IMP"
                    : "MIX";
                  return (
                    <button
                      key={`${row.mother_order_id}-${row.vendor_id}`}
                      onClick={() => onSelectSubRow?.(row)}
                      className={`w-full bg-white rounded-md p-2.5 text-left shadow-sm hover:shadow-md transition-shadow border ${
                        blocked ? "border-red-300" : money ? "border-amber-300" : ready ? "border-emerald-300" : "border-gray-200"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-[10px] font-bold text-gray-800">{row.label}</span>
                        <span className={`text-[8px] px-1 py-0.5 rounded font-bold ${kindClass}`}>{kindLabel}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs font-bold truncate">
                        <Store className="h-3 w-3 text-gray-500 shrink-0" />
                        <span className="truncate">{row.vendor_name}</span>
                      </div>
                      <div className="text-[10px] text-gray-500 truncate">{row.order.customer_name ?? "—"}</div>
                      <div className="text-[10px] text-gray-400">{fmtDateTime(row.order.order_created_at)}</div>
                      <div className="mt-1 flex items-center justify-between border-t pt-1">
                        <span className="text-[9px] text-gray-500">{row.financials.article_count} art.</span>
                        <span className="text-[10px] font-bold">{fmtF(row.financials.product_total)}</span>
                      </div>
                      {row.total > 1 && (
                        <div className="text-[8px] text-indigo-600 font-bold mt-0.5 flex items-center gap-0.5">
                          <Layers className="h-2.5 w-2.5" />{row.index}/{row.total} boutiques
                        </div>
                      )}
                    </button>
                  );
                }) : col.orders.map(order => {
                  const kz = getOrderNumber(order.order_id ?? "");
                  const oid = order.order_id ?? "";
                  const art = articlesMap?.[oid];
                  const typeFromMap = orderTypeMap?.[oid] ?? (art ? getOrderMixType(art) : undefined);
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
                        <span className={`text-[8px] px-1 py-0.5 rounded ${imp ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"}`}>{imp ? "IMP" : "LOC"}</span>
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
          );
        })}
      </div>
    </div>
  );
}
