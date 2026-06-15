import { PackageCheck, Clock, Ban, Repeat, Wallet, RefreshCw } from "lucide-react";
import { getPartialDeliveryStatus } from "@/cockpit/lib/article-states";
import type { OrderArticle } from "@/cockpit/lib/article-states";

/* ═══════════════════════════════════════════════════════════════
   PartialDeliveryBanner — vue d'ensemble article par article
   visible sans ouvrir les détails. Compteurs métier complets.
   ═══════════════════════════════════════════════════════════════ */

interface Props {
  articles: OrderArticle[] | undefined;
}

interface ChipDef {
  icon: React.ElementType;
  label: string;
  count: number;
  className: string;
}

export function PartialDeliveryBanner({ articles }: Props) {
  const s = getPartialDeliveryStatus(articles);
  if (!s.active) return null;

  const chips: ChipDef[] = [
    { icon: PackageCheck, label: "livré", count: s.deliveredCount, className: "bg-emerald-100 text-emerald-800" },
    { icon: PackageCheck, label: "prêt", count: s.readyToShipCount, className: "bg-teal-100 text-teal-800" },
    { icon: Clock, label: "réappro", count: s.waitingRestock, className: "bg-slate-200 text-slate-800" },
    { icon: Ban, label: "exclu", count: s.excludedCount, className: "bg-gray-800 text-white" },
    { icon: Repeat, label: "remplacé", count: s.replacedCount, className: "bg-violet-100 text-violet-800" },
    { icon: Wallet, label: "remb.", count: s.refundedCount, className: "bg-rose-100 text-rose-800" },
    { icon: RefreshCw, label: "avoir", count: s.creditedCount, className: "bg-amber-100 text-amber-800" },
  ].filter(c => c.count > 0);

  return (
    <div className="border-2 border-teal-300 bg-teal-50 rounded-xl p-3 space-y-2">
      <div className="flex items-start gap-3">
        <div className="shrink-0 h-10 w-10 rounded-full bg-teal-500 text-white grid place-items-center">
          <PackageCheck className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-teal-900">Livraison partielle en cours</div>
          <div className="text-[11px] text-teal-800/80 mt-0.5">
            {s.deliveredCount + s.pendingCount} article{s.deliveredCount + s.pendingCount > 1 ? "s" : ""} ·
            {" "}
            {s.pendingCount} restant{s.pendingCount > 1 ? "s" : ""} à traiter
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c, i) => {
          const Icon = c.icon;
          return (
            <span key={i} className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${c.className}`}>
              <Icon className="h-3 w-3" />
              {c.count} {c.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
