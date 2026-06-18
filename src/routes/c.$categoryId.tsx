import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductPricesProvider } from "@/components/product/ProductPricesProvider";
import { ProductGridSkeleton } from "@/components/product/ProductCardSkeleton";
import { QuickAddSheet } from "@/components/product/QuickAddSheet";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
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

  // CORRECTION: Récupérer TOUS les IDs de catégories descendantes
  // incluant la catégorie elle-même, ses enfants et petits-enfants
  const { data: descendantIds } = useQuery({
    queryKey: ["category-descendants-all", categoryId],
    queryFn: async () => {
      const ids = new Set<string>();
      ids.add(categoryId);

      // Récupérer les enfants directs (niveau 2)
      const { data: l2 } = await supabase
        .from("categories")
        .select("id")
        .eq("parent_id", categoryId);

      if (l2 && l2.length > 0) {
        l2.forEach((c) => ids.add(c.id));

        // Récupérer les petits-enfants (niveau 3)
        const { data: l3 } = await supabase
          .from("categories")
          .select("id")
          .in("parent_id", l2.map((c) => c.id));

        if (l3 && l3.length > 0) {
          l3.forEach((c) => ids.add(c.id));
        }
      }

      // Si la catégorie a un parent, récupérer aussi les "cousins"
      // (cas où un produit est assigné à la catégorie parent)
      if (category?.parent_id) {
        ids.add(category.parent_id);

        // Récupérer les frères/sœurs de la catégorie courante
        const { data: siblings } = await supabase
          .from("categories")
          .select("id")
          .eq("parent_id", category.parent_id);

        if (siblings && siblings.length > 0) {
          siblings.forEach((c) => ids.add(c.id));
        }
      }

      return Array.from(ids);
    },
    // CORRECTION: s'assurer que la requête s'exécute même si category n'est pas encore chargée
    enabled: !!categoryId,
  });

  const hasChildren = (children?.length ?? 0) > 0;

  const { countryId, vendorIds: deliverableVendorIds } = useDeliverableVendorIds();

  // CORRECTION: Requête des produits avec vérifications robustes
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["products-by-cat", categoryId, descendantIds, countryId, deliverableVendorIds],
    // CORRECTION: enabled simplifié - on exécute si on a un categoryId et des descendantIds
    enabled: !!categoryId && !!descendantIds && descendantIds.length > 0,
    queryFn: async () => {
      // Vérification défensive
      if (!descendantIds || descendantIds.length === 0) {
        return [];
      }

      let q = supabase
        .from("products")
        .select("id, name, name_i18n, price, code, weight_kg, length_cm, width_cm, height_cm, profiles!products_vendor_id_profiles_fkey(source_country_id), product_images(url)")
        .eq("status", "approved")
        .not("category_id", "is", null) // CORRECTION: exclure les produits sans catégorie
        .in("category_id", descendantIds)
        .order("created_at", { ascending: false })
        .limit(60);

      // CORRECTION: Vérifier deliverableVendorIds de manière plus robuste
      if (deliverableVendorIds && deliverableVendorIds.length > 0) {
        q = q.in("vendor_id", deliverableVendorIds);
      }
      // Si deliverableVendorIds est un tableau vide, on ne filtre pas par vendor
      // pour permettre l'affichage des produits même sans restriction de livraison

      const { data, error } = await q;
      if (error) {
        console.error("[CategoryPage] Erreur requête produits:", error);
        throw error;
      }
      return data ?? [];
    },
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
          <h2 className="mb-3 text-base font-bold">
            {hasChildren ? t("category.all_products") : categoryName || t("nav.products")}
          </h2>
          {productsLoading ? (
            <ProductGridSkeleton count={8} />
          ) : products && products.length > 0 ? (
            <ProductPricesProvider productIds={products.map((p) => p.id)}>
              <div className="grid-products">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} onQuickAdd={setQuickAdd} />
                ))}
              </div>
            </ProductPricesProvider>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              <p>{t("category.empty")}</p>
              {/* CORRECTION: Message d'aide pour le débogage */}
              {descendantIds && descendantIds.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Catégories recherchées: {descendantIds.length} ID(s)
                </p>
              )}
            </div>
          )}
        </section>
      </main>

      <QuickAddSheet
        productId={quickAdd}
        open={!!quickAdd}
        onOpenChange={(o) => !o && setQuickAdd(null)}
      />
    </div>
  );
}
