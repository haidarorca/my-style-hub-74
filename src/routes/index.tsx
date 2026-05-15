import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/AppHeader";
import { ProductCard } from "@/components/product/ProductCard";
import { QuickAddSheet } from "@/components/product/QuickAddSheet";
import { supabase } from "@/integrations/supabase/client";
import { useHideOnScroll } from "@/hooks/use-hide-on-scroll";
import { Sparkles, Flame, Truck, ShieldCheck } from "lucide-react";

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

  const { data: universes } = useQuery({
    queryKey: ["categories", "level1"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, logo_url")
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
        .select("id, name, slug")
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
        .select("id, name, slug")
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

  const { data: products } = useQuery({
    queryKey: ["products", "approved", universeId, subCategoryId, subSubCategoryId, descendantIds],
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id, name, price, code, product_images(url)")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(40);
      if (universeId !== ALL && descendantIds && descendantIds.length > 0) {
        q = q.in("category_id", descendantIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const universeTabs = useMemo(
    () => [{ id: ALL, name: "Tout" }, ...(universes ?? [])],
    [universes],
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
              {u.name}
            </button>
          ))}
        </div>
        {/* Sub-categories (level 2) */}
        {universeId !== ALL && subCategories && subCategories.length > 0 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-border px-3 py-2">
            <button
              onClick={() => onSelectSubCategory(null)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs ${
                subCategoryId === null
                  ? "bg-foreground text-background"
                  : "bg-accent text-foreground"
              }`}
            >
              Tout
            </button>
            {subCategories.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectSubCategory(c.id)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs ${
                  subCategoryId === c.id
                    ? "bg-foreground text-background"
                    : "bg-accent text-foreground"
                }`}
              >
                {c.name}
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
              Tout
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
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <main className="mx-auto max-w-7xl px-3 pb-safe">
        {/* Hero promo banner */}
        <section className="mt-3 overflow-hidden rounded-2xl gradient-flash p-5 text-primary-foreground shadow-pink">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider opacity-90">
            <Flame className="h-4 w-4" /> Nouveautés
          </div>
          <h1 className="mt-2 text-2xl font-extrabold leading-tight md:text-4xl">
            Vos produits préférés,<br />personnalisés à votre image
          </h1>
          <p className="mt-2 max-w-md text-sm opacity-90">
            Ajoutez votre nom, votre logo, votre photo. Commande envoyée directement sur WhatsApp.
          </p>
        </section>

        {/* Trust strip */}
        <section className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-card p-3 shadow-soft">
            <Sparkles className="mx-auto mb-1 h-5 w-5 text-primary" />
            Personnalisation
          </div>
          <div className="rounded-xl bg-card p-3 shadow-soft">
            <Truck className="mx-auto mb-1 h-5 w-5 text-primary" />
            Livraison rapide
          </div>
          <div className="rounded-xl bg-card p-3 shadow-soft">
            <ShieldCheck className="mx-auto mb-1 h-5 w-5 text-primary" />
            Produits vérifiés
          </div>
        </section>

        {/* Categories logos */}
        {universes && universes.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-3 text-base font-bold">Catégories</h2>
            <div className="grid grid-cols-4 gap-3 md:grid-cols-6">
              {universes.map((c) => (
                <Link
                  key={c.id}
                  to="/c/$categoryId"
                  params={{ categoryId: c.id }}
                  className="flex flex-col items-center gap-1.5 text-center"
                >
                  <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-accent">
                    {c.logo_url ? (
                      <img src={c.logo_url} alt={c.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-lg font-bold text-primary">{c.name[0]}</span>
                    )}
                  </div>
                  <span className="line-clamp-1 text-xs">{c.name}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Tendances */}
        <section className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <Flame className="h-4 w-4 text-primary" />
            <h2 className="text-base font-bold">Tendances</h2>
          </div>
          {products && products.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} onQuickAdd={setQuickAddProductId} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Aucun produit publié pour cette sélection.
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
