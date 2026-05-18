import { Link, useRouterState } from "@tanstack/react-router";
import { Home, LayoutGrid, Search, ShoppingBag, User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCart } from "@/hooks/use-cart";
import { useI18n } from "@/hooks/use-i18n";
import { useAuth } from "@/hooks/use-auth";
import { getUnreadCount } from "@/lib/support.functions";
import { cn } from "@/lib/utils";

const HIDDEN_PREFIXES = ["/admin", "/vendor", "/login", "/signup", "/product", "/cart"];

export function MobileBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { count } = useCart();
  const { user } = useAuth();
  const { t } = useI18n();

  const unreadFn = useServerFn(getUnreadCount);
  const { data: unread = 0 } = useQuery({
    queryKey: ["support-unread", user?.id ?? "anon"],
    queryFn: () => unreadFn(),
    enabled: !!user,
    refetchInterval: 30000,
  });

  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return null;
  }

  const items = [
    { to: "/", label: t("nav.home"), icon: Home, exact: true, badgeKey: undefined as "cart" | "account" | undefined },
    { to: "/categories", label: t("nav.categories"), icon: LayoutGrid, exact: false, badgeKey: undefined },
    { to: "/search", label: t("nav.search"), icon: Search, exact: false, badgeKey: undefined },
    { to: "/cart", label: t("nav.cart"), icon: ShoppingBag, exact: false, badgeKey: "cart" as const },
    { to: "/account", label: t("nav.account"), icon: User, exact: false, badgeKey: "account" as const },
  ];

  return (
    <nav
      aria-label="Navigation"
      className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden"
      style={{ paddingBottom: "var(--safe-bottom, 0px)" }}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-1" style={{ minHeight: "var(--bottom-nav-h)" }}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/");
          const badge =
            item.badgeKey === "cart" ? (count > 0 ? count : 0)
            : item.badgeKey === "account" ? (unread > 0 ? unread : 0)
            : 0;
          return (
            <li key={item.to} className="flex-1">
              <Link
                to={item.to}
                className={cn(
                  "relative mx-auto flex h-full min-h-[44px] w-full max-w-[88px] flex-col items-center justify-center gap-0.5 text-[clamp(9px,2.6vw,11px)] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="relative">
                  <Icon className={cn("h-[clamp(18px,5.2vw,22px)] w-[clamp(18px,5.2vw,22px)] transition-transform", active && "scale-110")} />
                  {badge > 0 && (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                <span className="leading-none truncate max-w-full px-1">{item.label}</span>
                {active && (
                  <span className="absolute inset-x-6 top-0 h-0.5 rounded-b-full bg-primary" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
