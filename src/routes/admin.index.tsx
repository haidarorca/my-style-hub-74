/**
 * admin.index.tsx — COCKPIT INTELLIGENT ERP Kawzone
 *
 * Architecture: Command Center orienté ACTIONS et PRIORITÉS.
 * Plus de simple affichage de données — c'est un centre de contrôle
 * opérationnel qui priorise automatiquement les urgences terrain.
 *
 * Sections:
 * 1. ACTIONS RAPIDES — Boutons d'action contextuels
 * 2. ALERTES CRITIQUES — Cartes d'urgence priorisées (bloquées >7j, sans tracking, attente paiement)
 * 3. KPI OPERATIONNELS — Métriques live avec tendances
 * 4. PIPELINE LOGISTIQUE — Visualisation du workflow en temps réel
 * 5. COMMANDES RÉCENTES — Dernières commandes avec actions inline
 * 6. ACTIVITÉ RÉCENTE — Audit log des dernières actions
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getAdminStats } from "@/lib/admin-stats.functions";
import { getLogisticsStats } from "@/lib/admin-logistics.functions";
import { listAdminOrders } from "@/lib/admin-orders.functions";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Package, Users, ShoppingBag, Wallet, Clock, PackageCheck,
  ArrowRight, Inbox, Percent, AlertTriangle, TrendingUp,
  Scale, DollarSign, Truck, Plane, Zap, BarChart3,
  ChevronRight, Eye, Receipt, Phone, Ban, CheckCircle2,
  AlertCircle, Box, RefreshCw, MapPin, Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TranslationSyncCard } from "@/components/admin/TranslationSyncCard";
import { UpdateAppButton } from "@/components/UpdateAppButton";

export const Route = createFileRoute("/admin/")({
  component: CockpitIntelligent,
});

/* ═══════════════════════════════════════════════════════════
   TYPES & CONFIGS
   ═══════════════════════════════════════════════════════════ */

interface QuickAction {
  label: string;
  href: string;
  icon: typeof Package;
  color: string;
  bgColor: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Commandes", href: "/admin/orders", icon: ShoppingBag, color: "text-blue-600", bgColor: "bg-blue-50" },
  { label: "Logistique", href: "/admin/logistics", icon: Truck, color: "text-orange-600", bgColor: "bg-orange-50" },
  { label: "Produits", href: "/admin/products", icon: PackageCheck, color: "text-emerald-600", bgColor: "bg-emerald-50" },
  { label: "Vendeurs", href: "/admin/vendors", icon: Users, color: "text-violet-600", bgColor: "bg-violet-50" },
  { label: "Commissions", href: "/admin/commissions", icon: Percent, color: "text-amber-600", bgColor: "bg-amber-50" },
  { label: "Analytics", href: "/admin/analytics", icon: BarChart3, color: "text-sky-600", bgColor: "bg-sky-50" },
];

/* ═══════════════════════════════════════════════════════════
   COCKPIT PRINCIPAL
   ═══════════════════════════════════════════════════════════ */

