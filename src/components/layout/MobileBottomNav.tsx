import { Link, useRouterState } from "@tanstack/react-router";
import { Home, LayoutGrid, Search, ShoppingBag, User } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

const HIDDEN_PREFIXES = ["/admin", "/vendor", "/login", "/signup", "/product"];

export function MobileBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { count } = useCart();
  const { t } = useI18n();

  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return null;
  }

  const items = [
    { to: "/", label: t("nav.home"), icon: Home, exact: true, badgeKey: undefined as "cart" | undefined },
    { to: "/categories", label: t("nav.categories"), icon: LayoutGrid, exact: false, badgeKey: undefined },
    { to: "/search", label: t("nav.search"), icon: Search, exact: false, badgeKey: undefined },
    { to: "/cart", label: t("nav.cart"), icon: ShoppingBag, exact: false, badgeKey: "cart" as const },
    { to: "/account", label: t("nav.account"), icon: User, exact: false, badgeKey: undefined },
  ];

  return (
    <nav
      aria-label="Navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden"
      style={{ paddingBottom: "var(--safe-bottom, 0px)" }}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/");
          const showCart = item.badgeKey === "cart" && count > 0;
          return (
            <li key={item.to} className="flex-1">
              <Link
                to={item.to}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="relative">
                  <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} />
                  {showCart && (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                      {count}
                    </span>
                  )}
                </span>
                <span className="leading-none">{item.label}</span>
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
