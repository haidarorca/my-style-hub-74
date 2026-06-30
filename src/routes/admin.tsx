import { useEffect, useState } from "react";
import { createFileRoute, Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, FolderTree, Store, PackageCheck, Flag, ArrowLeft, MessageSquare, ShoppingBag,
  Settings, Inbox, ShieldCheck, Percent, Briefcase, Users, Bell, LifeBuoy, Phone, Globe, Truck,
  Upload, Menu, ChevronRight, Home, FileText, Zap, AlertTriangle, Wallet, Archive, Shield, Coins,
  BarChart3,
} from "lucide-react";
import { useAuth, type AdminPermission } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { AdminNotificationBell } from "@/components/admin/AdminNotificationBell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { StuckLoadingDetector } from "@/components/admin/StuckLoadingDetector";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CurrenciesProvider } from "@/hooks/use-currencies";
import { CurrencySwitcher } from "@/components/CurrencySwitcher";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  perm?: AdminPermission;
  superOnly?: boolean;
  badge?: string;
};

type NavGroup = { id: string; label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: "Aperçu",
    items: [
      { to: "/admin", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
      { to: "/admin/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    id: "catalog",
    label: "Catalogue",
    items: [
      { to: "/admin/products", label: "Validation produits", icon: PackageCheck, perm: "product_validation" },
      { to: "/admin/categories", label: "Catégories", icon: FolderTree, perm: "categories" },
      { to: "/admin/category-requests", label: "Demandes catégories", icon: Inbox, perm: "categories" },
      { to: "/admin/imports", label: "Import / Export", icon: Upload, perm: "products" },
    ],
  },
  {
    id: "people",
    label: "Personnes",
    items: [
      { to: "/admin/vendors", label: "Vendeurs", icon: Store, perm: "vendors" },
      { to: "/admin/shops", label: "Boutiques admin", icon: Store, perm: "vendors" },
      { to: "/admin/customers", label: "Clients", icon: Users, perm: "customers" },
    ],
  },
  {
    id: "sales",
    label: "Ventes & Logistique",
    items: [
      { to: "/admin/commandes", label: "Commandes", icon: ShoppingBag, perm: "orders" },
      { to: "/admin/cockpit", label: "Cockpit", icon: Zap, perm: "orders", exact: true },
      { to: "/admin/cockpit/sav", label: "Centre SAV", icon: AlertTriangle, perm: "orders" },
      { to: "/admin/sav-rules", label: "Règles SAV", icon: AlertTriangle, perm: "orders" },
      { to: "/admin/shipping-services", label: "Services transport", icon: Globe, perm: "orders" },
    ],
  },
  {
    id: "moderation",
    label: "Modération",
    items: [
      { to: "/admin/reports", label: "Signalements", icon: Flag, perm: "support" },
      { to: "/admin/reviews", label: "Avis", icon: MessageSquare, perm: "support" },
      { to: "/admin/support", label: "Support", icon: LifeBuoy, perm: "support" },
    ],
  },
  {
    id: "system",
    label: "Système",
    items: [
      { to: "/admin/commissions/hub", label: "Commissions", icon: Percent, superOnly: true },
      { to: "/admin/contact-settings", label: "Contacts & support", icon: Phone, superOnly: true },
      { to: "/admin/countries", label: "Pays", icon: Globe, superOnly: true },
      { to: "/admin/settings", label: "Paramètres du site", icon: Settings, superOnly: true },
      { to: "/admin/settings/currencies", label: "Devises & taux", icon: Coins, superOnly: true, badge: "NEW" },
      { to: "/admin/admins", label: "Administrateurs", icon: ShieldCheck, superOnly: true },
      { to: "/admin/team", label: "Équipe & Rôles", icon: Shield, superOnly: true, badge: "NEW" },
      { to: "/admin/audit-logs", label: "Journal d'audit", icon: FileText, superOnly: true },
      { to: "/admin/studio", label: "Studio", icon: BarChart3, superOnly: true, badge: "BETA" },
    ],
  },
];

function AdminLayout() {
  const { loading, user, isAdmin, isSuperAdmin, isSuspended, can } = useAuth();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.navigate({ to: "/login" });
    else if (!isAdmin || isSuspended) router.navigate({ to: "/" });
  }, [loading, user, isAdmin, isSuspended, router]);

  if (loading || !user || !isAdmin || isSuspended) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Chargement…
      </div>
    );
  }

  const canSee = (it: NavItem) => {
    if (it.superOnly) return isSuperAdmin;
    if (it.perm) return can(it.perm);
    return true;
  };

  const visibleGroups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter(canSee) }))
    .filter((g) => g.items.length > 0);

  const allItems = visibleGroups.flatMap((g) => g.items);
  const isActive = (it: NavItem) => (it.exact ? pathname === it.to : pathname.startsWith(it.to));
  const activeItem = [...allItems].reverse().find(isActive) ?? allItems[0];
  const activeGroup = visibleGroups.find((g) => g.items.some(isActive)) ?? visibleGroups[0];

  return (
    <CurrenciesProvider>
    <div className="min-h-screen bg-gradient-to-b from-muted/40 via-muted/20 to-background">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-xl pt-safe">
        {/* Top bar */}
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[88vw] max-w-sm overflow-y-auto p-0">
              <SheetHeader className="border-b px-4 py-3 text-left">
                <SheetTitle className="text-base">Espace Admin</SheetTitle>
              </SheetHeader>

              {/* NAVIGATION RAPIDE — Sortie admin */}
              <div className="border-b bg-muted/30 p-3 space-y-1">
                <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider px-2">
                  Navigation rapide
                </p>
                <Link
                  to="/"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
                >
                  <Home className="h-4 w-4 text-primary shrink-0" />
                  <span className="flex-1">Accueil principal</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
                <Link
                  to="/products"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
                >
                  <Store className="h-4 w-4 text-primary shrink-0" />
                  <span className="flex-1">Retour boutique</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </div>

              <div className="space-y-5 p-3">
                {visibleGroups.map((g) => (
                  <div key={g.id}>
                    <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {g.label}
                    </div>
                    <div className="space-y-0.5">
                      {g.items.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item);
                        return (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={() => setMenuOpen(false)}
                            className={cn(
                              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                              active
                                ? "bg-primary text-primary-foreground"
                                : "text-foreground hover:bg-accent",
                            )}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span className="flex-1 truncate">{item.label}</span>
                            {item.badge && (
                              <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold text-orange-700">
                                {item.badge}
                              </span>
                            )}
                            {!active && !item.badge && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>

          <Link
            to="/"
            className="hidden items-center gap-1 text-sm text-muted-foreground hover:text-foreground sm:flex"
          >
            <ArrowLeft className="h-4 w-4" /> Site
          </Link>

          <div className="ml-1 flex min-w-0 flex-1 items-center gap-2">
            <div className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground sm:flex">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-bold sm:text-base">Espace Admin</span>
                {isSuperAdmin && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                    Super
                  </span>
                )}
              </div>
              <div className="truncate text-[10px] text-muted-foreground lg:hidden">
                {activeGroup?.label} · {activeItem?.label}
              </div>
            </div>
          </div>

          <CurrencySwitcher className="hidden sm:block" />
          <AdminNotificationBell />
        </div>

        {/* Desktop grouped nav */}
        <nav className="mx-auto hidden max-w-7xl items-center gap-4 overflow-x-auto px-3 pb-2 lg:flex">
          {visibleGroups.map((g, idx) => (
            <div key={g.id} className="flex items-center gap-1">
              {idx > 0 && <span className="mr-2 h-5 w-px bg-border" />}
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.label}
              </span>
              {g.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-foreground hover:bg-accent",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" /> {item.label}
                    {item.badge && (
                      <span className="ml-0.5 rounded-full bg-orange-100 px-1.5 py-0 text-[8px] font-bold text-orange-700">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Mobile quick tabs — active group only */}
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 pb-2 lg:hidden">
          {(activeGroup?.items ?? []).map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-card text-foreground hover:bg-accent",
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {item.label}
                {item.badge && (
                  <span className="ml-0.5 rounded-full bg-orange-100 px-1.5 py-0 text-[8px] font-bold text-orange-700">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl p-3 pb-safe">
        <ErrorBoundary label="Admin" resetKey={pathname}>
          <StuckLoadingDetector>
            <Outlet />
          </StuckLoadingDetector>
        </ErrorBoundary>
      </main>
    </div>
    </CurrenciesProvider>
  );
}
