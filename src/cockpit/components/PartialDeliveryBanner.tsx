// @cockpit-status: active — alimenté par l'agrégateur (agg.counters / agg.by_bucket).
// Le calcul legacy getPartialDeliveryStatus() reste disponible en fallback tant
// que tous les call-sites n'ont pas migré.
import { PackageCheck, Clock, Ban, Wallet, RefreshCw, ShoppingCart } from "lucide-react";
import { getPartialDeliveryStatus } from "@/cockpit/lib/article-states";
import type { OrderArticle, StockBreakAction } from "@/cockpit/lib/article-states";
import type { OrderAggregate } from "@/cockpit/lib/order-aggregate";

/* ═══════════════════════════════════════════════════════════════
   PartialDeliveryBanner — vue d'ensemble du colis
   Si `aggregate` est fourni, on lit l'agrégateur. Sinon on retombe
   sur le calcul legacy (pour les écrans pas encore migrés).
   ═══════════════════════════════════════════════════════════════ */

interface Props {
  articles: OrderArticle[] | undefined;
  aggregate?: OrderAggregate;
}

interface ChipDef {
  icon: React.ElementType;
  label: string;
  count: number;
  className: string;
}

interface BannerData {
  active: boolean;
  total: number;
  pending: number;
  chips: ChipDef[];
}

function buildFromAggregate(agg: OrderAggregate): BannerData {
  const c = agg.counters;
  const total = c.ready + c.delivered + c.cancelled + c.in_progress
    + c.blocked + c.waiting_supplier + c.waiting_restock + c.waiting_money;
  const pending = total - c.delivered - c.cancelled;
  const active = c.delivered > 0 && pending > 0;

  // Compteurs financiers depuis le bucket waiting_money
  let refund = 0, credit = 0;
  for (const row of agg.by_bucket.waiting_money) {
    const k = row.article.stock_break?.action as StockBreakAction | undefined;
    if (k === "refund") refund++;
    else if (k === "credit") credit++;
  }

  const chips: ChipDef[] = [
    { icon: PackageCheck, label: "livré",     count: c.delivered,        className: "bg-emerald-100 text-emerald-800" },
    { icon: PackageCheck, label: "prêt",      count: c.ready,            className: "bg-teal-100 text-teal-800" },
    { icon: ShoppingCart, label: "import",    count: c.waiting_supplier, className: "bg-blue-100 text-blue-800" },
    { icon: Clock,        label: "réappro",   count: c.waiting_restock,  className: "bg-slate-200 text-slate-800" },
    { icon: Ban,          label: "exclu",     count: c.cancelled,        className: "bg-gray-800 text-white" },
    { icon: Wallet,       label: "remb.",     count: refund,             className: "bg-rose-100 text-rose-800" },
    { icon: RefreshCw,    label: "avoir",     count: credit,             className: "bg-amber-100 text-amber-800" },
  ].filter(x => x.count > 0);

  return { active, total, pending, chips };
}

function buildFromLegacy(articles: OrderArticle[] | undefined): BannerData {
  const s = getPartialDeliveryStatus(articles);
  const chips: ChipDef[] = [
    { icon: PackageCheck, label: "livré",     count: s.deliveredCount,    className: "bg-emerald-100 text-emerald-800" },
    { icon: PackageCheck, label: "prêt",      count: s.readyToShipCount,  className: "bg-teal-100 text-teal-800" },
    { icon: Clock,        label: "réappro",   count: s.waitingRestock,    className: "bg-slate-200 text-slate-800" },
    { icon: Ban,          label: "exclu",     count: s.excludedCount,     className: "bg-gray-800 text-white" },
    { icon: Wallet,       label: "remb.",     count: s.refundedCount,     className: "bg-rose-100 text-rose-800" },
    { icon: RefreshCw,    label: "avoir",     count: s.creditedCount,     className: "bg-amber-100 text-amber-800" },
  ].filter(x => x.count > 0);
  return {
    active: s.active,
    total: s.deliveredCount + s.pendingCount,
    pending: s.pendingCount,
    chips,
  };
}

export function PartialDeliveryBanner({ articles, aggregate }: Props) {
  const data = aggregate ? buildFromAggregate(aggregate) : buildFromLegacy(articles);
  if (!data.active) return null;

  return (
    <div className="border-2 border-teal-300 bg-teal-50 rounded-xl p-3 space-y-2">
      <div className="flex items-start gap-3">
        <div className="shrink-0 h-10 w-10 rounded-full bg-teal-500 text-white grid place-items-center">
          <PackageCheck className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-teal-900">Livraison partielle en cours</div>
          <div className="text-[11px] text-teal-800/80 mt-0.5">
            {data.total} article{data.total > 1 ? "s" : ""} ·{" "}
            {data.pending} restant{data.pending > 1 ? "s" : ""} à traiter
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {data.chips.map((c, i) => {
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
