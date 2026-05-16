import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import Fuse from "fuse.js";
import { Search, X, Clock, TrendingUp, Package, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/hooks/use-i18n";
import { pickI18n } from "@/lib/i18n/localized";
import { useDeliverableVendorIds } from "@/hooks/use-deliverable-vendors";

const RECENT_KEY = "kawzone.recent_searches.v1";
const MAX_RECENT = 6;

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
  const v = term.trim();
  const list = loadRecent().filter((x) => x.toLowerCase() !== v.toLowerCase());
  list.unshift(v);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}
function removeRecent(term: string) {
  if (typeof window === "undefined") return;
  const list = loadRecent().filter((x) => x.toLowerCase() !== term.toLowerCase());
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

function useDebounced<T>(value: T, ms = 180) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function SearchAutocomplete() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { vendorIds: deliverableVendorIds, countryId } = useDeliverableVendorIds();

  const urlQ = useRouterState({
    select: (s) => (s.location.pathname === "/search" ? ((s.location.search as { q?: string })?.q ?? "") : ""),
  });

  const [query, setQuery] = useState(urlQ);
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (pathname === "/search") setQuery(urlQ);
  }, [urlQ, pathname]);

  useEffect(() => setRecent(loadRecent()), [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const debounced = useDebounced(query.trim(), 180);
  const hasQuery = debounced.length >= 1;

  // Live navigation when on /search page (preserves prior behavior)
  const debounceNavRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceNavRef.current) clearTimeout(debounceNavRef.current);
    if (pathname !== "/search") return;
    debounceNavRef.current = setTimeout(() => {
      const q = query.trim();
      if (!q && urlQ) {
        router.navigate({ to: "/search", search: {}, replace: true });
      } else if (q && q !== (urlQ ?? "")) {
        router.navigate({ to: "/search", search: { q }, replace: true });
      }
    }, 220);
    return () => {
      if (debounceNavRef.current) clearTimeout(debounceNavRef.current);
    };
  }, [query, pathname, urlQ, router]);

  // Suggestions: products
  const { data: productSugg } = useQuery({
    queryKey: ["sugg", "products", debounced, countryId, deliverableVendorIds],
    enabled: hasQuery,
    staleTime: 60_000,
    queryFn: async () => {
      const term = debounced;
      const first = term.charAt(0);
      let q = supabase
        .from("products")
        .select("id, name, name_i18n, price, product_images(url)")
        .eq("status", "approved")
        .or(`name.ilike.%${term}%,designation.ilike.%${term}%,code.ilike.%${term}%,name.ilike.${first}%`)
        .limit(20);
      if (deliverableVendorIds) {
        if (deliverableVendorIds.length === 0) return [];
        q = q.in("vendor_id", deliverableVendorIds);
      }
      const { data } = await q;
      return data ?? [];
    },
  });

  // Suggestions: shops
  const { data: shopSugg } = useQuery({
    queryKey: ["sugg", "shops", debounced, deliverableVendorIds],
    enabled: hasQuery,
    staleTime: 60_000,
    queryFn: async () => {
      const term = debounced;
      const first = term.charAt(0);
      let q = (supabase as any)
        .from("public_vendor_profiles")
        .select("id, shop_name, shop_logo_url")
        .not("shop_name", "is", null)
        .or(`shop_name.ilike.%${term}%,shop_name.ilike.${first}%`)
        .limit(10);
      if (deliverableVendorIds) {
        if (deliverableVendorIds.length === 0) return [];
        q = q.in("id", deliverableVendorIds);
      }
      const { data } = await q;
      return data ?? [];
    },
  });

  // Popular products (when no query yet)
  const { data: popular } = useQuery({
    queryKey: ["sugg", "popular", deliverableVendorIds],
    enabled: open && !hasQuery,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id, name, name_i18n")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(5);
      if (deliverableVendorIds) {
        if (deliverableVendorIds.length === 0) return [];
        q = q.in("vendor_id", deliverableVendorIds);
      }
      const { data } = await q;
      return data ?? [];
    },
  });

  // Fuzzy rerank for typo tolerance
  const products = useMemo(() => {
    const rows = productSugg ?? [];
    if (!hasQuery || rows.length === 0) return rows.slice(0, 6);
    const fuse = new Fuse(rows, {
      keys: ["name", "name_i18n.fr", "name_i18n.en", "name_i18n.ar"],
      threshold: 0.45,
      ignoreLocation: true,
    });
    const ranked = fuse.search(debounced).map((r) => r.item);
    // fall back to original if fuse found nothing (e.g. matched via designation only)
    return (ranked.length ? ranked : rows).slice(0, 6);
  }, [productSugg, debounced, hasQuery]);

  const shops = useMemo(() => {
    const rows = shopSugg ?? [];
    if (!hasQuery || rows.length === 0) return rows.slice(0, 3);
    const fuse = new Fuse(rows, { keys: ["shop_name"], threshold: 0.45, ignoreLocation: true });
    const ranked = fuse.search(debounced).map((r) => r.item);
    return (ranked.length ? ranked : rows).slice(0, 3);
  }, [shopSugg, debounced, hasQuery]);

  const submit = (term: string) => {
    const q = term.trim();
    if (!q) return;
    pushRecent(q);
    setRecent(loadRecent());
    setOpen(false);
    router.navigate({ to: "/search", search: { q } });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(query);
  };

  const showDropdown = open && (hasQuery || recent.length > 0 || (popular && popular.length > 0));

  return (
    <div ref={wrapRef} className="relative mx-auto w-full max-w-[130px] sm:max-w-md">
      <form
        onSubmit={onSubmit}
        className="flex h-9 w-full items-center gap-1 rounded-full border border-border bg-muted pl-0.5 pr-0.5 shadow-sm transition-colors focus-within:border-primary focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/30"
      >
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={t("common.search_placeholder")}
          inputMode="search"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground sm:text-sm [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); }}
            aria-label={t("search.clear")}
            className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="submit"
          aria-label={t("common.search")}
          className="shrink-0 rounded-full p-1.5 text-primary hover:text-foreground"
        >
          <Search className="h-4 w-4" />
        </button>
      </form>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[70vh] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-popover shadow-xl sm:left-auto sm:right-0 sm:w-[420px]">
          {/* No query: recent + popular */}
          {!hasQuery && (
            <div className="p-2">
              {recent.length > 0 && (
                <div className="mb-1">
                  <div className="flex items-center justify-between px-2 pb-1 pt-1.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Clock className="h-3 w-3" /> {t("search.recent")}
                    </span>
                  </div>
                  <ul>
                    {recent.map((r) => (
                      <li
                        key={r}
                        className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent"
                      >
                        <button
                          type="button"
                          onClick={() => submit(r)}
                          className="flex flex-1 items-center gap-2 text-left text-sm"
                        >
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="truncate">{r}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeRecent(r); setRecent(loadRecent()); }}
                          className="rounded p-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                          aria-label={t("search.clear")}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {popular && popular.length > 0 && (
                <div className="mt-1">
                  <div className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <TrendingUp className="h-3 w-3" /> {t("search.trending")}
                  </div>
                  <ul>
                    {popular.map((p) => {
                      const name = pickI18n(p.name, p.name_i18n, lang);
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => submit(name)}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent"
                          >
                            <TrendingUp className="h-3.5 w-3.5 text-primary" />
                            <span className="truncate">{name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Query: live results */}
          {hasQuery && (
            <div className="p-2">
              {products.length === 0 && shops.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {t("search.no_results_for")} « {debounced} »
                </div>
              ) : (
                <>
                  {products.length > 0 && (
                    <div className="mb-1">
                      <div className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <Package className="h-3 w-3" /> {t("search.tab_products")}
                      </div>
                      <ul>
                        {products.map((p) => {
                          const name = pickI18n(p.name, p.name_i18n, lang);
                          const img = p.product_images?.[0]?.url;
                          return (
                            <li key={p.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  pushRecent(name);
                                  setOpen(false);
                                  router.navigate({ to: "/product/$productId", params: { productId: p.id } });
                                }}
                                className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-accent"
                              >
                                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-muted">
                                  {img && <img src={img} alt="" className="h-full w-full object-cover" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm">{name}</div>
                                  <div className="text-[11px] font-semibold text-primary">
                                    {Number(p.price).toLocaleString("fr-FR")} {t("misc.currency")}
                                  </div>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  {shops.length > 0 && (
                    <div className="mt-1">
                      <div className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <Store className="h-3 w-3" /> {t("search.tab_shops")}
                      </div>
                      <ul>
                        {(shops as Array<{ id: string; shop_name: string | null; shop_logo_url: string | null }>).map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setOpen(false);
                                router.navigate({ to: "/shop/$vendorId", params: { vendorId: s.id } });
                              }}
                              className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-accent"
                            >
                              <div className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-xs font-bold">
                                {s.shop_logo_url ? (
                                  <img src={s.shop_logo_url} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  s.shop_name?.charAt(0) ?? "?"
                                )}
                              </div>
                              <span className="truncate text-sm">{s.shop_name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => submit(query)}
                    className="mt-2 w-full rounded-lg bg-primary/10 px-3 py-2 text-center text-xs font-semibold text-primary hover:bg-primary/20"
                  >
                    {t("search.see_all_results")}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
