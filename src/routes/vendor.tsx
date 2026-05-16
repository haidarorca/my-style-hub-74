import { useEffect } from "react";
import { createFileRoute, Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { Home, LayoutDashboard, Plus, Package, ShoppingBag, MessageSquare, Settings, Store, Bell, Star, Flag } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { BackButton } from "@/components/layout/BackButton";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";

export const Route = createFileRoute("/vendor")({
  component: VendorLayout,
});

const NAV: { to: string; labelKey: string; icon: typeof LayoutDashboard; exact?: boolean }[] = [
  { to: "/vendor", labelKey: "vendor.dashboard", icon: LayoutDashboard, exact: true },
  { to: "/vendor/orders", labelKey: "vendor.orders", icon: ShoppingBag },
  { to: "/vendor/products", labelKey: "vendor.products", icon: Package, exact: true },
  { to: "/vendor/products/new", labelKey: "vendor.products.new_title", icon: Plus },
  { to: "/vendor/reviews", labelKey: "vendor.reviews", icon: Star },
  { to: "/vendor/reports", labelKey: "vendor.reports", icon: Flag },
  { to: "/vendor/notifications", labelKey: "vendor.notifications", icon: Bell },
  { to: "/vendor/messages", labelKey: "vendor.messages", icon: MessageSquare },
  { to: "/vendor/settings", labelKey: "vendor.settings", icon: Settings },
];

function VendorLayout() {
  const { loading, user, isVendor, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { t } = useI18n();

  const { data: unread } = useQuery({
    queryKey: ["vendor", "notif-unread", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("is_read", false);
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (loading) return;
    if (!user) router.navigate({ to: "/login" });
    else if (!isVendor && !isAdmin) router.navigate({ to: "/" });
  }, [loading, user, isVendor, isAdmin, router]);

  if (loading || !user || (!isVendor && !isAdmin)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur pt-safe">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-1.5 px-3">
          <BackButton fallbackTo="/vendor" />
          <div className="min-w-0 flex-1 truncate text-lg font-extrabold tracking-tight text-foreground">
            {t("vendor.space")}
          </div>
          <Link
            to="/"
            aria-label={t("nav.home")}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground shadow-sm hover:bg-accent sm:h-auto sm:w-auto sm:gap-1 sm:px-3 sm:py-1.5 sm:text-xs sm:font-semibold"
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">{t("nav.home")}</span>
          </Link>
          <Link
            to="/shop/$vendorId"
            params={{ vendorId: user.id }}
            aria-label={t("vendor.shop")}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow sm:h-auto sm:w-auto sm:gap-1 sm:px-3 sm:py-1.5 sm:text-xs sm:font-semibold"
          >
            <Store className="h-4 w-4" />
            <span className="hidden sm:inline">{t("vendor.shop")}</span>
          </Link>
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
                <Icon className="h-3.5 w-3.5" /> {t(item.labelKey)}
                {item.to === "/vendor/notifications" && unread && unread > 0 ? (
                  <span className="ml-1 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-white">{unread}</span>
                ) : null}
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
