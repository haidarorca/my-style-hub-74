import { useEffect } from "react";
import { createFileRoute, Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, LayoutDashboard, Plus, Package } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/vendor")({
  component: VendorLayout,
});

const NAV: { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }[] = [
  { to: "/vendor", label: "Mes produits", icon: LayoutDashboard, exact: true },
  { to: "/vendor/products/new", label: "Nouveau produit", icon: Plus },
  { to: "/vendor/orders", label: "Commandes", icon: Package },
];

function VendorLayout() {
  const { loading, user, isVendor, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (loading) return;
    if (!user) router.navigate({ to: "/login" });
    else if (!isVendor && !isAdmin) router.navigate({ to: "/" });
  }, [loading, user, isVendor, isAdmin, router]);

  if (loading || !user || (!isVendor && !isAdmin)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Chargement…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur pt-safe">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-3">
          <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Site
          </Link>
          <div className="ml-2 text-base font-bold">Espace Vendeur</div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 pb-2">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-accent",
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl p-3 pb-safe">
        <Outlet />
      </main>
    </div>
  );
}
