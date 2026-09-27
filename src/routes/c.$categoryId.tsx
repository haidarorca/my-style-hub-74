import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronLeft, SlidersHorizontal, Search } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ProductCard, type ProductCardProduct } from "@/components/product/ProductCard";
import { RecommendationBlock } from "@/components/product/RecommendationBlock";
import { PRODUCT_CARD_SELECT } from "@/lib/product-select";
import { useRecommendations } from "@/hooks/use-recommendations";
import { useTracker } from "@/hooks/use-tracker";
import { ProductPricesProvider } from "@/components/product/ProductPricesProvider";
import { ProductGridSkeleton } from "@/components/product/ProductCardSkeleton";
import { QuickAddSheet } from "@/components/product/QuickAddSheet";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { pickI18n } from "@/lib/i18n/localized";
import { CategoryIcon } from "@/components/categories/CategoryIcon";
import { useDeliverableVendorIds } from "@/hooks/use-deliverable-vendors";

export const Route = createFileRoute("/c/$categoryId")({
  component: CategoryPage,
  loader: async ({ params }) => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("categories")
        .select("id, name")
        .eq("id", params.categoryId)
        .maybeSingle();
      return { seo: data ?? null };
    } catch {
      return { seo: null };
    }
  },
  head: ({ params, loaderData }) => {
    const seo = (loaderData as { seo?: { name?: string } | null } | undefined)?.seo;
    const name = seo?.name ?? "Catégorie";
    const title = `${name} — Kawzone`;
    const desc = `Découvrez ${name} sur Kawzone : produits, vendeurs et livraison au Sénégal.`;
    const url = `https://kawzone.com/c/${params.categoryId}`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
});

