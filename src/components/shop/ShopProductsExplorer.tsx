import { useMemo, useState } from "react";
import Fuse from "fuse.js";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductPricesProvider } from "@/components/product/ProductPricesProvider";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";
import { pickI18n } from "@/lib/i18n/localized";

type Variant = {
  id: string;
  size: string | null;
  color: string | null;
  color_hex: string | null;
  stock: number;
  price_override: number | null;
};

export type ShopProduct = {
  id: string;
  name: string;
  name_i18n?: unknown;
  price: number;
  code: string;
  category_id: string | null;
  created_at?: string;
  product_images: { url: string }[] | null;
  product_variants?: Variant[];
};

type Cat = {
  id: string;
  name: string;
  name_i18n?: unknown;
  level: number;
  parent_id: string | null;
};

interface Props {
  products: ShopProduct[];
  allCats: Cat[];
  onQuickAdd: (id: string) => void;
}

interface Filters {
  sizes: string[];
  colors: string[];
  minPrice: string;
  maxPrice: string;
  inStock: boolean;
  promo: boolean;
  isNew: boolean;
  sort: "relevance" | "price_asc" | "price_desc" | "newest";
}

const EMPTY_FILTERS: Filters = {
  sizes: [],
  colors: [],
  minPrice: "",
  maxPrice: "",
  inStock: false,
  promo: false,
  isNew: false,
  sort: "relevance",
};

const NEW_THRESHOLD_DAYS = 30;

