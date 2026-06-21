import { ClipboardList, AlertTriangle, Scale, PackageCheck, Truck, TrendingDown } from "lucide-react";
import { KPI_COLORS, KPI_LABELS, fmtF } from "@/cockpit/lib/workflow";
import { useFormatDisplay } from "@/hooks/use-currencies";
import type { KpiFilter } from "@/cockpit/types";

interface Props {
  newCount: number;
  pendingPayment: number;
  toWeigh: number;
  ready: number;
  shipped: number;
  totalDebt: number;
  activeFilter: KpiFilter;
  onFilter: (filter: KpiFilter) => void;
}

export function KpiCards({ newCount, pendingPayment, toWeigh, ready, shipped, totalDebt, activeFilter, onFilter }: Props) {
  const items = [
    { key: "new" as KpiFilter, count: newCount, icon: ClipboardList },
    { key: "payment_pending" as KpiFilter, count: pendingPayment, icon: AlertTriangle },
    { key: "to_weigh" as KpiFilter, count: toWeigh, icon: Scale },
    { key: "ready" as KpiFilter, count: ready, icon: PackageCheck },
    { key: "shipped" as KpiFilter, count: shipped, icon: Truck },
    { key: "debt" as KpiFilter, count: null, amount: totalDebt, icon: TrendingDown },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(item => {
        const isActive = activeFilter === item.key;
        const colors = KPI_COLORS[item.key ?? ""] ?? KPI_COLORS.new;
        return (
          <button
            key={item.key}
            onClick={() => onFilter(isActive ? null : item.key)}
            className={`${colors.bg} ${isActive ? "ring-2 ring-offset-1 ring-orange-400" : ""} border ${colors.border} rounded-lg p-2.5 text-center transition-all active:scale-95`}
          >
            <item.icon className={`h-4 w-4 ${colors.text} mx-auto mb-1`} />
            <div className={`text-[9px] font-semibold ${colors.text} leading-tight`}>{KPI_LABELS[item.key ?? ""]}</div>
            <div className={`text-lg font-bold ${colors.text}`}>
              {item.amount !== undefined ? fmtF(item.amount) : item.count}
            </div>
          </button>
        );
      })}
    </div>
  );
}
