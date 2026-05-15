import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Search, ShoppingBag, User, LogOut, ShieldCheck, Store, MapPin, Package, X } from "lucide-react";
import { useHideOnScroll } from "@/hooks/use-hide-on-scroll";

import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/hooks/use-cart";
import { useSiteSettings } from "@/hooks/use-site-settings";
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

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const urlQ = useRouterState({
    select: (s) => (s.location.pathname === "/search" ? ((s.location.search as { q?: string })?.q ?? "") : ""),
  });
  const [query, setQuery] = useState(urlQ);

  // Keep input in sync when URL ?q= changes externally (recent searches, trending tags)
  useEffect(() => {
    if (pathname === "/search") setQuery(urlQ);
  }, [urlQ, pathname]);

  // Live-update URL while typing on /search so results refresh without a second bar
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (pathname !== "/search") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const q = query.trim();
      if (q === (urlQ ?? "")) return;
      router.navigate({ to: "/search", search: q ? { q } : {}, replace: true });
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
          aria-label="Retour à l'accueil"
        >
          {settings.logo_url ? (
            <img src={settings.logo_url} alt={settings.site_name} className="h-8 w-auto max-w-[88px] object-contain sm:max-w-[120px]" />
          ) : (
            <span className="gradient-primary bg-clip-text text-lg font-extrabold tracking-tight text-transparent sm:text-xl">
              {settings.site_name}
            </span>
          )}
        </Link>

        {pathname === "/search" || pathname === "/account" || pathname === "/cart" ? (
          <div aria-hidden className="h-10" />
        ) : (
          <form
            onSubmit={submitSearch}
            className="mx-auto flex h-10 w-full max-w-xl items-center gap-1.5 rounded-full border border-border bg-muted pl-1 pr-1 shadow-sm transition-colors focus-within:border-primary focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/30"
          >
            <button
              type="submit"
              aria-label="Lancer la recherche"
              className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-primary"
            >
              <Search className="h-4 w-4" />
            </button>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher…"
              inputMode="search"
              enterKeyHint="search"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Effacer"
                className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {query.trim() && (
              <button
                type="submit"
                className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-pink active:scale-95 transition-transform"
              >
                OK
              </button>
            )}
          </form>
        )}

        <div className="flex items-center gap-1">
          {/* Top-positioned actions so phone gesture bar doesn't interfere */}
          <Link to="/cart" className="relative">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ShoppingBag className="h-5 w-5" />
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
                <Button variant="ghost" size="icon" className="rounded-full">
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">
                  {profile?.full_name || profile?.email || "Mon compte"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/orders"><Package className="mr-2 h-4 w-4" /> Mes commandes</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/account"><MapPin className="mr-2 h-4 w-4" /> Mes adresses</Link>
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link to="/admin"><ShieldCheck className="mr-2 h-4 w-4" /> Espace admin</Link>
                  </DropdownMenuItem>
                )}
                {(isVendor || isAdmin) && (
                  <DropdownMenuItem asChild>
                    <Link to="/vendor"><Store className="mr-2 h-4 w-4" /> Espace vendeur</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" /> Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/login">
              <Button size="sm" className="rounded-full">
                Connexion
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
