import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getAdminStats } from "@/lib/admin-stats.functions";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ShoppingBag,
  PackageCheck,
  Flag,
  ArrowRight,
  Wallet,
  Users,
  Truck,
  HeadphonesIcon,
  MessageSquare,
  FolderTree,
  LayoutDashboard,
  BarChart3,
} from "lucide-react";
import { TranslationSyncCard } from "@/components/admin/TranslationSyncCard";
import { UpdateAppButton } from "@/components/UpdateAppButton";

export const Route = createFileRoute("/admin/")({
  component: Dashboard,
});

/* ── Generic count helper (eq or in) ─────────────────────── */
function useCount(
  table: string,
  filter?: { col: string; val: string } | { col: string; in: string[] }
) {
  return useQuery({
    queryKey: ["count", table, JSON.stringify(filter)],
    queryFn: async () => {
      try {
        let q = supabase
          .from(table as never)
          .select("id", { count: "exact", head: true });
        if (filter && "val" in filter) {
          q = (
            q as never as { eq: (c: string, v: string) => typeof q }
          ).eq(filter.col, filter.val);
        } else if (filter && "in" in filter) {
          q = (
            q as never as { in: (c: string, v: string[]) => typeof q }
          ).in(filter.col, filter.in);
        }
        const { count, error } = await q;
        if (error) throw error;
        return count ?? 0;
      } catch (err) {
        console.warn(`[admin] count(${table}) failed:`, err);
        return 0;
      }
    },
    staleTime: 60_000,
    retry: 1,
  });
}

