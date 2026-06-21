// @cockpit-status: active — alimenté par l'agrégateur (buildNextActionBannerPayload).
// Accepte aussi la forme legacy NextActionInfo le temps de la transition.
import {
  AlertTriangle, Package, ShoppingCart, Phone, Search,
  Scale, Wallet, Truck, CheckCircle, CheckCircle2, PackageCheck,
  Target,
} from "lucide-react";
import type { NextActionInfo } from "@/cockpit/lib/article-states";
import type { NextActionBannerPayload } from "@/cockpit/lib/order-aggregate";

const ICON_MAP: Record<string, React.ElementType> = {
  AlertTriangle, Package, ShoppingCart, Phone, Search,
  Scale, Wallet, Truck, CheckCircle, CheckCircle2, PackageCheck,
};

interface Props {
  /** Payload du bandeau — accepte legacy (NextActionInfo) ou agrégateur (NextActionBannerPayload). */
  action: NextActionInfo | NextActionBannerPayload;
  onClick?: () => void;
}

function isAggregatePayload(a: NextActionInfo | NextActionBannerPayload): a is NextActionBannerPayload {
  return "why" in a || "driver_label" in a;
}

export function NextActionBanner({ action, onClick }: Props) {
  const Icon = ICON_MAP[action.icon] ?? Package;
  const clickable = !!onClick;

  return (
    <div
      className={`rounded-xl border p-3 ${action.bg} ${clickable ? "cursor-pointer hover:shadow-md transition-all" : ""}`}
      onClick={onClick}
      role={clickable ? "button" : undefined}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-white/80 flex items-center justify-center shrink-0">
          <Icon className={`h-5 w-5 ${action.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
            Prochaine action
          </div>
          <div className={`text-sm font-bold ${action.color} leading-tight`}>
            {action.label}
          </div>
          {action.description && (
            <div className="text-[11px] text-gray-600 mt-0.5 truncate">
              {action.description}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

