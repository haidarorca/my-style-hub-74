import { Link } from "@tanstack/react-router";
import { ProductCard, type ProductCardProduct } from "@/components/product/ProductCard";
import { ProductGrid } from "@/components/product/ProductGrid";
import { ProductPricesProvider } from "@/components/product/ProductPricesProvider";
import { ProductGridSkeleton } from "@/components/product/ProductCardSkeleton";
import type { HomeSection } from "@/hooks/use-home-sections";
import { useResolveDisplay } from "@/hooks/use-display-presets";

/**
 * Rendu d'une section produits de l'accueil. Purement présentationnel : la
 * sélection, le classement (priorités admin) et la déduplication globale sont
 * calculés en amont par `useHomeFeed`.
 */
export function HomeSectionBlock({
  section,
  products,
  isLoading,
  onQuickAdd,
}: {
  section: HomeSection;
  products: ProductCardProduct[];
  isLoading?: boolean;
  onQuickAdd: (id: string) => void;
}) {
  const { global, resolve } = useResolveDisplay();

  // Aucun remplissage artificiel : une section sans produit unique disparaît.
  if (!isLoading && products.length === 0) return null;

  return (
    <section className="mt-7">
      <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold sm:text-lg">{section.title}</h2>
          {section.subtitle && (
            <p className="truncate text-xs text-muted-foreground">{section.subtitle}</p>
          )}
        </div>
        {section.kind === "category" && section.category_id && (
          <Link
            to="/c/$categoryId"
            params={{ categoryId: section.category_id }}
            className="shrink-0 text-xs font-semibold text-primary"
          >
            Tout voir →
          </Link>
        )}
      </div>

      {isLoading ? (
        <ProductGridSkeleton count={4} />
      ) : (
        <ProductPricesProvider productIds={products.map((p) => p.id)}>
          <ProductGrid config={global}>
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                display={resolve(p.id, p.category_id ?? null)}
                onQuickAdd={onQuickAdd}
              />
            ))}
          </ProductGrid>
        </ProductPricesProvider>
      )}
    </section>
  );
}