/* ── Compact action card ─────────────────────────────────── */
function ActionCard({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  count,
  to,
  visible = true,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  title: string;
  count: number;
  to: string;
  visible?: boolean;
}) {
  if (!visible || count === 0) return null;
  return (
    <Card className="border-border/60 transition-shadow hover:shadow-sm">
      <CardContent className="flex items-center gap-2 p-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconBg}`}
        >
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
        <div className="min-w-0 flex-1 text-sm font-medium truncate">
          {count} {title}
        </div>
        <Button asChild size="sm" variant="secondary" className="h-7 text-xs">
          <Link to={to}>
            Ouvrir <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/* ── KPI tile component ──────────────────────────────────── */
function KpiTile({
  label,
  value,
  icon: Icon,
  iconColor,
}: {
  label: string;
  value: number | string | undefined;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="text-2xl font-bold tabular-nums">
          {value ?? "—"}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Shortcut card component ─────────────────────────────── */
function ShortcutCard({
  icon: Icon,
  label,
  to,
  iconColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  to: string;
  iconColor: string;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-card p-4 text-center transition-all hover:border-primary/40 hover:shadow-sm"
    >
      <Icon className={`h-6 w-6 ${iconColor}`} />
      <span className="text-xs font-medium">{label}</span>
    </Link>
  );
}

/* ── Main Dashboard ──────────────────────────────────────── */
function Dashboard() {
  const { isSuperAdmin } = useAuth();
  const fetchStats = useServerFn(getAdminStats);

  /* ── Cached overview stats ── */
  const stats = useQuery({
    queryKey: ["admin", "stats", "overview"],
    queryFn: () => fetchStats(),
    staleTime: 60_000,
  });

  /* ── SECTION 1 : KPI Actions (requiring human intervention) ── */
  const newOrders = useCount("orders", { col: "status", val: "new" });
  const pendingProducts = useCount("products", {
    col: "status",
    val: "pending",
  });
  const logisticsActions = useCount("orders", {
    col: "logistics_status",
    in: ["awaiting_weighing", "fees_calculated", "awaiting_client_validation"],
  });
  const supportTickets = useCount("support_conversations", {
    col: "status",
    in: ["new", "open", "urgent"],
  });
  const openReports = useCount("product_reports", {
    col: "status",
    val: "open",
  });
  const pendingCats = useCount("category_requests", {
    col: "status",
    val: "pending",
  });

  const kpiData = [
    {
      label: "Nouvelles commandes",
      value: newOrders.data,
      icon: ShoppingBag,
      color: "text-blue-600",
    },
    {
      label: "Produits à modérer",
      value: pendingProducts.data,
      icon: PackageCheck,
      color: "text-amber-600",
    },
    {
      label: "Actions logistiques",
      value: logisticsActions.data,
      icon: Truck,
      color: "text-orange-600",
    },
    {
      label: "Tickets support",
      value: supportTickets.data,
      icon: HeadphonesIcon,
      color: "text-rose-600",
    },
    {
      label: "Signalements",
      value: openReports.data,
      icon: Flag,
      color: "text-destructive",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Centre d&apos;Actions</h1>
          <p className="text-xs text-muted-foreground">
            Ce qui nécessite votre attention aujourd&apos;hui
          </p>
        </div>
        <UpdateAppButton variant="outline" />
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SECTION 1 — KPI ACTIONS                                */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Actions requises
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {kpiData.map((k) => (
            <KpiTile
              key={k.label}
              label={k.label}
              value={k.value}
              icon={k.icon}
              iconColor={k.color}
            />
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SECTION 2 — ACTIONS PRIORITAIRES (compact)             */}
      {/* (hidden when count = 0)                                */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="space-y-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Prioritaires
        </h2>

        <ActionCard
          icon={PackageCheck}
          iconColor="text-amber-700"
          iconBg="bg-amber-100"
          title="produits à modérer"
          count={pendingProducts.data ?? 0}
          to="/admin/products"
        />

        <ActionCard
          icon={FolderTree}
          iconColor="text-amber-700"
          iconBg="bg-amber-100"
          title="demandes de catégories"
          count={pendingCats.data ?? 0}
          to="/admin/category-requests"
        />

        <ActionCard
          icon={ShoppingBag}
          iconColor="text-blue-700"
          iconBg="bg-blue-100"
          title="nouvelles commandes"
          count={newOrders.data ?? 0}
          to="/admin/orders"
        />

        <ActionCard
          icon={Truck}
          iconColor="text-orange-700"
          iconBg="bg-orange-100"
          title="actions logistiques"
          count={logisticsActions.data ?? 0}
          to="/admin/logistics"
        />

        <ActionCard
          icon={Flag}
          iconColor="text-red-700"
          iconBg="bg-red-100"
          title="signalements produits"
          count={openReports.data ?? 0}
          to="/admin/products"
        />

        <ActionCard
          icon={HeadphonesIcon}
          iconColor="text-rose-700"
          iconBg="bg-rose-100"
          title="tickets support"
          count={supportTickets.data ?? 0}
          to="/admin/support"
        />
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SECTION 3 — RACCOURCIS RAPIDES                         */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Accès rapide
        </h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          <ShortcutCard
            icon={ShoppingBag}
            label="Commandes"
            to="/admin/orders"
            iconColor="text-blue-600"
          />
          <ShortcutCard
            icon={Truck}
            label="Logistique"
            to="/admin/logistics"
            iconColor="text-orange-600"
          />
          <ShortcutCard
            icon={PackageCheck}
            label="Produits"
            to="/admin/products"
            iconColor="text-amber-600"
          />
          <ShortcutCard
            icon={Users}
            label="Vendeurs"
            to="/admin/vendors"
            iconColor="text-emerald-600"
          />
          <ShortcutCard
            icon={MessageSquare}
            label="Support"
            to="/admin/support"
            iconColor="text-rose-600"
          />
          <ShortcutCard
            icon={Wallet}
            label="Finances"
            to="/admin/commissions"
            iconColor="text-violet-600"
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SECTION 4 — VUE D&apos;ENSEMBLE BUSINESS                    */}
      {/* (secondary, informational only)                        */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Vue d&apos;ensemble
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile
            label="Revenu 30j (FCFA)"
            value={
              stats.data
                ? new Intl.NumberFormat("fr-FR").format(
                    stats.data.orders.revenue_30d
                  )
                : undefined
            }
            icon={Wallet}
            iconColor="text-amber-600"
          />
          <KpiTile
            label="Clients"
            value={stats.data?.customers.total}
            icon={Users}
            iconColor="text-primary"
          />
          <KpiTile
            label="Vendeurs actifs"
            value={stats.data?.vendors.active}
            icon={LayoutDashboard}
            iconColor="text-emerald-600"
          />
          <KpiTile
            label="Commandes total"
            value={stats.data?.orders.total}
            icon={BarChart3}
            iconColor="text-blue-600"
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SECTION 5 — OUTILS SYSTÈME                             */}
      {/* (TranslationSyncCard — periodic maintenance tool)        */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Outils système
        </h2>
        <TranslationSyncCard />
      </div>
    </div>
  );
}