function CategoryPage() {
  const { categoryId } = Route.useParams();
  const [quickAdd, setQuickAdd] = useState<string | null>(null);
  const { t, lang } = useI18n();

  // Récupérer la catégorie avec son niveau et parent
  const { data: category } = useQuery({
    queryKey: ["category", categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, name_i18n, level, parent_id")
        .eq("id", categoryId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Récupérer le parent (breadcrumb)
  const { data: parent } = useQuery({
    queryKey: ["category-parent", category?.parent_id],
    enabled: !!category?.parent_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name, name_i18n, parent_id")
        .eq("id", category!.parent_id!)
        .maybeSingle();
      return data;
    },
  });

  // Récupérer les enfants directs de la catégorie
  const { data: children } = useQuery({
    queryKey: ["category-children", categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, name_i18n, logo_url, level")
        .eq("parent_id", categoryId)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Branche stricte : la catégorie + ses sous-familles + sous-sous-familles.
  // (Plus de mélange avec les catégories sœurs ou le parent.)
  const { data: descendantIds } = useQuery({
    queryKey: ["category-branch", categoryId],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const ids = new Set<string>([categoryId]);
      let frontier = [categoryId];
      for (let depth = 0; depth < 3 && frontier.length; depth++) {
        const { data } = await supabase.from("categories").select("id").in("parent_id", frontier);
        frontier = (data ?? []).map((c) => c.id).filter((id) => !ids.has(id));
        frontier.forEach((id) => ids.add(id));
      }
      return Array.from(ids);
    },
    enabled: !!categoryId,
  });

  const hasChildren = (children?.length ?? 0) > 0;

  const { countryId, vendorIds: deliverableVendorIds } = useDeliverableVendorIds();

  // Recherche interne à la catégorie + tri + pagination (20 par page, sans plafond).
  const [term, setTerm] = useState("");
  const [debTerm, setDebTerm] = useState("");
  const [sort, setSort] = useState<"new" | "price_asc" | "price_desc">("new");
  useEffect(() => {
    const id = setTimeout(() => setDebTerm(term.trim()), 250);
    return () => clearTimeout(id);
  }, [term]);
  useEffect(() => { setTerm(""); setDebTerm(""); }, [categoryId]);

  const PAGE = 20;
  const {
    data: pages,
    isLoading: productsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["products-by-cat", categoryId, descendantIds, countryId, deliverableVendorIds, debTerm, sort],
    enabled: !!categoryId && !!descendantIds && descendantIds.length > 0,
    initialPageParam: 0,
    getNextPageParam: (last: unknown[], all) => (last.length === PAGE ? all.length * PAGE : undefined),
    queryFn: async ({ pageParam }) => {
      if (!descendantIds || descendantIds.length === 0) return [];
      let q = supabase
        .from("products")
        .select(PRODUCT_CARD_SELECT)
        .order("position", { referencedTable: "product_images", ascending: true })
        .limit(1, { referencedTable: "product_images" })
        .or("group_id.is.null,show_individually.eq.true,group_position.eq.0")
        .eq("status", "approved")
        .in("category_id", descendantIds);
      if (debTerm) {
        const safe = debTerm.replace(/[%,()*]/g, " ").trim();
        if (safe) q = q.or(`name.ilike.%${safe}%,code.ilike.%${safe}%,designation.ilike.%${safe}%`);
      }
      if (deliverableVendorIds && deliverableVendorIds.length > 0) {
        q = q.in("vendor_id", deliverableVendorIds);
      }
      q = sort === "new"
        ? q.order("created_at", { ascending: false }).order("id")
        : q.order("price", { ascending: sort === "price_asc" }).order("id");
      const { data, error } = await q.range(pageParam as number, (pageParam as number) + PAGE - 1);
      if (error) {
        console.error("[CategoryPage] Erreur requête produits:", error);
        throw error;
      }
      return data ?? [];
    },
  });
  const products = pages?.pages.flat();

  // Suivi de la consultation de catégorie (profil d'intérêt).
  const track = useTracker();
  useEffect(() => {
    if (categoryId) track("category_view", { categoryId });
  }, [categoryId, track]);

  // Recommandations complémentaires, jamais mélangées aux résultats.
  const { data: reco, isLoading: recoLoading } = useRecommendations({
    context: "category",
    categoryIds: descendantIds ?? null,
    exclude: (products ?? []).map((p) => p.id),
    limit: 8,
    enabled: !productsLoading,
  });

  const categoryName = category ? pickI18n(category.name, (category as { name_i18n?: Record<string, string> | null }).name_i18n, lang) : "";
  const parentName = parent ? pickI18n(parent.name, (parent as { name_i18n?: Record<string, string> | null }).name_i18n, lang) : "";

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="page-container pb-safe">
        {/* Breadcrumb */}
        <nav aria-label="breadcrumb" className="flex items-center gap-1 py-3 text-xs text-muted-foreground">
          <Link to="/" className="flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="h-3 w-3" /> {t("nav.home")}
          </Link>
          {parent && (
            <>
              <ChevronRight className="h-3 w-3" />
              <Link to="/c/$categoryId" params={{ categoryId: parent.id }} className="hover:text-foreground">
                {parentName}
              </Link>
            </>
          )}
          {category && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="font-semibold text-foreground">{categoryName}</span>
            </>
          )}
        </nav>

        {/* Sub-categories grid */}
        {hasChildren && (
          <section className="mb-6">
            <h2 className="mb-3 text-base font-bold">{t("category.choose_sub")}</h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {children!.map((c) => {
                const cName = pickI18n(c.name, (c as { name_i18n?: Record<string, string> | null }).name_i18n, lang);
                return (
                  <Link
                    key={c.id}
                    to="/c/$categoryId"
                    params={{ categoryId: c.id }}
                    className="flex flex-col items-center gap-2 rounded-2xl bg-card p-3 text-center shadow-soft transition-shadow hover:shadow-card"
                  >
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-accent to-muted">
                      <CategoryIcon
                        logoUrl={c.logo_url}
                        name={cName}
                        iconClassName="h-7 w-7 text-foreground"
                        className="flex h-full w-full items-center justify-center"
                      />
                    </div>
                    <span className="line-clamp-2 text-xs font-medium">{cName}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Products grid */}
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="min-w-0 truncate text-base font-bold">
              {hasChildren ? t("category.all_products") : categoryName || t("nav.products")}
            </h2>
            <Link
              to="/catalogue"
              search={{ cat: categoryId } as any}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold hover:border-primary"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />Filtrer
            </Link>
          </div>
          <div className="mb-3 flex gap-2">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-muted px-3 focus-within:border-primary">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="search"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder={`Chercher dans ${categoryName || "cette catégorie"}`}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              aria-label="Trier"
              className="h-9 shrink-0 rounded-full border border-border bg-background px-2 text-xs"
            >
              <option value="new">Nouveautés</option>
              <option value="price_asc">Prix ↑</option>
              <option value="price_desc">Prix ↓</option>
            </select>
          </div>
          {productsLoading ? (
            <ProductGridSkeleton count={8} />
          ) : products && products.length > 0 ? (
            <ProductPricesProvider productIds={products.map((p) => p.id)}>
              <div className="grid-products">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p as ProductCardProduct} onQuickAdd={setQuickAdd} />
                ))}
              </div>
              {hasNextPage && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="rounded-full border border-border px-5 py-2 text-sm font-semibold hover:border-primary disabled:opacity-50"
                  >
                    {isFetchingNextPage ? "Chargement…" : "Voir plus de produits"}
                  </button>
                </div>
              )}
            </ProductPricesProvider>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              <p>{t("category.empty")}</p>
            </div>
          )}
        </section>

        {/* Recommandations — clairement séparées des résultats */}
        <RecommendationBlock
          title="⭐ Vous pourriez aussi aimer"
          subtitle="Suggestions basées sur vos consultations"
          products={reco}
          isLoading={recoLoading}
          onQuickAdd={setQuickAdd}
        />
      </main>

      <QuickAddSheet
        productId={quickAdd}
        open={!!quickAdd}
        onOpenChange={(o) => !o && setQuickAdd(null)}
      />
    </div>
  );
}
