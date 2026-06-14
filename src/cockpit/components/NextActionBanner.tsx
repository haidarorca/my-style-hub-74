import {
  AlertTriangle, Package, ShoppingCart, Phone, Search,
  Scale, Wallet, Truck, CheckCircle, CheckCircle2, PackageCheck,
} from "lucide-react";
import type { NextActionInfo } from "@/cockpit/lib/article-states";

const ICON_MAP: Record<string, React.ElementType> = {
  AlertTriangle, Package, ShoppingCart, Phone, Search,
  Scale, Wallet, Truck, CheckCircle, CheckCircle2, PackageCheck,
};

interface Props {
  action: NextActionInfo;
  onClick?: () => void;
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
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-full bg-white/80 flex items-center justify-center shrink-0`}>
          <Icon className={`h-5 w-5 ${action.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${action.color}`}>{action.label}</span>
            <span className="text-[9px] text-gray-400">— Action suivante</span>
          </div>
          <p className="text-[11px] text-gray-600 mt-0.5">{action.description}</p>
        </div>
      </div>
    </div>
  );
}
