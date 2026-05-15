import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductGridSkeleton } from "@/components/product/ProductCardSkeleton";
import { QuickAddSheet } from "@/components/product/QuickAddSheet";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { pickI18n } from "@/lib/i18n/localized";

export const Route = createFileRoute("/c/$categoryId")({
  component: CategoryPage,
});

function CategoryPage() {
  const { categoryId } = Route.useParams();
  const [quickAdd, setQuickAdd] = useState<string | null>(null);
  const { t, lang } = useI18n();

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

  const { data: descendantIds } = useQuery({
    queryKey: ["category-descendants-all", categoryId],
    queryFn: async () => {
      const ids = [categoryId];
      const { data: l2 } = await supabase
        .from("categories")
        .select("id")
        .eq("parent_id", categoryId);
      if (l2 && l2.length) {
        ids.push(...l2.map((c) => c.id));
        const { data: l3 } = await supabase
          .from("categories")
          .select("id")
          .in("parent_id", l2.map((c) => c.id));
        if (l3) ids.push(...l3.map((c) => c.id));
      }
      return ids;
    },
  });

  const hasChildren = (children?.length ?? 0) > 0;

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["products-by-cat", descendantIds],
    enabled: !!descendantIds && descendantIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, name_i18n, price, code, product_images(url)")
        .eq("status", "approved")
        .in("category_id", descendantIds!)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });

  const categoryName = category ? pickI18n(category.name, (category as { name_i18n?: Record<string, string> | null }).name_i18n, lang) : "";
  const parentName = parent ? pickI18n(parent.name, (parent as { name_i18n?: Record<string, string> | null }).name_i18n, lang) : "";

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-3 pb-safe">
        {/* Breadcrumb — chevrons auto-flip in RTL via global CSS */}
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
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-accent">
                      {c.logo_url ? (
                        <img src={c.logo_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-lg font-bold text-primary">{cName[0]}</span>
                      )}
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} onQuickAdd={setQuickAdd} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t("category.empty")}
            </p>
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
