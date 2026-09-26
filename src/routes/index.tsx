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
import { Flame, ShieldCheck, Sparkles, Truck, SlidersHorizontal } from "lucide-react";
import { CategoryIcon } from "@/components/categories/CategoryIcon";
import { useDeliverableVendorIds } from "@/hooks/use-deliverable-vendors";
import { useHomeSections } from "@/hooks/use-home-sections";
import { HomeSectionBlock } from "@/components/home/HomeSectionBlock";
import { HomeHero } from "@/components/home/HomeHero";
import { ProductGrid } from "@/components/product/ProductGrid";
import { AdminSensitiveBar } from "@/components/admin/sensitive/ProductSensitivity";
import { useResolveDisplay } from "@/hooks/use-display-presets";
import { useCategoryProductCounts } from "@/hooks/use-category-product-counts";
import { RecommendationBlock } from "@/components/product/RecommendationBlock";
import { useRecommendations, useTrendingProducts } from "@/hooks/use-recommendations";
import { useHomeFeed } from "@/hooks/use-home-feed";
import { withoutExcluded, withoutSeen } from "@/lib/home/merchandising";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";

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
  const queryClient = useQueryClient();
  const [universeId, setUniverseId] = useState<string>(ALL);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(null);
  const [subSubCategoryId, setSubSubCategoryId] = useState<string | null>(null);
  const [quickAddProductId, setQuickAddProductId] = useState<string | null>(null);
  const hideTabs = useHideOnScroll();
  const settings = useSiteSettings();
  const { data: banners } = useHomeBanners();
  const { t, lang } = useI18n();
  const { countryId, vendorIds: deliverableVendorIds, ready: deliveryReady } = useDeliverableVendorIds();
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
    isError: productsError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["products", "approved", universeId, subCategoryId, subSubCategoryId, descendantIds, countryId, deliverableVendorIds],
    // Le catalogue se charge dès que la détection de pays est terminée. Une
    // liste de vendeurs vide (null) signifie "aucun filtre", pas "ne rien charger".
    enabled: (!needsDescendants || !!descendantIds) && deliveryReady,
    initialPageParam: 0,
    getNextPageParam: (lastPage: unknown[], allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length,
    queryFn: async ({ pageParam }) => {
      const from = (pageParam as number) * PAGE_SIZE;
      let q = supabase
        .from("products")
        .select("id, name, name_i18n, price, code, category_id, home_priority, home_position, home_excluded, weight_kg, length_cm, width_cm, height_cm, warranty_days, material, material_composition_items, min_order_qty, has_size_guide, origin_country:countries!products_origin_country_id_fkey(name, flag_emoji), profiles!products_vendor_id_profiles_fkey(source_country_id), product_images(url, position)")
        .order("position", { referencedTable: "product_images", ascending: true })
        .limit(1, { referencedTable: "product_images" })
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
        className={`sticky top-16 z-30 border-b border-border bg-background/90 backdrop-blur-xl transition-transform duration-300 ${
          hideTabs ? "-translate-y-[calc(100%+4rem)]" : "translate-y-0"
        }`}
      >
        {/* Niveau 1 — onglets soulignés (style éditorial KawZone) */}
        <div className="no-scrollbar flex gap-5 overflow-x-auto px-4 sm:gap-7">
          {universeTabs.map((u) => {
            const active = universeId === u.id;
            return (
              <button
                key={u.id}
                onClick={() => onSelectUniverse(u.id)}
                aria-current={active ? "true" : undefined}
                className={`relative shrink-0 whitespace-nowrap py-3 text-[0.8125rem] font-semibold tracking-tight transition-colors duration-200 sm:text-sm ${
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {pickI18n(u.name, u.name_i18n, lang)}
                <span
                  className={`absolute inset-x-0 bottom-0 h-[2.5px] rounded-full bg-[var(--brand)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    active ? "scale-x-100" : "scale-x-0"
                  }`}
                />
              </button>
            );
          })}
        </div>
        {/* Niveau 2 — puces fines */}
        {universeId !== ALL && visibleSubs.length > 0 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-border/70 px-4 py-2.5">
            <button
              onClick={() => onSelectSubCategory(null)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                subCategoryId === null
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground/75 hover:border-primary/30 hover:text-foreground"
              }`}
            >
              {t("common.all")}
            </button>
            {visibleSubs.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectSubCategory(c.id)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  subCategoryId === c.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground/75 hover:border-primary/30 hover:text-foreground"
                }`}
              >
                {pickI18n(c.name, (c as { name_i18n?: Record<string, string> | null }).name_i18n, lang)}
              </button>
            ))}
          </div>
        )}
        {/* Niveau 3 — puces discrètes */}
        {subCategoryId && visibleSubSubs.length > 0 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-border/70 px-4 py-2">
            <button
              onClick={() => setSubSubCategoryId(null)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                subSubCategoryId === null
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("common.all")}
            </button>
            {visibleSubSubs.map((c) => (
              <button
                key={c.id}
                onClick={() => setSubSubCategoryId(c.id)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  subSubCategoryId === c.id
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {pickI18n(c.name, (c as { name_i18n?: Record<string, string> | null }).name_i18n, lang)}
              </button>
            ))}
          </div>
        )}
      </div>

      <main className="page-container pb-28 md:pb-10">
        <AdminSensitiveBar />
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

        {/* Accès au catalogue filtrable */}
        <Link
          to="/catalogue"
          className="mt-5 flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm shadow-sm transition-colors hover:border-primary"
        >
          <span className="flex min-w-0 items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate font-semibold">Filtrer tout le catalogue</span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">Matière · Couleur · Taille · Prix · Pays</span>
        </Link>

        {/* Catégories — cartes compactes */}
        {showKind("categories") && universes && universes.length > 0 && (

          <section className="mt-9">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="kz-eyebrow">Univers</p>
                <h2 className="kz-rule mt-1 min-w-0 truncate font-display text-lg font-semibold sm:text-xl">
                  {t("home.section.categories")}
                </h2>
              </div>
              <Link
                to="/categories"
                className="shrink-0 pb-1 text-xs font-semibold text-primary underline-offset-4 hover:underline"
              >
                {t("common.all")} →
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6 lg:grid-cols-8">
              {universes.slice(0, 8).map((c) => {
                const cName = pickI18n(c.name, (c as { name_i18n?: Record<string, string> | null }).name_i18n, lang);
                return (
                  <Link
                    key={c.id}
                    to="/c/$categoryId"
                    params={{ categoryId: c.id }}
                    className="group flex min-w-0 flex-col items-center gap-2 rounded-[calc(var(--radius)+2px)] border border-border bg-card px-1.5 py-3 text-center transition-[border-color,transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[var(--shadow-card)] active:scale-[0.98]"
                  >
                    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-[var(--surface)] transition-colors duration-300 group-hover:bg-accent sm:h-12 sm:w-12">
                      <CategoryIcon
                        logoUrl={c.logo_url}
                        name={cName}
                        iconClassName="h-6 w-6 text-primary sm:h-[26px] sm:w-[26px]"
                        className="flex h-full w-full items-center justify-center"
                      />
                    </div>
                    <span className="line-clamp-2 w-full text-[10.5px] font-semibold leading-tight text-foreground/85 sm:text-xs">{cName}</span>
                  </Link>
                );
              })}
            </div>
            <Link
              to="/categories"
              className="mt-3 flex items-center justify-center rounded-full border border-border bg-card py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent/60 active:scale-[0.98]"
            >
              Voir toutes les catégories →
            </Link>
          </section>
        )}


        {/* Réassurance KawZone */}
        <section className="mt-9 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { Icon: Sparkles, label: t("home.trust.personalization") },
            { Icon: Truck, label: t("home.trust.fast_delivery") },
            { Icon: ShieldCheck, label: t("home.trust.verified") },
          ].map(({ Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-[calc(var(--radius)+2px)] border border-border bg-card px-4 py-3.5 text-left text-[0.8125rem] font-medium"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent">
                <Icon className="h-[18px] w-[18px] text-primary" />
              </span>
              <span className="min-w-0 leading-snug text-foreground/85">{label}</span>
            </div>
          ))}
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
          {productsError && loadedProducts.length === 0 ? (
            <div role="status" className="border-y border-border py-8 text-center">
              <p className="font-semibold text-foreground">Le catalogue est momentanément indisponible.</p>
              <p className="mt-2 text-sm text-muted-foreground">Vos données sont conservées. Réessayez dans quelques instants.</p>
              <Button className="mt-4" variant="outline" onClick={() => void queryClient.invalidateQueries({ queryKey: ["products", "approved"] })}>Réessayer</Button>
            </div>
          ) : productsLoading ? (
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
