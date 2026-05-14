import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ProductCard } from "@/components/product/ProductCard";
import { QuickAddSheet } from "@/components/product/QuickAddSheet";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";

export const Route = createFileRoute("/c/$categoryId")({
  component: CategoryPage,
});

function CategoryPage() {
  const { categoryId } = Route.useParams();
  const [quickAdd, setQuickAdd] = useState<string | null>(null);

  const { data: category } = useQuery({
    queryKey: ["category", categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, level, parent_id")
        .eq("id", categoryId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Breadcrumb (parents)
  const { data: parent } = useQuery({
    queryKey: ["category-parent", category?.parent_id],
    enabled: !!category?.parent_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name, parent_id")
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
        .select("id, name, logo_url, level")
        .eq("parent_id", categoryId)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Compute descendant ids for product filtering
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

  const { data: products } = useQuery({
    queryKey: ["products-by-cat", descendantIds],
    enabled: !!descendantIds && descendantIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, code, product_images(url)")
        .eq("status", "approved")
        .in("category_id", descendantIds!)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-3 pb-safe">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 py-3 text-xs text-muted-foreground">
          <Link to="/" className="flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="h-3 w-3" /> Accueil
          </Link>
          {parent && (
            <>
              <ChevronRight className="h-3 w-3" />
              <Link to="/c/$categoryId" params={{ categoryId: parent.id }} className="hover:text-foreground">
                {parent.name}
              </Link>
            </>
          )}
          {category && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="font-semibold text-foreground">{category.name}</span>
            </>
          )}
        </div>

        {/* Sub-categories grid */}
        {hasChildren && (
          <section className="mb-6">
            <h2 className="mb-3 text-base font-bold">Choisir une catégorie</h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {children!.map((c) => (
                <Link
                  key={c.id}
                  to="/c/$categoryId"
                  params={{ categoryId: c.id }}
                  className="flex flex-col items-center gap-2 rounded-xl bg-card p-3 text-center shadow-soft hover:shadow-card"
                >
                  <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-accent">
                    {c.logo_url ? (
                      <img src={c.logo_url} alt={c.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-lg font-bold text-primary">{c.name[0]}</span>
                    )}
                  </div>
                  <span className="line-clamp-2 text-xs font-medium">{c.name}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Products grid (H&M style: tight squares, 2 cols mobile) */}
        <section>
          <h2 className="mb-3 text-base font-bold">
            {hasChildren ? "Tous les produits" : category?.name ?? "Produits"}
          </h2>
          {products && products.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} onQuickAdd={setQuickAdd} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Aucun produit dans cette catégorie pour l'instant.
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
