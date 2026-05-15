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
  const p = (profile ?? {}) as Record<string, unknown>;
  const shopName = (p.shop_name as string) || (p.full_name as string) || "Ma boutique";
  const logo = p.shop_logo_url as string | undefined;
  const banner = p.shop_banner_url as string | undefined;
  const verified = !!p.is_verified;

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

  const fmt = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
  const statusLabel = (s: string) =>
    s === "new" ? "En attente" : s === "confirmed" ? "Confirmée" : s === "delivered" ? "Livrée" : s === "cancelled" ? "Annulée" : s;
  const statusColor = (s: string) =>
    s === "new" ? "bg-amber-500/10 text-amber-700"
    : s === "confirmed" ? "bg-emerald-500/10 text-emerald-700"
    : s === "delivered" ? "bg-blue-500/10 text-blue-700"
    : s === "cancelled" ? "bg-destructive/10 text-destructive"
    : "bg-muted text-foreground";

  const orderTiles = [
    { label: "Commandes totales", value: stats?.totalOrders ?? "—", icon: ShoppingBag, color: "text-primary", bg: "bg-primary/10" },
    { label: "En attente", value: stats?.pendingOrders ?? "—", icon: Clock, color: "text-amber-600", bg: "bg-amber-500/10" },
    { label: "Confirmées", value: stats?.confirmedOrders ?? "—", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-500/10" },
    { label: "Livrées", value: stats?.deliveredOrders ?? "—", icon: Truck, color: "text-blue-600", bg: "bg-blue-500/10" },
    { label: "Annulées", value: stats?.cancelledOrders ?? "—", icon: Ban, color: "text-destructive", bg: "bg-destructive/10" },
    { label: "Produits actifs", value: stats?.activeProducts ?? "—", icon: Package, color: "text-blue-600", bg: "bg-blue-500/10" },
    { label: "Produits refusés", value: stats?.rejectedProducts ?? "—", icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
  ];

  const salesTiles = [
    { label: "Ventes aujourd'hui", value: stats ? fmt(stats.salesDay) : "—", color: "text-emerald-600", bg: "bg-emerald-500/10" },
    { label: "Ventes cette semaine", value: stats ? fmt(stats.salesWeek) : "—", color: "text-primary", bg: "bg-primary/10" },
    { label: "Ventes ce mois", value: stats ? fmt(stats.salesMonth) : "—", color: "text-blue-600", bg: "bg-blue-500/10" },
    { label: "Ventes cette année", value: stats ? fmt(stats.salesYear) : "—", color: "text-amber-600", bg: "bg-amber-500/10" },
  ];

  const actions = [
    { to: "/vendor/orders", label: "Mes commandes", icon: ListOrdered, variant: "default" as const },
    { to: "/vendor/products", label: "Mes produits", icon: Package, variant: "secondary" as const },
    { to: "/vendor/products/new", label: "Ajouter un produit", icon: Plus, variant: "outline" as const },
    { to: "/vendor/messages", label: "Messages clients", icon: MessageSquare, variant: "outline" as const },
    { to: "/vendor/settings", label: "Paramètres boutique", icon: Settings, variant: "outline" as const },
  ];

  return (
    <div className="space-y-5">
      {/* Shop header */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div
          className="h-20 w-full bg-gradient-to-br from-primary/40 to-accent/40 sm:h-28"
          style={banner ? { backgroundImage: `url(${banner})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        />
        <div className="flex items-end gap-3 px-4 pb-3">
          <div className="-mt-8 flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-muted shadow">
            {logo ? (
              <img src={logo} alt={shopName} className="h-full w-full object-cover" />
            ) : (
              <Store className="h-7 w-7 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex items-center gap-1.5">
              <h1 className="truncate text-base font-bold">{shopName}</h1>
              {verified && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  <BadgeCheck className="h-3 w-3" /> Vérifié
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {stats?.activeProducts ?? 0} produit{(stats?.activeProducts ?? 0) > 1 ? "s" : ""} · {stats?.totalOrders ?? 0} commande{(stats?.totalOrders ?? 0) > 1 ? "s" : ""}
            </p>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link to="/vendor/products/new">+ Nouveau produit</Link>
          </Button>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Commandes & produits</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {orderTiles.map((t) => (
            <Card key={t.label}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${t.bg}`}>
                  <t.icon className={`h-5 w-5 ${t.color}`} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs text-muted-foreground">{t.label}</div>
                  <div className="truncate text-lg font-bold">{t.value}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Mes ventes</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {salesTiles.map((t) => (
            <Card key={t.label}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${t.bg}`}>
                  <TrendingUp className={`h-5 w-5 ${t.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">{t.label}</div>
                  <div className="text-lg font-bold">{t.value}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent orders */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">Dernières commandes</h2>
          <Link to="/vendor/orders" className="text-xs font-medium text-primary">Tout voir</Link>
        </div>
        <Card>
          <CardContent className="p-0">
            {stats?.recentOrders && stats.recentOrders.length > 0 ? (
              <ul className="divide-y">
                {stats.recentOrders.map((o) => (
                  <li key={o.id}>
                    <Link to="/vendor/orders" className="flex items-center gap-3 p-3 hover:bg-accent/50">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{o.customer_name ?? "Client"}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(o.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
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
              <p className="p-6 text-center text-sm text-muted-foreground">Aucune commande pour l'instant.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Actions rapides</h2>
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
