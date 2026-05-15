import { Link, useRouter } from "@tanstack/react-router";
import { Search, ShoppingBag, User, LogOut, ShieldCheck, Store, MapPin } from "lucide-react";
import { useHideOnScroll } from "@/hooks/use-hide-on-scroll";

import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/hooks/use-cart";
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

  const handleSignOut = async () => {
    await signOut();
    router.navigate({ to: "/" });
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pt-safe">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-3">
        <Link to="/" className="flex items-center gap-1.5 shrink-0">
          <span className="gradient-primary bg-clip-text text-xl font-extrabold tracking-tight text-transparent">
            ORCA
          </span>
        </Link>

        <Link
          to="/"
          className="flex h-9 flex-1 items-center gap-2 rounded-full bg-muted px-3 text-sm text-muted-foreground transition-colors hover:bg-accent"
        >
          <Search className="h-4 w-4" />
          <span>Rechercher un produit…</span>
        </Link>

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