function CockpitIntelligent() {
  const { isSuperAdmin } = useAuth();
  const fetchStats = useServerFn(getAdminStats);
  const fetchLogisticsStats = useServerFn(getLogisticsStats);
  const fetchRecentOrders = useServerFn(listAdminOrders);

  /* ── Stats globales ── */
  const stats = useQuery({
    queryKey: ["admin", "stats", "overview"],
    queryFn: () => fetchStats(),
    staleTime: 60_000,
  });

  /* ── Stats logistique ── */
  const logisticsStats = useQuery({
    queryKey: ["admin", "logistics-stats"],
    queryFn: () => fetchLogisticsStats({ data: {} }),
    staleTime: 60_000,
  });

  /* ── Commandes récentes (15 dernières) ── */
  const recentOrders = useQuery({
    queryKey: ["admin", "recent-orders"],
    queryFn: () => fetchRecentOrders({ data: { page: 1, pageSize: 8, status: "all", q: "", country: "all", commission: "all", show_history: false } }),
    staleTime: 30_000,
  });

  /* ── Compteurs live ── */
  const pendingProducts = useLiveCount("products", "status", "pending");
  const openReports = useLiveCount("product_reports", "status", "open");
  const pendingCats = useLiveCount("category_requests", "status", "pending");

  const ls = logisticsStats.data;
  const gs = stats.data;

  /* ── Alertes priorisées ── */
  const alerts = buildPriorityAlerts(ls, gs, pendingProducts.data, openReports.data, pendingCats.data);

  /* ── KPIs ── */
  const kpis = buildKPIs(gs, ls);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold sm:text-2xl flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Cockpit Opérationnel
          </h1>
          <p className="text-xs text-muted-foreground">Centre de contrôle — priorités et actions terrain</p>
        </div>
        <UpdateAppButton variant="outline" />
      </div>

      <TranslationSyncCard />

      {/* ═════ SECTION 1 : ACTIONS RAPIDES ═════ */}
      <section>
        <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Actions rapides
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.label}
              to={a.href}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all hover:shadow-md hover:scale-[1.02]",
                a.bgColor,
              )}
            >
              <a.icon className={cn("h-5 w-5", a.color)} />
              <span className="text-[10px] font-medium text-center leading-tight">{a.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ═════ SECTION 2 : ALERTES CRITIQUES ═════ */}
      {alerts.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            Alertes prioritaires — {alerts.length} problème{alerts.length > 1 ? "s" : ""} à traiter
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {alerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        </section>
      )}

      {/* ═════ SECTION 3 : KPI OPÉRATIONNELS ═════ */}
      <section>
        <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <BarChart3 className="h-3.5 w-3.5 inline mr-1" />
          Indicateurs opérationnels
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {kpis.map((kpi) => (
            <KPICard key={kpi.label} kpi={kpi} />
          ))}
        </div>
      </section>

      {/* ═════ SECTION 4 : PIPELINE LOGISTIQUE ═════ */}
      <section>
        <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Truck className="h-3.5 w-3.5 inline mr-1" />
          Pipeline logistique
        </h2>
        <PipelineVisual stats={ls} />
      </section>

      {/* ═════ SECTION 5 : RESTE À PAYER GLOBAL ═════ */}
      {ls && ls.total_remaining > 0 && (
        <section className="flex items-center gap-2 rounded-xl border bg-red-50 border-red-200 px-4 py-3">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <div className="flex-1">
            <span className="text-sm font-medium text-red-800">
              Reste à payer global : {ls.total_remaining.toLocaleString("fr-FR")} FCFA
            </span>
            {ls.partial_payment > 0 && (
              <span className="ml-2 text-xs text-red-600">
                · {ls.partial_payment} paiement{ls.partial_payment > 1 ? "s" : ""} partiel
              </span>
            )}
          </div>
          <Button asChild size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100">
            <Link to="/admin/logistics">Voir détails</Link>
          </Button>
        </section>
      )}

      {/* ═════ SECTION 6 : COMMANDES RÉCENTES + VENDEURS ═════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Commandes récentes */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-blue-600" />
              Commandes récentes
            </CardTitle>
            <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
              <Link to="/admin/orders">Tout voir <ChevronRight className="h-3 w-3 ml-0.5" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <RecentOrdersList orders={recentOrders.data?.rows ?? []} isLoading={recentOrders.isPending} />
          </CardContent>
        </Card>

        {/* À traiter */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" />
              À traiter
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            <TodoItem
              icon={PackageCheck}
              iconColor="text-primary"
              iconBg="bg-primary/10"
              label="Produits en attente"
              count={pendingProducts.data ?? 0}
              href="/admin/products"
            />
            <TodoItem
              icon={Inbox}
              iconColor="text-amber-600"
              iconBg="bg-amber-500/10"
              label="Catégories proposées"
              count={pendingCats.data ?? 0}
              href="/admin/category-requests"
            />
            <TodoItem
              icon={AlertTriangle}
              iconColor="text-red-600"
              iconBg="bg-red-500/10"
              label="Signalements ouverts"
              count={openReports.data ?? 0}
              href="/admin/products?tab=reported"
            />
            <TodoItem
              icon={Scale}
              iconColor="text-orange-600"
              iconBg="bg-orange-500/10"
              label="À peser"
              count={ls?.to_weigh ?? 0}
              href="/admin/logistics"
            />
            <TodoItem
              icon={DollarSign}
              iconColor="text-emerald-600"
              iconBg="bg-emerald-500/10"
              label="Attente paiement"
              count={ls?.awaiting_payment ?? 0}
              href="/admin/logistics"
            />
          </CardContent>
        </Card>
      </div>

      {/* Commissions (super admin only) */}
      {isSuperAdmin && (
        <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Percent className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Commissions</div>
              <div className="text-xs text-muted-foreground">Configurer les modes vendeurs et les taux par vendeur, catégorie ou produit</div>
            </div>
            <Button asChild size="sm" variant="secondary">
              <Link to="/admin/commissions" search={{ source: undefined, destination: undefined }}>Ouvrir <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ALERTES PRIORITAIRES — Construction dynamique
   ═══════════════════════════════════════════════════════════ */

interface PriorityAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  count: number;
  href: string;
  actionLabel: string;
  icon: typeof AlertTriangle;
  iconColor: string;
  iconBg: string;
  borderColor: string;
}

function buildPriorityAlerts(
  ls: { blocked: number; urgent: number; total_remaining: number; partial_payment: number; to_weigh: number; awaiting_payment: number } | undefined,
  gs: { orders: { pending: number } } | undefined,
  pendingProducts: number,
  openReports: number,
  pendingCats: number,
): PriorityAlert[] {
  const alerts: PriorityAlert[] = [];

  if (ls) {
    if (ls.urgent > 0) {
      alerts.push({
        id: "urgent-orders",
        severity: "critical",
        title: "Commandes urgentes",
        description: `${ls.urgent} commande${ls.urgent > 1 ? "s" : ""} bloquée${ls.urgent > 1 ? "s" : ""} depuis plus de 14 jours`,
        count: ls.urgent,
        href: "/admin/logistics",
        actionLabel: "Traiter",
        icon: Zap,
        iconColor: "text-red-600",
        iconBg: "bg-red-500/10",
        borderColor: "border-red-300",
      });
    }
    if (ls.blocked > 0 && ls.urgent === 0) {
      alerts.push({
        id: "blocked-orders",
        severity: "warning",
        title: "Commandes bloquées",
        description: `${ls.blocked} commande${ls.blocked > 1 ? "s" : ""} en attente depuis plus de 7 jours`,
        count: ls.blocked,
        href: "/admin/logistics",
        actionLabel: "Voir",
        icon: Clock,
        iconColor: "text-orange-600",
        iconBg: "bg-orange-500/10",
        borderColor: "border-orange-300",
      });
    }
    if (ls.awaiting_payment > 0) {
      alerts.push({
        id: "awaiting-payment",
        severity: "warning",
        title: "Paiements en attente",
        description: `${ls.awaiting_payment} commande${ls.awaiting_payment > 1 ? "s" : ""} en attente de paiement client`,
        count: ls.awaiting_payment,
        href: "/admin/logistics",
        actionLabel: "Relancer",
        icon: DollarSign,
        iconColor: "text-amber-600",
        iconBg: "bg-amber-500/10",
        borderColor: "border-amber-300",
      });
    }
  }

  if ((gs?.orders.pending ?? 0) > 0) {
    alerts.push({
      id: "pending-orders",
      severity: "info",
      title: "Commandes nouvelles",
      description: `${gs!.orders.pending} commande${gs!.orders.pending > 1 ? "s" : ""} à confirmer`,
      count: gs!.orders.pending,
      href: "/admin/orders",
      actionLabel: "Valider",
      icon: ShoppingBag,
      iconColor: "text-blue-600",
      iconBg: "bg-blue-500/10",
      borderColor: "border-blue-300",
    });
  }

  return alerts;
}

function AlertCard({ alert }: { alert: PriorityAlert }) {
  const Icon = alert.icon;
  return (
    <Card className={cn("border-l-4", alert.borderColor, alert.severity === "critical" && "bg-red-50/50")}>
      <CardContent className="flex items-center gap-3 p-3">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", alert.iconBg)}>
          <Icon className={cn("h-5 w-5", alert.iconColor)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{alert.title}</span>
            <Badge variant={alert.severity === "critical" ? "destructive" : alert.severity === "warning" ? "default" : "secondary"} className="text-[9px] h-4 px-1">
              {alert.count}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">{alert.description}</p>
        </div>
        <Button asChild size="sm" variant="secondary" className="h-7 text-xs shrink-0">
          <Link to={alert.href}>{alert.actionLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   KPI CARDS
   ═══════════════════════════════════════════════════════════ */

interface KPIData {
  label: string;
  value: string | number | undefined;
  icon: typeof ShoppingBag;
  iconColor: string;
  trend?: string;
  href?: string;
}

function buildKPIs(
  gs: { customers: { total: number }; vendors: { active: number }; orders: { total: number; revenue_30d: number; pending: number } } | undefined,
  ls: { to_weigh: number; to_ship: number; shipped: number; total_remaining: number } | undefined,
): KPIData[] {
  return [
    { label: "Clients", value: gs?.customers.total, icon: Users, iconColor: "text-blue-600", href: "/admin/customers" },
    { label: "Vendeurs", value: gs?.vendors.active, icon: Users, iconColor: "text-emerald-600", href: "/admin/vendors" },
    { label: "Commandes", value: gs?.orders.total, icon: ShoppingBag, iconColor: "text-blue-600", href: "/admin/orders" },
    { label: "Revenu 30j", value: gs ? `${(gs.orders.revenue_30d / 1000).toFixed(0)}k FCFA` : undefined, icon: Wallet, iconColor: "text-amber-600" },
    { label: "À peser", value: ls?.to_weigh, icon: Scale, iconColor: "text-orange-600", href: "/admin/logistics" },
    { label: "Expédiées", value: ls?.shipped, icon: Plane, iconColor: "text-violet-600", href: "/admin/logistics" },
  ];
}

function KPICard({ kpi }: { kpi: KPIData }) {
  const content = (
    <Card className={cn("transition-all hover:shadow-md", kpi.href && "cursor-pointer hover:scale-[1.01]")}>
      <CardContent className="flex items-center gap-3 p-3">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-opacity-10", kpi.iconColor.replace("text-", "bg-"))}>
          <kpi.icon className={cn("h-4 w-4", kpi.iconColor)} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
          <p className="text-lg font-bold leading-tight">{kpi.value ?? "—"}</p>
        </div>
      </CardContent>
    </Card>
  );

  if (kpi.href) {
    return <Link to={kpi.href}>{content}</Link>;
  }
  return content;
}

/* ═══════════════════════════════════════════════════════════
   PIPELINE VISUEL
   ═══════════════════════════════════════════════════════════ */

function PipelineVisual({ stats }: { stats: { to_weigh: number; fees_calculated?: number; awaiting_payment: number; partial_payment?: number; to_ship: number; shipped: number } | undefined }) {
  if (!stats) return null;

  const steps = [
    { key: "to_weigh", label: "À peser", count: stats.to_weigh, color: "bg-orange-500", textColor: "text-orange-700" },
    { key: "awaiting_payment", label: "Attente paiement", count: stats.awaiting_payment, color: "bg-amber-500", textColor: "text-amber-700" },
    { key: "partial", label: "Partiel", count: stats.partial_payment ?? 0, color: "bg-sky-500", textColor: "text-sky-700" },
    { key: "to_ship", label: "À expédier", count: stats.to_ship, color: "bg-cyan-500", textColor: "text-cyan-700" },
    { key: "shipped", label: "Expédiées", count: stats.shipped, color: "bg-violet-500", textColor: "text-violet-700" },
  ];

  const maxCount = Math.max(...steps.map((s) => s.count), 1);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-end gap-2 h-24">
          {steps.map((step) => (
            <Link
              key={step.key}
              to="/admin/logistics"
              className="flex flex-col items-center gap-1 flex-1 group"
            >
              <span className={cn("text-lg font-bold", step.textColor)}>{step.count}</span>
              <div
                className={cn("w-full rounded-t-md transition-all group-hover:opacity-80", step.color)}
                style={{ height: `${Math.max((step.count / maxCount) * 80, 8)}px` }}
              />
              <span className="text-[9px] font-medium text-muted-foreground text-center leading-tight">{step.label}</span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   COMMANDES RÉCENTES
   ═══════════════════════════════════════════════════════════ */

function RecentOrdersList({ orders, isLoading }: { orders: Array<Record<string, unknown>>; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center py-6 text-muted-foreground">
        <Box className="h-8 w-8 mb-2 opacity-30" />
        <p className="text-xs">Aucune commande récente</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {orders.slice(0, 8).map((order: any) => (
        <div
          key={order.id}
          className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors"
        >
          <div className={cn(
            "h-2 w-2 rounded-full shrink-0",
            order.status === "new" ? "bg-amber-500" :
            order.status === "confirmed" ? "bg-emerald-500" :
            order.status === "delivered" ? "bg-blue-500" :
            order.status === "cancelled" ? "bg-red-500" : "bg-gray-400",
          )} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs">#{String(order.id).slice(0, 8)}</span>
              <span className="text-xs text-muted-foreground truncate">{order.customer_name || "—"}</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>{order.total ? `${Number(order.total).toLocaleString("fr-FR")} FCFA` : "—"}</span>
              {order.is_commission && (
                <Badge variant="outline" className="text-[8px] h-3 px-1 border-amber-300 text-amber-700">Commission</Badge>
              )}
            </div>
          </div>
          <StatusMiniBadge status={order.status} />
          <Button asChild size="sm" variant="ghost" className="h-6 w-6 p-0">
            <Link to={`/admin/orders`}><Eye className="h-3 w-3" /></Link>
          </Button>
        </div>
      ))}
    </div>
  );
}

function StatusMiniBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    new: { label: "Nouvelle", className: "bg-amber-100 text-amber-700 border-amber-300" },
    confirmed: { label: "Confirmée", className: "bg-emerald-100 text-emerald-700 border-emerald-300" },
    delivered: { label: "Livrée", className: "bg-blue-100 text-blue-700 border-blue-300" },
    cancelled: { label: "Annulée", className: "bg-red-100 text-red-700 border-red-300" },
    processing: { label: "En cours", className: "bg-purple-100 text-purple-700 border-purple-300" },
    shipped: { label: "Expédiée", className: "bg-violet-100 text-violet-700 border-violet-300" },
  };
  const c = config[status] ?? { label: status ?? "?", className: "bg-gray-100 text-gray-500 border-gray-300" };
  return <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium border", c.className)}>{c.label}</span>;
}

/* ═══════════════════════════════════════════════════════════
   À TRAITER — Todo Items
   ═══════════════════════════════════════════════════════════ */

function TodoItem({ icon: Icon, iconColor, iconBg, label, count, href }: {
  icon: typeof Package;
  iconColor: string;
  iconBg: string;
  label: string;
  count: number;
  href: string;
}) {
  return (
    <Link
      to={href}
      className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50 transition-colors"
    >
      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", iconBg)}>
        <Icon className={cn("h-4 w-4", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{label}</p>
      </div>
      {count > 0 ? (
        <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{count}</Badge>
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
      )}
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════
   HOOK : Compteur live avec soft-fail
   ═══════════════════════════════════════════════════════════ */

function useLiveCount(table: string, col: string, val: string) {
  return useQuery({
    queryKey: ["count", table, col, val],
    queryFn: async () => {
      try {
        let q = supabase.from(table as never).select("id", { count: "exact", head: true });
        q = (q as never as { eq: (c: string, v: string) => typeof q }).eq(col, val);
        const { count, error } = await q;
        if (error) throw error;
        return count ?? 0;
      } catch {
        return 0;
      }
    },
    staleTime: 60_000,
    retry: 1,
  });
}