export function ShopProductsExplorer({ products, allCats, onQuickAdd }: Props) {
  const { t, lang } = useI18n();
  const [selL1, setSelL1] = useState<string | null>(null);
  const [selL2, setSelL2] = useState<string | null>(null);
  const [selL3, setSelL3] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Category map and used-categories
  const { usedL1, usedL2, usedL3, productCatToL1, productCatToL2 } = useMemo(() => {
    const map = new Map<string, Cat>();
    allCats.forEach((c) => map.set(c.id, c));
    const u1 = new Set<string>();
    const u2 = new Set<string>();
    const u3 = new Set<string>();
    const toL1 = new Map<string, string>();
    const toL2 = new Map<string, string>();
    products.forEach((p) => {
      const cid = p.category_id;
      if (!cid) return;
      let cur = map.get(cid);
      let l1: string | null = null;
      let l2: string | null = null;
      let l3: string | null = null;
      while (cur) {
        if (cur.level === 1) l1 = cur.id;
        if (cur.level === 2) l2 = cur.id;
        if (cur.level === 3) l3 = cur.id;
        cur = cur.parent_id ? map.get(cur.parent_id) : undefined;
      }
      if (l1) { u1.add(l1); toL1.set(cid, l1); }
      if (l2) { u2.add(l2); toL2.set(cid, l2); }
      if (l3) u3.add(l3);
    });
    return { usedL1: u1, usedL2: u2, usedL3: u3, productCatToL1: toL1, productCatToL2: toL2 };
  }, [allCats, products]);

  const l1List = allCats.filter((c) => c.level === 1 && usedL1.has(c.id));
  const l2List = selL1
    ? allCats.filter((c) => c.level === 2 && c.parent_id === selL1 && usedL2.has(c.id))
    : [];
  const l3List = selL2
    ? allCats.filter((c) => c.level === 3 && c.parent_id === selL2 && usedL3.has(c.id))
    : [];

  // Aggregate available sizes/colors and price bounds for filter options
  const { availableSizes, availableColors, priceBounds } = useMemo(() => {
    const sizes = new Set<string>();
    const colors = new Map<string, string | null>(); // color label -> hex
    let min = Infinity;
    let max = 0;
    products.forEach((p) => {
      const variants = p.product_variants ?? [];
      const variantPrices = variants
        .map((v) => v.price_override ?? Number(p.price))
        .filter((n) => Number.isFinite(n));
      const candidates = variantPrices.length ? variantPrices : [Number(p.price)];
      candidates.forEach((px) => {
        if (px < min) min = px;
        if (px > max) max = px;
      });
      variants.forEach((v) => {
        if (v.size && v.size.trim()) sizes.add(v.size.trim());
        if (v.color && v.color.trim()) {
          const key = v.color.trim();
          if (!colors.has(key)) colors.set(key, v.color_hex ?? null);
        }
      });
    });
    return {
      availableSizes: Array.from(sizes).sort((a, b) => a.localeCompare(b)),
      availableColors: Array.from(colors.entries()).map(([label, hex]) => ({ label, hex })),
      priceBounds: { min: Number.isFinite(min) ? Math.floor(min) : 0, max: Math.ceil(max) },
    };
  }, [products]);

  // Category filtering first
  const catFiltered = useMemo(() => {
    return products.filter((p) => {
      const cid = p.category_id;
      if (!selL1) return true;
      if (!cid) return false;
      if (selL3) return cid === selL3;
      if (selL2) return productCatToL2.get(cid) === selL2 || cid === selL2;
      return productCatToL1.get(cid) === selL1 || cid === selL1;
    });
  }, [products, selL1, selL2, selL3, productCatToL2, productCatToL1]);

  // Smart filters
  const smartFiltered = useMemo(() => {
    const minP = filters.minPrice ? Number(filters.minPrice) : null;
    const maxP = filters.maxPrice ? Number(filters.maxPrice) : null;
    const newCutoff = Date.now() - NEW_THRESHOLD_DAYS * 86400000;

    return catFiltered.filter((p) => {
      const variants = p.product_variants ?? [];
      const variantPrices = variants.map((v) => v.price_override ?? Number(p.price));
      const effectivePrices = variantPrices.length ? variantPrices : [Number(p.price)];
      if (minP !== null && !effectivePrices.some((px) => px >= minP)) return false;
      if (maxP !== null && !effectivePrices.some((px) => px <= maxP)) return false;

      if (filters.sizes.length) {
        const ok = variants.some(
          (v) => v.size && filters.sizes.some((s) => s.toLowerCase() === v.size!.toLowerCase()),
        );
        if (!ok) return false;
      }
      if (filters.colors.length) {
        const ok = variants.some(
          (v) => v.color && filters.colors.some((c) => c.toLowerCase() === v.color!.toLowerCase()),
        );
        if (!ok) return false;
      }
      if (filters.inStock) {
        const hasStock = variants.length === 0 || variants.some((v) => (v.stock ?? 0) > 0);
        if (!hasStock) return false;
      }
      if (filters.promo) {
        const hasPromo = variants.some(
          (v) => v.price_override != null && Number(v.price_override) < Number(p.price),
        );
        if (!hasPromo) return false;
      }
      if (filters.isNew) {
        if (!p.created_at || new Date(p.created_at).getTime() < newCutoff) return false;
      }
      return true;
    });
  }, [catFiltered, filters]);

  // Fuzzy search with Fuse
  const fuse = useMemo(() => {
    return new Fuse(smartFiltered, {
      keys: [
        { name: "name", weight: 0.5 },
        { name: "name_i18n.fr", weight: 0.3 },
        { name: "name_i18n.en", weight: 0.3 },
        { name: "name_i18n.ar", weight: 0.3 },
        { name: "code", weight: 0.2 },
        { name: "product_variants.color", weight: 0.15 },
        { name: "product_variants.size", weight: 0.1 },
      ],
      threshold: 0.4,
      ignoreLocation: true,
      includeScore: true,
      minMatchCharLength: 1,
    });
  }, [smartFiltered]);

  const searched = useMemo(() => {
    const q = query.trim();
    if (!q) return smartFiltered;
    return fuse.search(q).map((r) => r.item);
  }, [query, fuse, smartFiltered]);

  // Sort
  const finalProducts = useMemo(() => {
    const rows = [...searched];
    switch (filters.sort) {
      case "price_asc":
        return rows.sort((a, b) => Number(a.price) - Number(b.price));
      case "price_desc":
        return rows.sort((a, b) => Number(b.price) - Number(a.price));
      case "newest":
        return rows.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      default:
        return rows;
    }
  }, [searched, filters.sort]);

  const activeFilterCount =
    filters.sizes.length +
    filters.colors.length +
    (filters.minPrice ? 1 : 0) +
    (filters.maxPrice ? 1 : 0) +
    (filters.inStock ? 1 : 0) +
    (filters.promo ? 1 : 0) +
    (filters.isNew ? 1 : 0) +
    (filters.sort !== "relevance" ? 1 : 0);

  const toggleArr = (key: "sizes" | "colors", v: string) => {
    setFilters((f) => ({
      ...f,
      [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v],
    }));
  };

  return (
    <div>
      {/* Search bar + filters trigger */}
      <div className="sticky top-14 z-20 -mx-3 mt-3 border-b border-border bg-background/95 px-3 pb-2 pt-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-2">
          <div className="flex h-10 min-w-0 flex-1 items-center gap-1 rounded-full border border-border bg-muted pl-3.5 pr-1 shadow-sm focus-within:border-primary focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/30">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("shop_search.placeholder")}
              inputMode="search"
              enterKeyHint="search"
              className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("search.clear")}
                className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant={activeFilterCount > 0 ? "default" : "outline"}
                size="icon"
                className="relative h-10 w-10 shrink-0 rounded-full"
                aria-label={t("search.filters")}
              >
                <SlidersHorizontal className="h-4 w-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>{t("search.filters")}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-5">
                {/* Sort */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground">{t("shop_search.sort")}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      ["relevance", t("shop_search.sort_relevance")],
                      ["newest", t("shop_search.sort_newest")],
                      ["price_asc", t("shop_search.sort_price_asc")],
                      ["price_desc", t("shop_search.sort_price_desc")],
                    ] as const).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setFilters((f) => ({ ...f, sort: k }))}
                        className={`rounded-full border px-3 py-1 text-xs ${
                          filters.sort === k
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Price */}
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">{t("search.price_min")}</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={filters.minPrice}
                      onChange={(e) => setFilters((f) => ({ ...f, minPrice: e.target.value }))}
                      placeholder={String(priceBounds.min || 0)}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">{t("search.price_max")}</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={filters.maxPrice}
                      onChange={(e) => setFilters((f) => ({ ...f, maxPrice: e.target.value }))}
                      placeholder={String(priceBounds.max || 0)}
                    />
                  </label>
                </div>

                {/* Sizes */}
                {availableSizes.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground">{t("search.size")}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {availableSizes.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleArr("sizes", s)}
                          className={`min-w-9 rounded-full border px-3 py-1 text-xs font-semibold ${
                            filters.sizes.includes(s)
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-card"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Colors */}
                {availableColors.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground">{t("search.color")}</div>
                    <div className="flex flex-wrap gap-2">
                      {availableColors.map(({ label, hex }) => {
                        const active = filters.colors.includes(label);
                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() => toggleArr("colors", label)}
                            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                              active
                                ? "border-primary bg-primary/10 text-primary font-semibold"
                                : "border-border bg-card"
                            }`}
                          >
                            <span
                              className="h-3.5 w-3.5 rounded-full border border-border"
                              style={{ backgroundColor: hex ?? "#e5e7eb" }}
                            />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Toggles */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground">{t("shop_search.options")}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      ["inStock", t("shop_search.in_stock")],
                      ["promo", t("shop_search.promo")],
                      ["isNew", t("shop_search.new")],
                    ] as const).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setFilters((f) => ({ ...f, [k]: !f[k] }))}
                        className={`rounded-full border px-3 py-1 text-xs ${
                          filters[k]
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="sticky bottom-0 mt-5 flex gap-2 bg-background pt-3">
                <Button variant="outline" className="flex-1" onClick={() => setFilters(EMPTY_FILTERS)}>
                  {t("common.reset")}
                </Button>
                <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
                  {t("common.apply")}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Active chips */}
        {activeFilterCount > 0 && (
          <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {filters.sort !== "relevance" && (
              <Chip onRemove={() => setFilters((f) => ({ ...f, sort: "relevance" }))}>
                {t(`shop_search.sort_${filters.sort}` as const)}
              </Chip>
            )}
            {filters.minPrice && (
              <Chip onRemove={() => setFilters((f) => ({ ...f, minPrice: "" }))}>
                ≥ {filters.minPrice}
              </Chip>
            )}
            {filters.maxPrice && (
              <Chip onRemove={() => setFilters((f) => ({ ...f, maxPrice: "" }))}>
                ≤ {filters.maxPrice}
              </Chip>
            )}
            {filters.sizes.map((s) => (
              <Chip key={`s-${s}`} onRemove={() => toggleArr("sizes", s)}>{s}</Chip>
            ))}
            {filters.colors.map((c) => (
              <Chip key={`c-${c}`} onRemove={() => toggleArr("colors", c)}>{c}</Chip>
            ))}
            {filters.inStock && (
              <Chip onRemove={() => setFilters((f) => ({ ...f, inStock: false }))}>
                {t("shop_search.in_stock")}
              </Chip>
            )}
            {filters.promo && (
              <Chip onRemove={() => setFilters((f) => ({ ...f, promo: false }))}>
                {t("shop_search.promo")}
              </Chip>
            )}
            {filters.isNew && (
              <Chip onRemove={() => setFilters((f) => ({ ...f, isNew: false }))}>
                {t("shop_search.new")}
              </Chip>
            )}
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-primary hover:underline"
            >
              {t("common.reset")}
            </button>
          </div>
        )}
      </div>

      {/* Category chips */}
      {l1List.length > 0 && (
        <section className="mt-3 space-y-2">
          <div className="-mx-3 overflow-x-auto px-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex gap-2 pb-1">
              <CatChip active={!selL1} onClick={() => { setSelL1(null); setSelL2(null); setSelL3(null); }}>
                {t("shop.cat_all")}
              </CatChip>
              {l1List.map((c) => (
                <CatChip
                  key={c.id}
                  active={selL1 === c.id}
                  onClick={() => { setSelL1(c.id); setSelL2(null); setSelL3(null); }}
                >
                  {pickI18n(c.name, c.name_i18n, lang)}
                </CatChip>
              ))}
            </div>
          </div>
          {l2List.length > 0 && (
            <div className="-mx-3 overflow-x-auto px-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex gap-2 pb-1">
                {l2List.map((c) => (
                  <CatChip
                    key={c.id}
                    active={selL2 === c.id}
                    onClick={() => { setSelL2(selL2 === c.id ? null : c.id); setSelL3(null); }}
                    small
                  >
                    {pickI18n(c.name, c.name_i18n, lang)}
                  </CatChip>
                ))}
              </div>
            </div>
          )}
          {l3List.length > 0 && (
            <div className="-mx-3 overflow-x-auto px-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex gap-2 pb-1">
                {l3List.map((c) => (
                  <CatChip
                    key={c.id}
                    active={selL3 === c.id}
                    onClick={() => setSelL3(selL3 === c.id ? null : c.id)}
                    small
                  >
                    {pickI18n(c.name, c.name_i18n, lang)}
                  </CatChip>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="mt-4">
        <h2 className="mb-3 text-base font-bold">
          {query.trim()
            ? t("shop_search.results_title")
            : selL1
              ? t("shop.products_title")
              : t("shop.all_products_title")}
          <span className="ml-2 text-xs font-normal text-muted-foreground">({finalProducts.length})</span>
        </h2>
        {finalProducts.length > 0 ? (
          <ProductPricesProvider productIds={finalProducts.map((p) => p.id)}>
            <div className="grid-products">
              {finalProducts.map((p) => (
                <ProductCard key={p.id} product={p} onQuickAdd={onQuickAdd} />
              ))}
            </div>
          </ProductPricesProvider>
        ) : (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {query.trim()
              ? t("shop_search.no_results")
              : selL1
                ? t("shop.empty_cat")
                : t("shop.empty_all")}
          </p>
        )}
      </section>
    </div>
  );
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
      {children}
      <button
        type="button"
        onClick={onRemove}
        className="grid h-3.5 w-3.5 place-items-center rounded-full hover:bg-primary/20"
        aria-label="Remove"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

function CatChip({
  children, active, onClick, small,
}: { children: React.ReactNode; active?: boolean; onClick?: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border transition active:scale-[0.98] ${
        small ? "px-3 py-1 text-[11px]" : "px-3.5 py-1.5 text-xs"
      } ${
        active
          ? "border-primary bg-primary text-primary-foreground font-semibold"
          : "border-border bg-card text-foreground/80 hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}
