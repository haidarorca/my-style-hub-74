import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/AppHeader";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductPricesProvider } from "@/components/product/ProductPricesProvider";
import { ProductGridSkeleton } from "@/components/product/ProductCardSkeleton";
import { QuickAddSheet } from "@/components/product/QuickAddSheet";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { supabase } from "@/integrations/supabase/client";
import { useHideOnScroll } from "@/hooks/use-hide-on-scroll";
import { useSiteSettings, useHomeBanners } from "@/hooks/use-site-settings";
import { useI18n } from "@/hooks/use-i18n";
import { pickI18n } from "@/lib/i18n/localized";
import { Sparkles, Flame, Truck, ShieldCheck } from "lucide-react";
import { CategoryIcon } from "@/components/categories/CategoryIcon";
import { useCategoryProductCounts } from "@/hooks/use-category-product-counts";
import { useDeliverableVendorIds } from "@/hooks/use-deliverable-vendors";

export const Route = createFileRoute("/")({
  component: Home,
});

const ALL = "__all__";

function Home() {
  const [universeId, setUniverseId] = useState<string>(ALL);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(null);
  const [subSubCategoryId, setSubSubCategoryId] = useState<string | null>(null);
  const [quickAddProductId, setQuickAddProductId] = useState<string | null>(null);
  const hideTabs = useHideOnScroll();
  const settings = useSiteSettings();
  const { data: banners } = useHomeBanners();
  const { t, lang } = useI18n();
  const { data: catCountsMap } = useCategoryProductCounts();
  const { countryId, vendorIds: deliverableVendorIds } = useDeliverableVendorIds();

  const { data: universes } = useQuery({
    queryKey: ["categories", "level1"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, name_i18n, slug, logo_url")
        .eq("level", 1)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: subCategories } = useQuery({
    queryKey: ["categories", "level2", universeId],
    enabled: universeId !== ALL,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, name_i18n, slug")
        .eq("parent_id", universeId)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Level 3 sub-sub-categories of the selected level-2
  const { data: subSubCategories } = useQuery({
    queryKey: ["categories", "level3", subCategoryId],
    enabled: !!subCategoryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, name_i18n, slug")
        .eq("parent_id", subCategoryId!)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Get descendant category ids for filtering
  const { data: descendantIds } = useQuery({
    queryKey: ["category-descendants", universeId, subCategoryId, subSubCategoryId],
    enabled: universeId !== ALL,
    queryFn: async () => {
      const root = subSubCategoryId ?? subCategoryId ?? universeId;
      // Fetch level 2 + 3 children
      const { data: l2 } = await supabase
        .from("categories")
        .select("id")
        .eq("parent_id", root);
      const ids = [root, ...(l2 ?? []).map((c) => c.id)];
      if (l2 && l2.length > 0) {
        const { data: l3 } = await supabase
          .from("categories")
          .select("id")
          .in("parent_id", l2.map((c) => c.id));
        ids.push(...(l3 ?? []).map((c) => c.id));
      }
      return ids;
    },
  });

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["products", "approved", universeId, subCategoryId, subSubCategoryId, descendantIds, countryId, deliverableVendorIds],
    enabled: !countryId || deliverableVendorIds !== null,
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id, name, name_i18n, price, code, product_images(url)")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(40);
      if (universeId !== ALL && descendantIds && descendantIds.length > 0) {
        q = q.in("category_id", descendantIds);
      }
      if (deliverableVendorIds) {
        if (deliverableVendorIds.length === 0) return [];
        q = q.in("vendor_id", deliverableVendorIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const universeTabs = useMemo(
    () => [{ id: ALL, name: t("common.all"), name_i18n: null as Record<string, string> | null }, ...((universes ?? []) as Array<{ id: string; name: string; name_i18n: Record<string, string> | null }>)],
    [universes, t],
  );

  const onSelectUniverse = (id: string) => {
    setUniverseId(id);
    setSubCategoryId(null);
    setSubSubCategoryId(null);
  };

  const onSelectSubCategory = (id: string | null) => {
    setSubCategoryId(id);
    setSubSubCategoryId(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      {/* Universe tabs (horizontal swipe) */}
      <div
        className={`sticky top-14 z-30 border-b border-border bg-background transition-transform duration-300 ${
          hideTabs ? "-translate-y-[calc(100%+3.5rem)]" : "translate-y-0"
        }`}
      >
        <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 py-2">
          {universeTabs.map((u) => (
            <button
              key={u.id}
              onClick={() => onSelectUniverse(u.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                universeId === u.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {pickI18n(u.name, u.name_i18n, lang)}
            </button>
          ))}
        </div>
        {/* Sub-categories (level 2) */}
        {universeId !== ALL && subCategories && subCategories.length > 0 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-border px-3 py-2">
            <button
              onClick={() => onSelectSubCategory(null)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                subCategoryId === null
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {t("common.all")}
            </button>
            {subCategories.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectSubCategory(c.id)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                  subCategoryId === c.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {pickI18n(c.name, (c as { name_i18n?: Record<string, string> | null }).name_i18n, lang)}
              </button>
            ))}
          </div>
        )}
        {/* Sub-sub-categories (level 3) */}
        {subCategoryId && subSubCategories && subSubCategories.length > 0 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-border px-3 py-2">
            <button
              onClick={() => setSubSubCategoryId(null)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] ${
                subSubCategoryId === null
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {t("common.all")}
            </button>
            {subSubCategories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSubSubCategoryId(c.id)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] ${
                  subSubCategoryId === c.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {pickI18n(c.name, (c as { name_i18n?: Record<string, string> | null }).name_i18n, lang)}
              </button>
            ))}
          </div>
        )}
      </div>

      <main className="page-container pb-safe">
        {/* Hero: carousel if banners exist, else gradient */}
        {banners && banners.length > 0 ? (
          <HeroCarousel />
        ) : (
          <section className="mt-3 overflow-hidden rounded-2xl gradient-flash p-5 text-primary-foreground shadow-pink">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider opacity-90">
              <Flame className="h-4 w-4" /> {t("home.new")}
            </div>
            <h1 className="mt-2 text-2xl font-extrabold leading-tight md:text-4xl">
              {pickI18n(settings.hero_title, (settings as unknown as { hero_title_i18n?: Record<string, string> | null }).hero_title_i18n, lang) || t("home.hero_title_default")}
            </h1>
            <p className="mt-2 max-w-md text-sm opacity-90">
              {pickI18n(settings.hero_subtitle, (settings as unknown as { hero_subtitle_i18n?: Record<string, string> | null }).hero_subtitle_i18n, lang) || t("home.hero_subtitle_default")}
            </p>
          </section>
        )}

        {/* Trust strip */}
        <section className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-card p-3 shadow-soft">
            <Sparkles className="mx-auto mb-1 h-5 w-5 text-primary" />
            {t("home.trust.personalization")}
          </div>
          <div className="rounded-xl bg-card p-3 shadow-soft">
            <Truck className="mx-auto mb-1 h-5 w-5 text-primary" />
            {t("home.trust.fast_delivery")}
          </div>
          <div className="rounded-xl bg-card p-3 shadow-soft">
            <ShieldCheck className="mx-auto mb-1 h-5 w-5 text-primary" />
            {t("home.trust.verified")}
          </div>
        </section>

        {/* Categories logos */}
        {universes && universes.length > 0 && (() => {
          const counts = catCountsMap;
          const visibleUniverses = universes.filter((c) => (counts?.get(c.id) ?? 0) > 0);
          if (visibleUniverses.length === 0) return null;
          return (
            <section className="mt-6">
              <h2 className="mb-3 text-base font-bold">{t("home.section.categories")}</h2>
              <div className="grid grid-cols-4 gap-3 md:grid-cols-6">
                {visibleUniverses.map((c) => {
                  const cName = pickI18n(c.name, (c as { name_i18n?: Record<string, string> | null }).name_i18n, lang);
                  return (
                    <Link
                      key={c.id}
                      to="/c/$categoryId"
                      params={{ categoryId: c.id }}
                      className="group flex flex-col items-center gap-1.5 text-center"
                    >
                      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-accent to-muted shadow-sm transition-transform duration-200 group-hover:scale-105 group-active:scale-95">
                        <CategoryIcon logoUrl={c.logo_url} name={cName} iconClassName="h-7 w-7 text-foreground" className="flex h-full w-full items-center justify-center" />
                      </div>
                      <span className="line-clamp-1 text-xs font-medium">{cName}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })()}

        {/* Tendances */}
        <section className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <Flame className="h-4 w-4 text-primary" />
            <h2 className="text-base font-bold">{t("home.section.trending")}</h2>
          </div>
          {productsLoading ? (
            <ProductGridSkeleton count={8} />
          ) : products && products.length > 0 ? (
            <ProductPricesProvider productIds={products.map((p) => p.id)}>
              <div className="grid-products">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} onQuickAdd={setQuickAddProductId} />
                ))}
              </div>
            </ProductPricesProvider>
          ) : (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t("home.empty_products")}
            </p>
          )}
        </section>
      </main>

      <QuickAddSheet
        productId={quickAddProductId}
        open={!!quickAddProductId}
        onOpenChange={(o) => !o && setQuickAddProductId(null)}
      />
    </div>
  );
}
