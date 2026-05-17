import { Package, CheckCircle2, Clock, XCircle, ShoppingBag, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { ShopOverview } from "@/lib/shop-management.functions";

interface Props {
  overview: ShopOverview | null;
  loading?: boolean;
}

function StatCard({
  icon: Icon, label, value, accent,
}: { icon: typeof Package; label: string; value: string | number; accent?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${accent ?? "bg-muted text-foreground"}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="truncate text-lg font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ShopOverviewCards({ overview, loading }: Props) {
  const v = overview;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <StatCard icon={Package} label="Produits" value={loading ? "…" : v?.total_products ?? 0} />
      <StatCard icon={CheckCircle2} label="Actifs" value={loading ? "…" : v?.active_products ?? 0} accent="bg-emerald-100 text-emerald-700" />
      <StatCard icon={Clock} label="En attente" value={loading ? "…" : v?.pending_products ?? 0} accent="bg-amber-100 text-amber-700" />
      <StatCard icon={XCircle} label="Refusés" value={loading ? "…" : v?.rejected_products ?? 0} accent="bg-rose-100 text-rose-700" />
      <StatCard icon={ShoppingBag} label="Ventes (30j)" value={loading ? "…" : v?.total_sales_30d ?? 0} accent="bg-sky-100 text-sky-700" />
      <StatCard icon={TrendingUp} label="CA (30j)" value={loading ? "…" : `${Math.round(v?.total_revenue_30d ?? 0).toLocaleString("fr-FR")} F`} accent="bg-violet-100 text-violet-700" />
    </div>
  );
}
