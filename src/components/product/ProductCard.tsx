import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { pickI18n } from "@/lib/i18n/localized";

export interface ProductCardProduct {
  id: string;
  name: string;
  price: number;
  code: string;
  name_i18n?: unknown;
  product_images: { url: string }[] | null;
}

interface Props {
  product: ProductCardProduct;
  onQuickAdd: (productId: string) => void;
}

export function ProductCard({ product, onQuickAdd }: Props) {
  const { lang, t } = useI18n();
  const img = product.product_images?.[0]?.url;
  const displayName = pickI18n(product.name, product.name_i18n as Record<string, string> | null, lang);
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-card shadow-soft transition-all duration-300 hover:shadow-card hover:-translate-y-0.5">
      <Link
        to="/product/$productId"
        params={{ productId: product.id }}
        className="block"
      >
        <div className="relative aspect-[3/4] overflow-hidden bg-muted">
          {img ? (
            <img
              src={img}
              alt={displayName}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-muted to-accent/30" />
          )}
          {/* Subtle gradient overlay for legibility */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </div>
        <div className="p-2.5">
          <p className="line-clamp-2 text-xs leading-snug text-foreground/90 min-h-[2.25rem]">
            {displayName}
          </p>
          <p className="mt-1.5 text-sm font-bold tracking-tight text-primary">
            {product.price.toLocaleString("fr-FR")} {t("misc.currency")}
          </p>
        </div>
      </Link>

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onQuickAdd(product.id);
        }}
        aria-label={t("product.quick_add_aria")}
        className="absolute top-2 end-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/85 text-foreground backdrop-blur-sm shadow-soft transition-all duration-200 hover:bg-primary hover:text-primary-foreground active:scale-90"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}
