import { Link } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { pickI18n } from "@/lib/i18n/localized";

export interface ProductCardProduct {
  id: string;
  name: string;
  price: number;
  code: string;
  name_i18n?: Record<string, string> | null;
  product_images: { url: string }[] | null;
}

interface Props {
  product: ProductCardProduct;
  onQuickAdd: (productId: string) => void;
}

export function ProductCard({ product, onQuickAdd }: Props) {
  const { lang, t } = useI18n();
  const img = product.product_images?.[0]?.url;
  const displayName = pickI18n(product.name, product.name_i18n, lang);
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
              alt={displayName}
              loading="lazy"
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          ) : null}
        </div>
        <div className="p-2">
          <p className="line-clamp-2 text-xs">{displayName}</p>
          <p className="mt-1 text-sm font-bold text-primary">
            {product.price.toLocaleString("fr-FR")} {t("misc.currency")}
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
        aria-label={t("product.quick_add_aria")}
      >
        <ShoppingBag className="h-4 w-4" />
      </Button>
    </div>
  );
}
