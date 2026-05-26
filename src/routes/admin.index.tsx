import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getAdminStats } from "@/lib/admin-stats.functions";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Users, FolderTree, Flag, Clock, PackageCheck, ArrowRight, Inbox, Percent, Wallet, ShoppingBag, AlertTriangle, TrendingUp } from "lucide-react";
import { TranslationSyncCard } from "@/components/admin/TranslationSyncCard";
import { UpdateAppButton } from "@/components/UpdateAppButton";

export const Route = createFileRoute("/admin/")({
  component: Dashboard,
});

function useCount(table: string, filter?: { col: string; val: string }) {
  return useQuery({
    queryKey: ["count", table, filter?.col, filter?.val],
    queryFn: async () => {
      try {
        let q = supabase.from(table as never).select("id", { count: "exact", head: true });
        if (filter) q = (q as never as { eq: (c: string, v: string) => typeof q }).eq(filter.col, filter.val);
        const { count, error } = await q;
        if (error) throw error;
        return count ?? 0;
      } catch (err) {
        // Soft-fail: a single failed count must not crash the whole dashboard.
        console.warn(`[admin] count(${table}) failed:`, err);
        return 0;
      }
    },
    staleTime: 60_000,
    retry: 1,
  });
}

function Dashboard() {
  const { isSuperAdmin } = useAuth();
  const fetchStats = useServerFn(getAdminStats);

  // Aggregated stats from the cached overview (15-min Inngest refresh + lazy compute).
  const stats = useQuery({
    queryKey: ["admin", "stats", "overview"],
    queryFn: () => fetchStats(),
    staleTime: 60_000,
  });

  // Validation queues stay live (counts on small filtered subsets, cheap).
  const pending = useCount("products", { col: "status", val: "pending" });
  const reports = useCount("product_reports", { col: "status", val: "open" });
  const pendingCats = useCount("category_requests", { col: "status", val: "pending" });
  const categories = useCount("categories");

  const tiles = [
    { label: "Clients", value: stats.data?.customers.total, icon: Users, color: "text-primary" },
    { label: "Vendeurs actifs", value: stats.data?.vendors.active, icon: Users, color: "text-emerald-600" },
    { label: "Commandes", value: stats.data?.orders.total, icon: ShoppingBag, color: "text-blue-600" },
    { label: "Revenu 30j (FCFA)", value: stats.data ? new Intl.NumberFormat("fr-FR").format(stats.data.orders.revenue_30d) : undefined, icon: Wallet, color: "text-amber-600" },
    { label: "À valider", value: pending.data, icon: Clock, color: "text-amber-600" },
    { label: "Catégories", value: categories.data, icon: FolderTree, color: "text-blue-600" },
    { label: "Signalements ouverts", value: reports.data, icon: Flag, color: "text-destructive" },
    { label: "Cmd en attente", value: stats.data?.orders.pending, icon: Package, color: "text-amber-600" },
  ];

  const vendorStats = useQuery({
    queryKey: ["admin", "vendor-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_vendor_product_stats");
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        user_id: string;
        shop_name: string | null;
        full_name: string | null;
        email: string | null;
        total: number | string;
        approved: number | string;
        pending: number | string;
      }>;
      return rows.map((v) => ({
        user_id: v.user_id,
        name: v.shop_name || v.full_name || v.email || "—",
        email: v.email,
        total: Number(v.total) || 0,
        approved: Number(v.approved) || 0,
        pending: Number(v.pending) || 0,
      }));
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold sm:text-2xl">Tableau de bord</h1>
          <p className="text-xs text-muted-foreground">Vue d'ensemble de votre marketplace</p>
        </div>
        <UpdateAppButton variant="outline" />
      </div>

      <TranslationSyncCard />

      <section className="space-y-2">
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">À traiter en priorité</h2>

        {/* Étape 1 — Catégories proposées */}
        <Card className="border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-amber-500/5">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-white">
              <Inbox className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">1. Catégories proposées par les vendeurs</div>
              <div className="text-xs text-muted-foreground">
                {pendingCats.data ?? 0} demande{(pendingCats.data ?? 0) > 1 ? "s" : ""} en attente — accepter, modifier, fusionner ou refuser
              </div>
            </div>
            <Button asChild size="sm" variant="secondary">
              <Link to="/admin/category-requests">Ouvrir <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </CardContent>
        </Card>

        {/* Étape 2 — Produits */}
        <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <PackageCheck className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">2. Produits en attente de validation</div>
              <div className="text-xs text-muted-foreground">
                {pending.data ?? 0} produit{(pending.data ?? 0) > 1 ? "s" : ""} — validez d'abord les catégories liées
              </div>
            </div>
            <Button asChild size="sm">
              <Link to="/admin/products">Ouvrir <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Section Urgences */}
      <section className="space-y-2">
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          Urgences
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {/* Produit pending */}
          <UrgenceCard
            icon={Clock}
            iconColor="text-amber-600"
            iconBg="bg-amber-500/10"
            label="Produits en attente"
            value={pending.data ?? 0}
            threshold={5}
            href="/admin/products"
            action="Valider"
          />
          {/* Signalements */}
          <UrgenceCard
            icon={Flag}
            iconColor="text-red-600"
            iconBg="bg-red-500/10"
            label="Signalements ouverts"
            value={reports.data ?? 0}
            threshold={1}
            href="/admin/products?tab=reported"
            action="Examiner"
          />
          {/* Commandes en attente */}
          <UrgenceCard
            icon={ShoppingBag}
            iconColor="text-blue-600"
            iconBg="bg-blue-500/10"
            label="Commandes en attente"
            value={stats.data?.orders.pending ?? 0}
            threshold={3}
            href="/admin/orders"
            action="Traiter"
          />
        </div>
      </section>

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

      <section className="space-y-2">
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Indicateurs clés</h2>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {tiles.map((t) => (
            <Card key={t.label} className="transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1 sm:p-4 sm:pb-2">
                <CardTitle className="text-[11px] font-medium text-muted-foreground sm:text-xs">{t.label}</CardTitle>
                <t.icon className={`h-4 w-4 ${t.color}`} />
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
                <div className="text-lg font-bold sm:text-2xl">{t.value ?? "—"}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>


      <Card>
        <CardHeader><CardTitle className="text-base">Vendeurs et leurs produits</CardTitle></CardHeader>
        <CardContent>
          {vendorStats.isError ? (
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-muted-foreground">Impossible de charger les statistiques vendeurs.</p>
              <Button size="sm" variant="outline" onClick={() => vendorStats.refetch()}>Réessayer</Button>
            </div>
          ) : vendorStats.isPending ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : vendorStats.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun vendeur.</p>
          ) : (
            <ul className="divide-y">
              {vendorStats.data.map((v) => (
                <li key={v.user_id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{v.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{v.email}</div>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <div className="text-center"><div className="font-bold">{v.total}</div><div className="text-muted-foreground">total</div></div>
                    <div className="text-center"><div className="font-bold text-emerald-600">{v.approved}</div><div className="text-muted-foreground">publiés</div></div>
                    <div className="text-center"><div className="font-bold text-amber-600">{v.pending}</div><div className="text-muted-foreground">en attente</div></div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Urgence Card ── */

function UrgenceCard({
  icon: Icon,
  iconColor,
  iconBg,
  label,
  value,
  threshold,
  href,
  action,
}: {
  icon: typeof Clock;
  iconColor: string;
  iconBg: string;
  label: string;
  value: number;
  threshold: number;
  href: string;
  action: string;
}) {
  const isUrgent = value >= threshold && value > 0;

  return (
    <Card className={isUrgent ? "border-amber-500/30 bg-amber-500/5" : "border-border/60 bg-muted/20 opacity-70"}>
      <CardContent className="flex items-center gap-3 p-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={`text-lg font-bold ${isUrgent ? "text-foreground" : "text-muted-foreground"}`}>
            {value}
          </div>
        </div>
        {isUrgent ? (
          <Button asChild size="sm" variant="secondary" className="h-7 text-xs">
            <Link to={href}>{action}</Link>
          </Button>
        ) : (
          <span className="text-[10px] text-muted-foreground">OK</span>
        )}
      </CardContent>
    </Card>
  );
}
