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
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-3">
        <Link
          to="/"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="flex items-center gap-1.5 shrink-0"
          aria-label="Retour à l'accueil"
        >
          {settings.logo_url ? (
            <img src={settings.logo_url} alt={settings.site_name} className="h-8 w-auto max-w-[120px] object-contain" />
          ) : (
            <span className="gradient-primary bg-clip-text text-xl font-extrabold tracking-tight text-transparent">
              {settings.site_name}
            </span>
          )}
        </Link>

        <form
          onSubmit={submitSearch}
          className="flex h-9 flex-1 items-center gap-2 rounded-full bg-muted px-3 transition-colors focus-within:bg-accent"
        >
          <button type="submit" aria-label="Rechercher" className="text-muted-foreground">
            <Search className="h-4 w-4" />
          </button>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un produit, boutique…"
            inputMode="search"
            enterKeyHint="search"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Effacer"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>

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
    </header>
  );
}
