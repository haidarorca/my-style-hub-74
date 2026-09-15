import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, House, Boxes, Search, ShoppingCart, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCategoryProductCounts } from "@/hooks/use-category-product-counts";
import { useI18n } from "@/hooks/use-i18n";
import { pickI18n } from "@/lib/i18n/localized";
import { CategoryIcon } from "@/components/categories/CategoryIcon";
import { cn } from "@/lib/utils";

type Cat = {
  id: string;
  name: string;
  name_i18n: Record<string, string> | null;
  logo_url: string | null;
  parent_id: string | null;
  level: number;
};

/**
 * Barre de navigation desktop : Accueil · Catégories (méga-menu) · Recherche · Compte · Panier.
 * Masquée sur mobile où la barre inférieure prend le relais.
 */
export function DesktopNav() {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["categories", "nav-tree", lang],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, name_i18n, logo_url, parent_id, level")
        .lte("level", 2)
        .order("level")
        .order("position");
      if (error) throw error;
      return (data ?? []) as Cat[];
    },
  });

  const { data: counts } = useCategoryProductCounts();
  const hasStock = (id: string) => !counts || (counts.get(id) ?? 0) > 0;

  const all = categories ?? [];
  const level1 = all.filter((c) => c.level === 1 && hasStock(c.id));

  const linkCls =
    "relative flex items-center gap-2 px-3.5 py-3 text-[0.8125rem] font-semibold tracking-[0.01em] text-muted-foreground transition-colors duration-200 hover:text-foreground after:absolute after:inset-x-3.5 after:bottom-1.5 after:h-[2px] after:origin-left after:scale-x-0 after:rounded-full after:bg-[var(--brand)] after:transition-transform after:duration-300 hover:after:scale-x-100";

  return (
    <div className="hidden border-b border-border/70 bg-card/80 backdrop-blur md:block">
      <nav
        aria-label="Navigation principale"
        className="mx-auto flex max-w-7xl items-center gap-1 px-3"
        onMouseLeave={() => setOpen(false)}
      >
        <Link to="/" className={linkCls} activeProps={{ className: "text-foreground bg-accent" }} activeOptions={{ exact: true }}>
          <House className="h-4 w-4" /> {t("nav.home")}
        </Link>

        <div className="relative" onMouseEnter={() => setOpen(true)}>
          <Link to="/categories" className={cn(linkCls, open && "bg-accent text-foreground")}>
            <Boxes className="h-4 w-4" /> {t("nav.categories")}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </Link>

          {open && level1.length > 0 && (
            <div className="absolute left-0 top-full z-50 w-[min(72rem,90vw)] rounded-b-2xl border border-border bg-popover p-4 shadow-xl">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
                {level1.map((cat) => {
                  const catName = pickI18n(cat.name, cat.name_i18n, lang);
                  const subs = all.filter((c) => c.parent_id === cat.id && hasStock(c.id));
                  return (
                    <div key={cat.id} className="min-w-0">
                      <Link
                        to="/c/$categoryId"
                        params={{ categoryId: cat.id }}
                        onClick={() => setOpen(false)}
                        className="flex min-w-0 items-center gap-2 text-sm font-bold hover:text-primary"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/60">
                          <CategoryIcon
                            logoUrl={cat.logo_url}
                            name={catName}
                            iconClassName="h-4 w-4 text-primary"
                            className="flex h-full w-full items-center justify-center"
                          />
                        </span>
                        <span className="truncate">{catName}</span>
                      </Link>
                      <ul className="mt-1.5 space-y-1">
                        {subs.slice(0, 6).map((s) => (
                          <li key={s.id}>
                            <Link
                              to="/c/$categoryId"
                              params={{ categoryId: s.id }}
                              onClick={() => setOpen(false)}
                              className="block truncate text-xs text-muted-foreground hover:text-primary"
                            >
                              {pickI18n(s.name, s.name_i18n, lang)}
                            </Link>
                          </li>
                        ))}
                        {subs.length > 6 && (
                          <li>
                            <Link
                              to="/c/$categoryId"
                              params={{ categoryId: cat.id }}
                              onClick={() => setOpen(false)}
                              className="text-xs font-semibold text-primary"
                            >
                              +{subs.length - 6} autres →
                            </Link>
                          </li>
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <Link to="/search" search={{ q: "" }} className={linkCls} activeProps={{ className: "text-foreground bg-accent" }}>
          <Search className="h-4 w-4" /> {t("nav.search")}
        </Link>
        <Link to="/account" className={linkCls} activeProps={{ className: "text-foreground bg-accent" }}>
          <UserRound className="h-4 w-4" /> {t("nav.account")}
        </Link>
        <Link to="/cart" className={linkCls} activeProps={{ className: "text-foreground bg-accent" }}>
          <ShoppingCart className="h-4 w-4" /> {t("nav.cart")}
        </Link>
      </nav>
    </div>
  );
}
