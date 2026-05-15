import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Search, ShoppingBag, User, LogOut, ShieldCheck, Store, MapPin, Package, X } from "lucide-react";
import { useHideOnScroll } from "@/hooks/use-hide-on-scroll";

import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/hooks/use-cart";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { useI18n } from "@/hooks/use-i18n";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppHeader() {
  const { user, profile, isAdmin, isVendor, signOut } = useAuth();
  const { count } = useCart();
  const router = useRouter();
  const hidden = useHideOnScroll();
  const settings = useSiteSettings();
  const { t } = useI18n();

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const urlQ = useRouterState({
    select: (s) => (s.location.pathname === "/search" ? ((s.location.search as { q?: string })?.q ?? "") : ""),
  });
  const [query, setQuery] = useState(urlQ);

  // Keep input in sync when URL ?q= changes externally (recent searches, trending tags)
  useEffect(() => {
    if (pathname === "/search") setQuery(urlQ);
  }, [urlQ, pathname]);

  // Live-update results: as the user types from any page, navigate to /search?q=…
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const q = query.trim();
      if (!q) {
        // On /search with empty input, clear the q param. Elsewhere do nothing.
        if (pathname === "/search" && urlQ) {
          router.navigate({ to: "/search", search: {}, replace: true });
        }
        return;
      }
      if (pathname === "/search") {
        if (q === (urlQ ?? "")) return;
        router.navigate({ to: "/search", search: { q }, replace: true });
      } else {
        router.navigate({ to: "/search", search: { q } });
      }
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, pathname, urlQ, router]);

  const handleSignOut = async () => {
    await signOut();
    router.navigate({ to: "/" });
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    router.navigate({ to: "/search", search: q ? { q } : {} });
  };

  return (
    <header
      className={`sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pt-safe transition-transform duration-300 ${
        hidden ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      <div className="mx-auto grid h-14 max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-2 px-3">
        <Link
          to="/"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="flex items-center gap-1.5 shrink-0"
          aria-label={t("nav.home")}
        >
          {settings.logo_url ? (
            <img src={settings.logo_url} alt={settings.site_name} className="h-7 w-auto max-w-[56px] object-contain sm:h-8 sm:max-w-[120px]" />
          ) : (
            <span className="gradient-primary bg-clip-text text-sm font-extrabold tracking-tight text-transparent sm:text-xl">
              {settings.site_name}
            </span>
          )}
        </Link>

        {pathname === "/search" || pathname === "/account" || pathname === "/cart" ? (
          <div aria-hidden className="h-10" />
        ) : (
          <form
            onSubmit={submitSearch}
            className="mx-auto flex h-9 w-full max-w-[160px] items-center gap-1 rounded-full border border-border bg-muted pl-0.5 pr-0.5 shadow-sm transition-colors focus-within:border-primary focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/30 xs:max-w-[200px] sm:max-w-md"
          >
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("common.search_placeholder")}
              inputMode="search"
              enterKeyHint="search"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground sm:text-sm"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("search.clear")}
                className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <button type="submit" aria-label={t("common.search")} className="shrink-0 rounded-full p-1.5 text-primary hover:text-foreground">
              <Search className="h-4 w-4" />
            </button>
          </form>
        )}

        <div className="flex items-center gap-1 sm:gap-1.5">
          <LanguageSwitcher />
          <Link to="/cart" className="relative">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full sm:h-9 sm:w-9">
              <ShoppingBag className="h-[18px] w-[18px]" />
            </Button>
            {count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {count}
              </span>
            )}
          </Link>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full sm:h-9 sm:w-9">
                  <User className="h-[18px] w-[18px]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">
                  {profile?.full_name || profile?.email || t("common.account")}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/orders"><Package className="mr-2 h-4 w-4" /> {t("nav.orders")}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/account"><MapPin className="mr-2 h-4 w-4" /> {t("nav.addresses")}</Link>
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link to="/admin"><ShieldCheck className="mr-2 h-4 w-4" /> {t("nav.admin")}</Link>
                  </DropdownMenuItem>
                )}
                {(isVendor || isAdmin) && (
                  <DropdownMenuItem asChild>
                    <Link to="/vendor"><Store className="mr-2 h-4 w-4" /> {t("nav.vendor")}</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" /> {t("common.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/login" className="shrink-0">
              <Button className="h-9 rounded-full px-4 text-[13px] font-semibold shadow-sm whitespace-nowrap transition-all hover:shadow-md active:scale-[0.97] sm:h-10 sm:px-5 sm:text-sm">
                {t("common.login")}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
