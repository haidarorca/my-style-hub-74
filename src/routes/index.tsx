import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/AppHeader";
import { ProductCard, type ProductCardProduct } from "@/components/product/ProductCard";
import { ProductPricesProvider } from "@/components/product/ProductPricesProvider";
import { ProductGridSkeleton } from "@/components/product/ProductCardSkeleton";
import { QuickAddSheet } from "@/components/product/QuickAddSheet";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { supabase } from "@/integrations/supabase/client";
import { useHideOnScroll } from "@/hooks/use-hide-on-scroll";
import { useSiteSettings, useHomeBanners } from "@/hooks/use-site-settings";
import { useI18n } from "@/hooks/use-i18n";
import { pickI18n } from "@/lib/i18n/localized";
import { Flame, ShieldCheck, Sparkles, Truck } from "lucide-react";
import { CategoryIcon } from "@/components/categories/CategoryIcon";
import { useDeliverableVendorIds } from "@/hooks/use-deliverable-vendors";
import { useHomeSections } from "@/hooks/use-home-sections";
import { HomeSectionBlock } from "@/components/home/HomeSectionBlock";
import { HomeHero } from "@/components/home/HomeHero";
import { ProductGrid } from "@/components/product/ProductGrid";
import { useResolveDisplay } from "@/hooks/use-display-presets";
import { useCategoryProductCounts } from "@/hooks/use-category-product-counts";
import { RecommendationBlock } from "@/components/product/RecommendationBlock";
import { useRecommendations, useTrendingProducts } from "@/hooks/use-recommendations";
import { useHomeFeed } from "@/hooks/use-home-feed";
import { withoutExcluded, withoutSeen } from "@/lib/home/merchandising";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "Kawzone — Marketplace au Sénégal" },
      { name: "description", content: "Achetez en ligne au Sénégal : mode, accessoires, maison, électronique. Livraison rapide partout sur Kawzone." },
      { property: "og:title", content: "Kawzone — Marketplace au Sénégal" },
      { property: "og:description", content: "Achetez en ligne au Sénégal : mode, accessoires, maison, électronique." },
      { property: "og:url", content: "https://kawzone.com/" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://kawzone.com/" }],
  }),
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
  const { countryId, vendorIds: deliverableVendorIds } = useDeliverableVendorIds();
  const { data: homeSections } = useHomeSections();
  const { global: globalDisplay, resolve: resolveDisplay } = useResolveDisplay();
  const showKind = (kind: string) =>
    !homeSections || homeSections.length === 0 || homeSections.some((s) => s.kind === kind);

  const { data: counts } = useCategoryProductCounts();

  // Viviers larges : la déduplication globale pioche dedans sans jamais
  // compléter artificiellement une section.
  const { data: reco, isLoading: recoLoading } = useRecommendations({ context: "home", limit: 24 });
  const { data: trending, isLoading: trendingLoading } = useTrendingProducts(24);

  // Source de vérité unique : sélection + priorités admin + déduplication.
  const feed = useHomeFeed({
    sections: homeSections ?? [],
    reco,
    recoLoading,
    trending,
    trendingLoading,
    blockSize: 8,
  });

  const { data: allUniverses } = useQuery({
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

  // Les catégories sans aucun produit publié ne sont jamais affichées en vitrine.
  const universes = useMemo(() => {
    const list = allUniverses ?? [];
    if (!counts) return list;
    return list.filter((c) => (counts.get(c.id) ?? 0) > 0);
  }, [allUniverses, counts]);


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

  const hasStock = (id: string) => !counts || (counts.get(id) ?? 0) > 0;
  const visibleSubs = useMemo(
    () => ((subCategories ?? []) as Array<{ id: string; name: string; name_i18n?: Record<string, string> | null }>).filter((c) => hasStock(c.id)),
    [subCategories, counts],
  );
  const visibleSubSubs = useMemo(
    () => ((subSubCategories ?? []) as Array<{ id: string; name: string; name_i18n?: Record<string, string> | null }>).filter((c) => hasStock(c.id)),
    [subSubCategories, counts],
  );

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

  const PAGE_SIZE = 24;
  const needsDescendants = universeId !== ALL;
  const {
    data: productPages,
    isLoading: productsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["products", "approved", universeId, subCategoryId, subSubCategoryId, descendantIds, countryId, deliverableVendorIds],
    enabled: (!needsDescendants || !!descendantIds) && (!countryId || deliverableVendorIds !== null),
    initialPageParam: 0,
    getNextPageParam: (lastPage: unknown[], allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length,
    queryFn: async ({ pageParam }) => {
      const from = (pageParam as number) * PAGE_SIZE;
      let q = supabase
        .from("products")
        .select("id, name, name_i18n, price, code, category_id, home_priority, home_position, home_excluded, weight_kg, length_cm, width_cm, height_cm, warranty_days, material, material_composition_items, min_order_qty, origin_country:countries!products_origin_country_id_fkey(name, flag_emoji), profiles!products_vendor_id_profiles_fkey(source_country_id), product_images(url, position), product_variants(measurements)")
        .order("position", { referencedTable: "product_images", ascending: true })
        .eq("status", "approved")
        .not("category_id", "is", null) // CORRECTION: exclure les produits sans catégorie
        // Groupes : on n'affiche que les articles visibles seuls + l'article principal du groupe
        .or("group_id.is.null,show_individually.eq.true,group_position.eq.0")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (needsDescendants && descendantIds && descendantIds.length > 0) {
        q = q.in("category_id", descendantIds);
      }
      // KawZone : ne montrer que les vendeurs qui livrent dans le pays choisi.
      if (deliverableVendorIds && deliverableVendorIds.length > 0) {
        q = q.in("vendor_id", deliverableVendorIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const loadedProducts = useMemo(
    () => ((productPages?.pages ?? []).flat() as ProductCardProduct[]),
    [productPages],
  );

  // Vue par défaut de l'accueil : on retire les produits exclus de la vitrine
  // et ceux déjà affichés dans les sections plus haut (déduplication globale).
  // Dès qu'une catégorie est sélectionnée, l'utilisateur navigue dans le
  // catalogue : on ne masque plus rien.
  const products = useMemo(() => {
    if (universeId !== ALL) return loadedProducts;
    return withoutSeen(withoutExcluded(loadedProducts), feed.displayedIds);
  }, [loadedProducts, universeId, feed.displayedIds]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, products.length]);

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
        {universeId !== ALL && visibleSubs.length > 0 && (
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
            {visibleSubs.map((c) => (
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
        {subCategoryId && visibleSubSubs.length > 0 && (
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
            {visibleSubSubs.map((c) => (
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

      <main className="page-container pb-28 md:pb-10">
        {/* Hero: carousel if banners exist, else vitrine marketing */}
        {showKind("hero") && (
          banners && banners.length > 0 ? (
            <HeroCarousel />
          ) : (
            <HomeHero
              title={pickI18n(settings.hero_title, (settings as unknown as { hero_title_i18n?: Record<string, string> | null }).hero_title_i18n, lang)}
              subtitle={pickI18n(settings.hero_subtitle, (settings as unknown as { hero_subtitle_i18n?: Record<string, string> | null }).hero_subtitle_i18n, lang)}
            />
          )
        )}

        {/* Catégories — cartes compactes */}
        {showKind("categories") && universes && universes.length > 0 && (

          <section className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="min-w-0 truncate text-base font-bold">{t("home.section.categories")}</h2>
              <Link
                to="/categories"
                className="shrink-0 text-xs font-semibold text-primary"
              >
                {t("common.all")} →
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
              {universes.slice(0, 8).map((c) => {
                const cName = pickI18n(c.name, (c as { name_i18n?: Record<string, string> | null }).name_i18n, lang);
                return (
                  <Link
                    key={c.id}
                    to="/c/$categoryId"
                    params={{ categoryId: c.id }}
                    className="group flex min-w-0 flex-col items-center gap-1.5 rounded-xl border border-border bg-card px-1 py-2 text-center shadow-soft transition-transform duration-200 active:scale-95"
                  >
                    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-accent/60 sm:h-12 sm:w-12">
                      <CategoryIcon
                        logoUrl={c.logo_url}
                        name={cName}
                        iconClassName="h-6 w-6 text-primary sm:h-7 sm:w-7"
                        className="flex h-full w-full items-center justify-center"
                      />
                    </div>
                    <span className="line-clamp-2 w-full text-[10.5px] font-semibold leading-tight sm:text-xs">{cName}</span>
                  </Link>
                );
              })}
            </div>
            <Link
              to="/categories"
              className="mt-2.5 flex items-center justify-center rounded-xl border border-border bg-muted/50 py-2 text-xs font-semibold text-foreground active:scale-[0.98]"
            >
              Voir toutes les catégories →
            </Link>
          </section>
        )}


        {/* Réassurance KawZone */}
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

        {/* Sections configurables depuis l'admin (déjà dédupliquées) */}
        {feed.sectionSlots.map((slot) => (
          <HomeSectionBlock
            key={slot.key}
            section={slot.section!}
            products={slot.products}
            isLoading={slot.isLoading}
            onQuickAdd={setQuickAddProductId}
          />
        ))}

        {/* Recommandé pour vous — profil d'intérêt */}
        <RecommendationBlock
          title="✨ Recommandé pour vous"
          subtitle="D'après les produits et catégories que vous consultez"
          products={feed.recoProducts}
          isLoading={feed.recoLoading}
          onQuickAdd={setQuickAddProductId}
        />

        {/* Tendances réelles (consultations et paniers récents) */}
        <RecommendationBlock
          title="🔥 Tendances en ce moment"
          subtitle="Les produits les plus consultés ces derniers jours"
          products={feed.trendingProducts}
          isLoading={feed.trendingLoading}
          onQuickAdd={setQuickAddProductId}
        />


        {/* Catalogue — tout le reste, sans répéter les produits déjà affichés */}
        <section className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <Flame className="h-4 w-4 text-primary" />
            <h2 className="text-base font-bold">
              {universeId === ALL ? "À découvrir dans le catalogue" : t("home.section.trending")}
            </h2>
          </div>
          {productsLoading ? (
            <ProductGridSkeleton count={8} />
          ) : products && products.length > 0 ? (
            <ProductPricesProvider productIds={products.map((p) => p.id)}>
              <ProductGrid config={globalDisplay}>
                {products.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    display={resolveDisplay(p.id, p.category_id ?? null)}
                    onQuickAdd={setQuickAddProductId}
                  />
                ))}
              </ProductGrid>
            </ProductPricesProvider>
          ) : (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t("home.empty_products")}
            </p>
          )}

          {/* Chargement progressif au défilement */}
          <div ref={sentinelRef} aria-hidden className="h-px w-full" />
          {isFetchingNextPage && (
            <div className="mt-4">
              <ProductGridSkeleton count={4} />
            </div>
          )}
          {!productsLoading && hasNextPage && !isFetchingNextPage && (
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              className="mt-4 flex w-full items-center justify-center rounded-xl border border-border bg-muted/50 py-2.5 text-sm font-semibold text-foreground active:scale-[0.98]"
            >
              Voir plus de produits
            </button>
          )}
          {!productsLoading && !hasNextPage && products.length > 0 && (
            <p className="mt-5 text-center text-xs text-muted-foreground">
              Vous avez vu tous les produits disponibles.
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
