import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { pickI18n } from "@/lib/i18n/localized";
import { Skeleton } from "@/components/ui/skeleton";
import { useProductDisplayPrice } from "./ProductPricesProvider";
import { useEstimatedShipping } from "@/hooks/use-estimated-shipping";
import { useFormatDisplay } from "@/hooks/use-currencies";
import { ProductBadges } from "./ProductBadges";
import type { CompositionItem } from "@/lib/textile-materials";

export interface ProductCardProduct {
  id: string;
  name: string;
  price: number;
  code: string;
  name_i18n?: unknown;
  product_images: { url: string }[] | null;
  // Optionnels — quand fournis par le fetcher, permettent d'afficher
  // un "Total estimé" (produit + transport) sur la carte.
  weight_kg?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  // Badges optionnels (affichés seulement si fournis)
  warranty_days?: number | null;
  material?: string | null;
  material_composition_items?: CompositionItem[] | null;
  min_order_qty?: number | null;
  origin_country?:
    | { name?: string | null; flag_emoji?: string | null }
    | Array<{ name?: string | null; flag_emoji?: string | null }>
    | null;
  product_variants?: Array<{ measurements?: Record<string, unknown> | null } | Record<string, unknown>> | null;
  // PostgREST renvoie un objet ou un tableau selon le type de relation.
  profiles?:
    | { source_country_id?: string | null }
    | Array<{ source_country_id?: string | null }>
    | null;
}

interface Props {
  product: ProductCardProduct;
  onQuickAdd: (productId: string) => void;
}

export function ProductCard({ product, onQuickAdd }: Props) {
  const { lang, t } = useI18n();
  const fmt = useFormatDisplay();
  const img = product.product_images?.[0]?.url;
  const displayName = pickI18n(product.name, product.name_i18n as Record<string, string> | null, lang);
  const dp = useProductDisplayPrice(product.id);
  const profile = Array.isArray(product.profiles) ? product.profiles[0] : product.profiles;
  const est = useEstimatedShipping({
    weight_kg: product.weight_kg,
    length_cm: product.length_cm,
    width_cm: product.width_cm,
    height_cm: product.height_cm,
    vendor_source_country_id: profile?.source_country_id ?? null,
  });

  // Total estimé = prix affiché + transport le moins cher (si calculable).
  const showTotal = !!dp && est.isIntl && est.canEstimate && !!est.cheapest;
  const total = showTotal ? Number(dp!.final_price) + est.cheapest!.price : null;

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
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </div>
        <div className="p-[clamp(0.5rem,2vw,0.75rem)]">
          <p className="line-clamp-2 text-[clamp(11px,3.2vw,13px)] leading-snug text-foreground/90 min-h-[2.4em]">
            {displayName}
          </p>
          {dp ? (
            showTotal ? (
              <div className="mt-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/80 leading-none">
                  Total estimé
                </p>
                <p className="mt-0.5 text-[clamp(13px,3.6vw,15px)] font-bold tracking-tight text-primary">
                  {fmt(total!)}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground leading-tight">
                  produit + transport
                </p>
              </div>
            ) : (
              <p className="mt-1.5 text-[clamp(13px,3.6vw,15px)] font-bold tracking-tight text-primary">
                {fmt(dp.final_price)}
              </p>
            )
          ) : (
            <Skeleton className="mt-1.5 h-4 w-1/2" />
          )}
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
