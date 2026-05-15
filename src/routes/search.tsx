import { useState, useEffect, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon, X, Clock, TrendingUp, SlidersHorizontal, Store, LayoutGrid, Package } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/search")({
  validateSearch: (s: Record<string, unknown>) => ({ q: typeof s.q === "string" ? s.q : "" }),
  head: () => ({
    meta: [
      { title: "Recherche — Kawzone" },
      { name: "description", content: "Recherchez des produits, catégories et boutiques sur Kawzone." },
    ],
  }),
  component: SearchPage,
});

const RECENT_KEY = "kawzone.recent_searches.v1";
const MAX_RECENT = 8;

type Tab = "all" | "products" | "categories" | "shops";

interface Filters {
  minPrice: string;
  maxPrice: string;
  size: string;
  color: string;
}

const EMPTY_FILTERS: Filters = { minPrice: "", maxPrice: "", size: "", color: "" };

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function pushRecent(term: string) {
  if (typeof window === "undefined" || !term.trim()) return;
  const t = term.trim();
  const list = loadRecent().filter((x) => x.toLowerCase() !== t.toLowerCase());
  list.unshift(t);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function SearchPage() {
  const { q: initialQ } = Route.useSearch();
  const navigate = useNavigate();
  const [q, setQ] = useState(initialQ ?? "");
  useEffect(() => {
    setQ(initialQ ?? "");
    if (initialQ) pushRecent(initialQ);
  }, [initialQ]);
  const [tab, setTab] = useState<Tab>("all");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [recent, setRecent] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => setRecent(loadRecent()), []);

  const debounced = useDebounced(q.trim(), 220);

  const hasFilters = useMemo(
    () => filters.minPrice || filters.maxPrice || filters.size || filters.color,
    [filters],
  );

  // Trending: latest approved products (cheap proxy for popular)
  const { data: trending } = useQuery({
    queryKey: ["search", "trending"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(6);
      return data ?? [];
    },
  });

  // Products
  const { data: products, isFetching: pLoading } = useQuery({
    queryKey: ["search", "products", debounced, filters],
    enabled: debounced.length >= 1,
    queryFn: async () => {
      const term = debounced;
      const first = term.charAt(0);
      let q1 = supabase
        .from("products")
        .select("id, name, price, designation, product_images(url), product_variants(size, color)")
        .eq("status", "approved")
        .or(
          `name.ilike.%${term}%,designation.ilike.%${term}%,code.ilike.%${term}%,name.ilike.${first}%,designation.ilike.${first}%`,
        )
        .limit(40);
      if (filters.minPrice) q1 = q1.gte("price", Number(filters.minPrice));
      if (filters.maxPrice) q1 = q1.lte("price", Number(filters.maxPrice));
      const { data } = await q1;
      let rows = data ?? [];
      if (filters.size) {
        rows = rows.filter((p) =>
          p.product_variants?.some((v) => (v.size ?? "").toLowerCase() === filters.size.toLowerCase()),
        );
      }
      if (filters.color) {
        rows = rows.filter((p) =>
          p.product_variants?.some((v) => (v.color ?? "").toLowerCase().includes(filters.color.toLowerCase())),
        );
      }
      // Rank: exact substring match before first-letter-only match
      rows.sort((a, b) => {
        const ai = (a.name ?? "").toLowerCase().includes(term.toLowerCase()) ? 0 : 1;
        const bi = (b.name ?? "").toLowerCase().includes(term.toLowerCase()) ? 0 : 1;
        return ai - bi;
      });
      return rows;
    },
  });

  // Categories
  const { data: categories } = useQuery({
    queryKey: ["search", "categories", debounced],
    enabled: debounced.length >= 1,
    queryFn: async () => {
      const term = debounced;
      const first = term.charAt(0);
      const { data } = await supabase
        .from("categories")
        .select("id, name, level, logo_url")
        .or(`name.ilike.%${term}%,name.ilike.${first}%`)
        .limit(20);
      const rows = data ?? [];
      rows.sort((a, b) => {
        const ai = (a.name ?? "").toLowerCase().includes(term.toLowerCase()) ? 0 : 1;
        const bi = (b.name ?? "").toLowerCase().includes(term.toLowerCase()) ? 0 : 1;
        return ai - bi;
      });
      return rows;
    },
  });

  // Shops (vendor profiles) — match substring OR same first letter
  const { data: shops } = useQuery({
    queryKey: ["search", "shops", debounced],
    enabled: debounced.length >= 1,
    queryFn: async () => {
      const term = debounced;
      const first = term.charAt(0);
      const { data } = await supabase
        .from("profiles")
        .select("id, shop_name, shop_logo_url, address")
        .not("shop_name", "is", null)
        .or(`shop_name.ilike.%${term}%,shop_name.ilike.${first}%`)
        .limit(20);
      const rows = data ?? [];
      rows.sort((a, b) => {
        const ai = (a.shop_name ?? "").toLowerCase().includes(term.toLowerCase()) ? 0 : 1;
        const bi = (b.shop_name ?? "").toLowerCase().includes(term.toLowerCase()) ? 0 : 1;
        return ai - bi;
      });
      return rows;
    },
  });

  // Suggestions (top names matching as the user types — light debounced)
  const suggestions = useMemo(() => {
    if (!debounced || debounced.length < 1) return [];
    const set = new Set<string>();
    (products ?? []).slice(0, 5).forEach((p) => set.add(p.name));
    (categories ?? []).slice(0, 3).forEach((c) => set.add(c.name));
    (shops ?? []).slice(0, 3).forEach((s) => s.shop_name && set.add(s.shop_name));
    return Array.from(set).slice(0, 6);
  }, [debounced, products, categories, shops]);

  const submitTerm = (t: string) => {
    pushRecent(t);
    setRecent(loadRecent());
    navigate({ to: "/search", search: { q: t } });
  };

  const clearRecent = () => {
    if (typeof window !== "undefined") window.localStorage.removeItem(RECENT_KEY);
    setRecent([]);
  };

  const counts = {
    products: products?.length ?? 0,
    categories: categories?.length ?? 0,
    shops: shops?.length ?? 0,
  };

  const showResults = debounced.length >= 1;
  const showProducts = tab === "all" || tab === "products";
  const showCategories = tab === "all" || tab === "categories";
  const showShops = tab === "all" || tab === "shops";

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-3 pt-2">
        <BackButton fallbackTo="/" />

        {/* Filters + tabs (no duplicate input — uses the header search bar) */}
        <div className="sticky top-14 z-30 -mx-3 mt-1 border-b border-border bg-background px-3 pb-2 pt-2">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs text-muted-foreground">
              {q.trim() ? <>Résultats pour <span className="font-semibold text-foreground">« {q.trim()} »</span></> : "Tapez dans la barre en haut"}
            </p>
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant={hasFilters ? "default" : "outline"}
                  size="sm"
                  className="rounded-full"
                  aria-label="Filtres"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filtres
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl">
                <SheetHeader>
                  <SheetTitle>Filtres</SheetTitle>
                </SheetHeader>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">Prix min</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={filters.minPrice}
                      onChange={(e) => setFilters((f) => ({ ...f, minPrice: e.target.value }))}
                      placeholder="0"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">Prix max</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={filters.maxPrice}
                      onChange={(e) => setFilters((f) => ({ ...f, maxPrice: e.target.value }))}
                      placeholder="100000"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">Taille</span>
                    <Input
                      value={filters.size}
                      onChange={(e) => setFilters((f) => ({ ...f, size: e.target.value }))}
                      placeholder="M, L, 42…"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">Couleur</span>
                    <Input
                      value={filters.color}
                      onChange={(e) => setFilters((f) => ({ ...f, color: e.target.value }))}
                      placeholder="rouge, noir…"
                    />
                  </label>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setFilters(EMPTY_FILTERS)}>
                    Réinitialiser
                  </Button>
                  <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
                    Appliquer
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* Tabs */}
          {showResults && (
            <div className="no-scrollbar mt-2 flex gap-1 overflow-x-auto">
              {([
                { id: "all", label: "Tout" },
                { id: "products", label: `Produits (${counts.products})` },
                { id: "categories", label: `Catégories (${counts.categories})` },
                { id: "shops", label: `Boutiques (${counts.shops})` },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id as Tab)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                    tab === t.id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* No query: recent + trending */}
        {!showResults && (
          <div className="mt-4 space-y-6">
            {recent.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-sm font-bold">
                    <Clock className="h-4 w-4" /> Recherches récentes
                  </h2>
                  <button onClick={clearRecent} className="text-xs text-muted-foreground hover:text-foreground">
                    Effacer
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recent.map((r) => (
                    <button
                      key={r}
                      onClick={() => submitTerm(r)}
                      className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {trending && trending.length > 0 && (
              <section>
                <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold">
                  <TrendingUp className="h-4 w-4" /> Tendances
                </h2>
                <div className="flex flex-wrap gap-2">
                  {trending.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => submitTerm(t.name)}
                      className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {recent.length === 0 && (!trending || trending.length === 0) && (
              <p className="mt-10 text-center text-sm text-muted-foreground">
                Tapez pour rechercher des produits, catégories ou boutiques.
              </p>
            )}
          </div>
        )}

        {/* Suggestions */}
        {showResults && suggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => submitTerm(s)}
                className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-accent"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        {showResults && (
          <div className="mt-4 space-y-6">
            {/* Categories */}
            {showCategories && categories && categories.length > 0 && (
              <section>
                <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold">
                  <LayoutGrid className="h-4 w-4" /> Catégories
                </h2>
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => (
                    <Link
                      key={c.id}
                      to="/c/$categoryId"
                      params={{ categoryId: c.id }}
                      className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent"
                    >
                      {c.logo_url && <img src={c.logo_url} alt="" className="h-5 w-5 rounded-full object-cover" />}
                      {c.name}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Shops */}
            {showShops && shops && shops.length > 0 && (
              <section>
                <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold">
                  <Store className="h-4 w-4" /> Boutiques
                </h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {shops.map((s) => (
                    <Link
                      key={s.id}
                      to="/shop/$vendorId"
                      params={{ vendorId: s.id }}
                      className="flex items-center gap-2 rounded-xl border border-border bg-card p-2 hover:bg-accent"
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
                        {s.shop_logo_url ? (
                          <img src={s.shop_logo_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs font-bold">
                            {s.shop_name?.charAt(0) ?? "?"}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold">{s.shop_name}</div>
                        {s.address && <div className="truncate text-[10px] text-muted-foreground">{s.address}</div>}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Products */}
            {showProducts && (
              <section>
                <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold">
                  <Package className="h-4 w-4" /> Produits
                </h2>
                {pLoading && <p className="text-sm text-muted-foreground">Recherche…</p>}
                {!pLoading && products && products.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {products.map((p) => (
                      <Link
                        key={p.id}
                        to="/product/$productId"
                        params={{ productId: p.id }}
                        className="overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:bg-accent"
                      >
                        <div className="aspect-square overflow-hidden bg-muted">
                          {p.product_images?.[0]?.url ? (
                            <img src={p.product_images[0].url} alt={p.name} className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="p-2">
                          <div className="line-clamp-2 text-xs font-semibold">{p.name}</div>
                          <div className="mt-1 text-sm font-bold text-primary">{p.price} FCFA</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  !pLoading && <p className="text-sm text-muted-foreground">Aucun produit trouvé.</p>
                )}
              </section>
            )}

            {/* Empty global */}
            {!pLoading &&
              counts.products === 0 &&
              counts.categories === 0 &&
              counts.shops === 0 && (
                <p className="mt-6 text-center text-sm text-muted-foreground">
                  Aucun résultat pour « {debounced} ». Vérifiez l'orthographe ou essayez un autre mot.
                </p>
              )}
          </div>
        )}
      </div>
    </div>
  );
}
