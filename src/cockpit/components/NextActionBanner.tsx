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
  const enriched = isAggregatePayload(action) ? action : null;

  return (
    <div
      className={`rounded-xl border p-3 ${action.bg} ${clickable ? "cursor-pointer hover:shadow-md transition-all" : ""}`}
      onClick={onClick}
      role={clickable ? "button" : undefined}
    >
      <div className="flex items-start gap-2.5">
        <div className={`w-9 h-9 rounded-full bg-white/80 flex items-center justify-center shrink-0`}>
          <Icon className={`h-5 w-5 ${action.color}`} />
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${action.color}`}>{action.label}</span>
            <span className="text-[9px] text-gray-400">— Action suivante</span>
          </div>
          <p className="text-[11px] text-gray-700">{action.description}</p>

          {/* Enrichissements agrégateur : pourquoi + article moteur */}
          {enriched?.why && (
            <p className="text-[10px] text-gray-500 italic border-l-2 border-gray-300/60 pl-1.5 mt-1">
              Pourquoi : {enriched.why}
            </p>
          )}
          {enriched?.driver_label && (
            <div className="flex items-center gap-1 mt-1 text-[10px] text-gray-700">
              <Target className="h-3 w-3 opacity-70" />
              <span className="font-semibold">Article moteur :</span>
              <span className="truncate">{enriched.driver_label}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
