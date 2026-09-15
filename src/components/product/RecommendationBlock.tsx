/**
 * Bloc de recommandations réutilisable (accueil, catégorie, recherche, produit,
 * panier). Il réutilise les cartes produits existantes : aucun style de carte
 * spécifique n'est créé.
 */
import { useState } from "react";
import { ProductCard, type ProductCardProduct } from "@/components/product/ProductCard";
import { ProductGrid } from "@/components/product/ProductGrid";
import { ProductPricesProvider } from "@/components/product/ProductPricesProvider";
import { ProductGridSkeleton } from "@/components/product/ProductCardSkeleton";
import { QuickAddSheet } from "@/components/product/QuickAddSheet";
import { useResolveDisplay } from "@/hooks/use-display-presets";
import { useTracker } from "@/hooks/use-tracker";

export function RecommendationBlock({
  title,
  subtitle,
  products,
  isLoading,
  icon,
  onQuickAdd,
}: {
  title: string;
  subtitle?: string;
  products: ProductCardProduct[] | undefined;
  isLoading?: boolean;
  icon?: React.ReactNode;
  onQuickAdd?: (id: string) => void;
}) {
  const { global, resolve } = useResolveDisplay();
  const track = useTracker();
  const [localQuickAdd, setLocalQuickAdd] = useState<string | null>(null);
  const handleQuickAdd = onQuickAdd ?? setLocalQuickAdd;

  if (!isLoading && (!products || products.length === 0)) return null;

  return (
    <section className="mt-8 border-t border-border pt-6">
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-base font-bold sm:text-lg">
          {icon}
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>

      {isLoading ? (
        <ProductGridSkeleton count={4} />
      ) : (
        <ProductPricesProvider productIds={(products ?? []).map((p) => p.id)}>
          <ProductGrid config={global}>
            {(products ?? []).map((p) => (
              <div key={p.id} onClickCapture={() => track("reco_click", { productId: p.id, categoryId: p.category_id ?? null })}>
                <ProductCard
                  product={p}
                  display={resolve(p.id, p.category_id ?? null)}
                  onQuickAdd={handleQuickAdd}
                />
              </div>
            ))}
          </ProductGrid>
        </ProductPricesProvider>
      )}

      {!onQuickAdd && (
        <QuickAddSheet
          productId={localQuickAdd}
          open={!!localQuickAdd}
          onOpenChange={(o) => !o && setLocalQuickAdd(null)}
        />
      )}
    </section>
  );
}
