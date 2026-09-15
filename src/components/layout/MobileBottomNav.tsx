import { Link, useRouterState } from "@tanstack/react-router";
import { House, Boxes, Search, ShoppingCart, UserRound } from "lucide-react";
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
    { to: "/", label: t("nav.home"), icon: House, exact: true, badgeKey: undefined as "cart" | "account" | undefined },
    { to: "/categories", label: t("nav.categories"), icon: Boxes, exact: false, badgeKey: undefined },
    { to: "/search", label: t("nav.search"), icon: Search, exact: false, badgeKey: undefined },
    { to: "/cart", label: t("nav.cart"), icon: ShoppingCart, exact: false, badgeKey: "cart" as const },
    { to: "/account", label: t("nav.account"), icon: UserRound, exact: false, badgeKey: "account" as const },
  ];

  return (
    <nav
      aria-label="Navigation"
      className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-card/92 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "var(--safe-bottom, 0px)" }}
    >
      <ul
        className="mx-auto flex max-w-md items-stretch justify-between px-2"
        style={{ minHeight: "var(--bottom-nav-h)" }}
      >
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
                  "relative mx-auto flex h-full min-h-[44px] w-full max-w-[84px] flex-col items-center justify-center gap-1 pt-1 text-[clamp(9px,2.5vw,10.5px)] font-semibold tracking-[0.01em] transition-colors duration-200",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "relative flex h-8 w-12 items-center justify-center rounded-full transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    active ? "bg-accent" : "bg-transparent",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-[19px] w-[19px] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      active && "-translate-y-px",
                    )}
                    strokeWidth={active ? 2.1 : 1.7}
                  />
                  {badge > 0 && (
                    <span className="absolute right-1.5 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--highlight)] px-1 text-[9px] font-bold text-[var(--highlight-foreground)] ring-2 ring-card">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate px-0.5 leading-none">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
