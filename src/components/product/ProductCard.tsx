import { Link } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ProductCardProduct {
  id: string;
  name: string;
  price: number;
  code: string;
  product_images: { url: string }[] | null;
}

interface Props {
  product: ProductCardProduct;
  onQuickAdd: (productId: string) => void;
}

export function ProductCard({ product, onQuickAdd }: Props) {
  const img = product.product_images?.[0]?.url;
  return (
    <div className="group relative overflow-hidden rounded-xl bg-card shadow-soft transition-shadow hover:shadow-card">
      <Link
        to="/product/$productId"
        params={{ productId: product.id }}
        className="block"
      >
        <div className="aspect-[3/4] overflow-hidden bg-muted">
          {img ? (
            <img
              src={img}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          ) : null}
        </div>
        <div className="p-2">
          <p className="line-clamp-2 text-xs">{product.name}</p>
          <p className="mt-1 text-sm font-bold text-primary">
            {product.price.toLocaleString("fr-FR")} FCFA
          </p>
        </div>
      </Link>

      <Button
        size="icon"
        className="absolute bottom-12 right-2 h-9 w-9 rounded-full shadow-pink"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onQuickAdd(product.id);
        }}
        aria-label="Ajout rapide au panier"
      >
        <ShoppingBag className="h-4 w-4" />
      </Button>
    </div>
  );
}
