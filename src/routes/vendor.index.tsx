import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Plus, Package, Clock, CheckCircle2, XCircle, ShoppingBag, TrendingUp,
  Truck, Ban, MessageSquare, Settings, ListOrdered, BadgeCheck, Store, ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";


export const Route = createFileRoute("/vendor/")({
  component: VendorHome,
});

function VendorHome() {
  const { user, profile } = useAuth();
  const { t, lang } = useI18n();
  const p = (profile ?? {}) as Record<string, unknown>;
  const shopName = (p.shop_name as string) || (p.full_name as string) || t("vendor.dash.my_shop_default");
  const logo = p.shop_logo_url as string | undefined;
  const banner = p.shop_banner_url as string | undefined;
  const verified = !!p.is_verified;
  const vendorStatus = (p.vendor_status as "active" | "pending" | "suspended" | "expired" | "blocked" | undefined) ?? "pending";
  const statusBanner: { title: string; msg: string; cls: string } | null = (() => {
    if (vendorStatus === "active") return null;
    const map: Record<string, { title: string; msg: string; cls: string }> = {
      pending:   { title: "⏳ Boutique en attente de validation", msg: "Votre boutique et vos produits ne seront visibles publiquement qu'après validation par un administrateur. Vous pouvez déjà préparer vos produits.", cls: "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200" },
      suspended: { title: "⏸️ Compte vendeur suspendu",          msg: "L'ajout de produits et les nouvelles commandes sont temporairement désactivés. Contactez l'administrateur.", cls: "border-orange-500/40 bg-orange-500/10 text-orange-900 dark:text-orange-200" },
      expired:   { title: "⌛ Accès vendeur expiré",              msg: "Votre durée d'accès est terminée. Contactez l'administrateur pour la prolonger.", cls: "border-muted-foreground/30 bg-muted text-foreground" },
      blocked:   { title: "🚫 Compte vendeur bloqué",             msg: "Votre compte vendeur a été bloqué. Contactez l'administrateur pour plus d'informations.", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
    };
    return map[vendorStatus] ?? null;
  })();

  const { data: stats } = useQuery({
    queryKey: ["vendor-dashboard", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const vid = user!.id;

      const [{ count: activeProducts }, { count: rejectedProducts }] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }).eq("vendor_id", vid).eq("status", "approved"),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("vendor_id", vid).eq("status", "rejected"),
      ]);

      const { data: items } = await supabase
        .from("order_items")
        .select("order_id, unit_price, quantity, created_at")
        .eq("vendor_id", vid);

      const orderIds = Array.from(new Set((items ?? []).map((i) => i.order_id)));
      let orders: { id: string; status: string; created_at: string; customer_name: string | null; total: number }[] = [];
      if (orderIds.length > 0) {
        const { data } = await supabase
          .from("orders")
          .select("id, status, created_at, customer_name, total")
          .in("id", orderIds)
          .order("created_at", { ascending: false });
        orders = (data ?? []) as typeof orders;
      }

      const totalOrders = orders.length;
      const pendingOrders = orders.filter((o) => o.status === "new").length;
      const confirmedOrders = orders.filter((o) => o.status === "confirmed").length;
      const deliveredOrders = orders.filter((o) => o.status === "delivered").length;
      const cancelledOrders = orders.filter((o) => o.status === "cancelled").length;

      const validOrderIds = new Set(
        orders.filter((o) => o.status === "confirmed" || o.status === "delivered").map((o) => o.id),
      );
      const now = new Date();
      const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const startWeek = startDay - 6 * 24 * 60 * 60 * 1000;
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const startYear = new Date(now.getFullYear(), 0, 1).getTime();

      let salesDay = 0, salesWeek = 0, salesMonth = 0, salesYear = 0;
      for (const it of items ?? []) {
        if (!validOrderIds.has(it.order_id)) continue;
        const t = new Date(it.created_at).getTime();
        const amount = Number(it.unit_price) * Number(it.quantity);
        if (t >= startDay) salesDay += amount;
        if (t >= startWeek) salesWeek += amount;
        if (t >= startMonth) salesMonth += amount;
        if (t >= startYear) salesYear += amount;
      }

      return {
        totalOrders, pendingOrders, confirmedOrders, deliveredOrders, cancelledOrders,
        activeProducts: activeProducts ?? 0,
        rejectedProducts: rejectedProducts ?? 0,
        salesDay, salesWeek, salesMonth, salesYear,
        recentOrders: orders.slice(0, 5),
      };
    },
  });

  const localeMap: Record<string, string> = { fr: "fr-FR", en: "en-US", ar: "ar" };
  const locale = localeMap[lang] ?? "fr-FR";
  const fmt = (n: number) => `${Math.round(n).toLocaleString(locale)} FCFA`;
  const statusLabel = (s: string) =>
    s === "new" ? t("vendor.dash.tile.pending")
    : s === "confirmed" ? t("vendor.ord.status.confirmed")
    : s === "delivered" ? t("vendor.ord.status.delivered")
    : s === "cancelled" ? t("vendor.ord.status.cancelled")
    : s;
  const statusColor = (s: string) =>
    s === "new" ? "bg-amber-500/10 text-amber-700"
    : s === "confirmed" ? "bg-emerald-500/10 text-emerald-700"
    : s === "delivered" ? "bg-blue-500/10 text-blue-700"
    : s === "cancelled" ? "bg-destructive/10 text-destructive"
    : "bg-muted text-foreground";

  const orderTiles = [
    { label: t("vendor.dash.tile.total_orders"), value: stats?.totalOrders ?? "—", icon: ShoppingBag, color: "text-primary", bg: "bg-primary/10" },
    { label: t("vendor.dash.tile.pending"), value: stats?.pendingOrders ?? "—", icon: Clock, color: "text-amber-600", bg: "bg-amber-500/10" },
    { label: t("vendor.dash.tile.confirmed"), value: stats?.confirmedOrders ?? "—", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-500/10" },
    { label: t("vendor.dash.tile.delivered"), value: stats?.deliveredOrders ?? "—", icon: Truck, color: "text-blue-600", bg: "bg-blue-500/10" },
    { label: t("vendor.dash.tile.cancelled"), value: stats?.cancelledOrders ?? "—", icon: Ban, color: "text-destructive", bg: "bg-destructive/10" },
    { label: t("vendor.dash.tile.active_products"), value: stats?.activeProducts ?? "—", icon: Package, color: "text-blue-600", bg: "bg-blue-500/10" },
    { label: t("vendor.dash.tile.rejected_products"), value: stats?.rejectedProducts ?? "—", icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
  ];

  const salesTiles = [
    { label: t("vendor.dash.sales.today"), value: stats ? fmt(stats.salesDay) : "—", color: "text-emerald-600", bg: "bg-emerald-500/10" },
    { label: t("vendor.dash.sales.week"), value: stats ? fmt(stats.salesWeek) : "—", color: "text-primary", bg: "bg-primary/10" },
    { label: t("vendor.dash.sales.month"), value: stats ? fmt(stats.salesMonth) : "—", color: "text-blue-600", bg: "bg-blue-500/10" },
    { label: t("vendor.dash.sales.year"), value: stats ? fmt(stats.salesYear) : "—", color: "text-amber-600", bg: "bg-amber-500/10" },
  ];

  const actions = [
    { to: "/vendor/orders", label: t("vendor.dash.action.orders"), icon: ListOrdered, variant: "default" as const },
    { to: "/vendor/products", label: t("vendor.dash.action.products"), icon: Package, variant: "secondary" as const },
    { to: "/vendor/products/new", label: t("vendor.dash.action.new_product"), icon: Plus, variant: "outline" as const },
    { to: "/vendor/messages", label: t("vendor.dash.action.messages"), icon: MessageSquare, variant: "outline" as const },
    { to: "/vendor/settings", label: t("vendor.dash.action.settings"), icon: Settings, variant: "outline" as const },
  ];

  return (
    <div className="space-y-5">
      {statusBanner && (
        <div className={`rounded-2xl border p-3 text-sm ${statusBanner.cls}`}>
          <p className="font-semibold">{statusBanner.title}</p>
          <p className="mt-1 text-xs">{statusBanner.msg}</p>
        </div>
      )}
      {/* Shop header */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div
          className="h-20 w-full bg-gradient-to-br from-primary/40 to-accent/40 sm:h-28"
          style={banner ? { backgroundImage: `url(${banner})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        />
        <div className="flex items-end gap-3 px-4 pb-3">
          <div className="-mt-8 flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-muted shadow">
            {logo ? (
              <img src={logo} alt={shopName} className="h-full w-full object-cover" / loading="lazy" decoding="async" >
            ) : (
              <Store className="h-7 w-7 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex items-center gap-1.5">
              <h1 className="truncate text-base font-bold">{shopName}</h1>
              {verified && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  <BadgeCheck className="h-3 w-3" /> {t("vendor.dash.verified")}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {stats?.activeProducts ?? 0} {(stats?.activeProducts ?? 0) > 1 ? t("vendor.dash.products_many") : t("vendor.dash.products_one")} · {stats?.totalOrders ?? 0} {(stats?.totalOrders ?? 0) > 1 ? t("vendor.dash.orders_many") : t("vendor.dash.orders_one")}
            </p>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link to="/vendor/products/new">{t("vendor.dash.new_product")}</Link>
          </Button>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{t("vendor.dash.section_orders_products")}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {orderTiles.map((tile) => (
            <Card key={tile.label}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tile.bg}`}>
                  <tile.icon className={`h-5 w-5 ${tile.color}`} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs text-muted-foreground">{tile.label}</div>
                  <div className="truncate text-lg font-bold">{tile.value}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{t("vendor.dash.section_sales")}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {salesTiles.map((tile) => (
            <Card key={tile.label}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tile.bg}`}>
                  <TrendingUp className={`h-5 w-5 ${tile.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">{tile.label}</div>
                  <div className="text-lg font-bold">{tile.value}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent orders */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">{t("vendor.dash.section_recent")}</h2>
          <Link to="/vendor/orders" className="text-xs font-medium text-primary">{t("vendor.dash.see_all")}</Link>
        </div>
        <Card>
          <CardContent className="p-0">
            {stats?.recentOrders && stats.recentOrders.length > 0 ? (
              <ul className="divide-y">
                {stats.recentOrders.map((o) => (
                  <li key={o.id}>
                    <Link to="/vendor/orders" className="flex items-center gap-3 p-3 hover:bg-accent/50">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{o.customer_name ?? t("vendor.dash.client_fallback")}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(o.created_at).toLocaleDateString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor(o.status)}`}>
                        {statusLabel(o.status)}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">{t("vendor.dash.no_orders")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{t("vendor.dash.section_quick")}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map((a) => (
            <Button key={a.to} asChild size="lg" variant={a.variant} className="h-16 justify-start text-base">
              <Link to={a.to}>
                <a.icon className="mr-2 h-5 w-5" /> {a.label}
              </Link>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
