import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Plus, Package, Clock, CheckCircle2, XCircle, ShoppingBag, TrendingUp,
  Truck, Ban, MessageSquare, Settings, ListOrdered,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/vendor/")({
  component: VendorHome,
});

function VendorHome() {
  const { user } = useAuth();

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
      let orders: { id: string; status: string }[] = [];
      if (orderIds.length > 0) {
        const { data } = await supabase.from("orders").select("id, status").in("id", orderIds);
        orders = (data ?? []) as { id: string; status: string }[];
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

      let salesDay = 0;
      let salesWeek = 0;
      for (const it of items ?? []) {
        if (!validOrderIds.has(it.order_id)) continue;
        const t = new Date(it.created_at).getTime();
        const amount = Number(it.unit_price) * Number(it.quantity);
        if (t >= startDay) salesDay += amount;
        if (t >= startWeek) salesWeek += amount;
      }

      return {
        totalOrders, pendingOrders, confirmedOrders, deliveredOrders, cancelledOrders,
        activeProducts: activeProducts ?? 0,
        rejectedProducts: rejectedProducts ?? 0,
        salesDay, salesWeek,
      };
    },
  });

  const fmt = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} FCFA`;

  const tiles = [
    { label: "Commandes totales", value: stats?.totalOrders ?? "—", icon: ShoppingBag, color: "text-primary", bg: "bg-primary/10" },
    { label: "En attente", value: stats?.pendingOrders ?? "—", icon: Clock, color: "text-amber-600", bg: "bg-amber-500/10" },
    { label: "Confirmées", value: stats?.confirmedOrders ?? "—", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-500/10" },
    { label: "Livrées", value: stats?.deliveredOrders ?? "—", icon: Truck, color: "text-blue-600", bg: "bg-blue-500/10" },
    { label: "Annulées", value: stats?.cancelledOrders ?? "—", icon: Ban, color: "text-destructive", bg: "bg-destructive/10" },
    { label: "Produits actifs", value: stats?.activeProducts ?? "—", icon: Package, color: "text-blue-600", bg: "bg-blue-500/10" },
    { label: "Produits refusés", value: stats?.rejectedProducts ?? "—", icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
    { label: "Ventes du jour", value: stats ? fmt(stats.salesDay) : "—", icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-500/10" },
    { label: "Ventes de la semaine", value: stats ? fmt(stats.salesWeek) : "—", icon: TrendingUp, color: "text-primary", bg: "bg-primary/10" },
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
      <div>
        <h1 className="text-xl font-bold">Tableau de bord</h1>
        <p className="text-xs text-muted-foreground">Aperçu de votre boutique</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {tiles.map((t) => (
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
