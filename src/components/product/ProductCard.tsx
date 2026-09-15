import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { pickI18n } from "@/lib/i18n/localized";
import { Skeleton } from "@/components/ui/skeleton";
import { useProductDisplayPrice } from "./ProductPricesProvider";
import { useEstimatedShipping } from "@/hooks/use-estimated-shipping";
import { useFormatDisplay } from "@/hooks/use-currencies";
import { ProductBadges } from "./ProductBadges";
import { ShareButton } from "@/components/share/ShareButton";
import { CatalogImage } from "@/components/images/CatalogImage";
import {
  CARD_PADDING,
  DEFAULT_DISPLAY,
  NAME_CLASS,
  PRICE_CLASS,
  type DisplayConfig,
} from "@/lib/display/display-config";

import type { CompositionItem } from "@/lib/textile-materials";

export interface ProductCardProduct {
  id: string;
  name: string;
  price: number;
  code: string;
  name_i18n?: unknown;
  category_id?: string | null;
  // Merchandising vitrine (piloté depuis l'admin) — optionnels.
  home_priority?: number | null;
  home_position?: number | null;
  home_excluded?: boolean | null;
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
  material_composition_items?: CompositionItem[] | unknown | null;
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
  /** Configuration d'affichage résolue (globale / catégorie / produit). */
  display?: DisplayConfig;
}

export function ProductCard({ product, onQuickAdd, display }: Props) {
  const cfg = display ?? DEFAULT_DISPLAY;
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
    <div className="group relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[calc(var(--radius)+4px)] border border-border bg-card transition-[box-shadow,transform,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:border-primary/25 hover:shadow-[var(--shadow-card)]">
      <Link
        to="/product/$productId"
        params={{ productId: product.id }}
        className="flex min-w-0 flex-1 flex-col"
      >
        <div className="relative overflow-hidden">
          <CatalogImage
            src={img}
            alt={displayName}
            ratio={cfg.imageRatio}
            className="shrink-0 bg-[var(--surface)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
          />
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </div>

        <div className={`flex min-w-0 flex-1 flex-col ${CARD_PADDING[cfg.cardStyle]}`}>
          {cfg.showName && (
            <p className={`line-clamp-2 min-h-[2.4em] leading-snug text-foreground/85 ${NAME_CLASS[cfg.cardStyle]}`}>
              {displayName}
            </p>
          )}
          {cfg.showPrice &&
            (dp ? (
              showTotal ? (
                <div className="mt-2">
                  <p className="kz-eyebrow text-[0.6rem] leading-none">Total estimé</p>
                  <p className={`kz-price mt-1 font-bold text-foreground ${PRICE_CLASS[cfg.cardStyle]}`}>
                    {fmt(total!)}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                    produit + transport
                  </p>
                </div>
              ) : (
                <p className={`kz-price mt-2 font-bold text-foreground ${PRICE_CLASS[cfg.cardStyle]}`}>
                  {fmt(dp.final_price)}
                </p>
              )
            ) : (
              <Skeleton className="mt-2 h-4 w-1/2" />
            ))}
          {cfg.showBadges && (() => {
            const oc = Array.isArray(product.origin_country) ? product.origin_country[0] : product.origin_country;
            const hasSizeGuide = (product.product_variants ?? []).some((v: any) => {
              const m = v?.measurements;
              if (!m || typeof m !== "object") return false;
              return Object.values(m).some((n) => Number(n) > 0);
            });
            return (
              <ProductBadges
                size="xs"
                className="mt-1.5"
                data={{
                  warranty_days: product.warranty_days ?? null,
                  origin_country_name: oc?.name ?? null,
                  origin_country_flag: oc?.flag_emoji ?? null,
                  material: product.material ?? null,
                  material_composition_items: (product.material_composition_items as any) ?? null,
                  min_order_qty: product.min_order_qty ?? null,
                  has_size_guide: hasSizeGuide,
                }}
              />
            );
          })()}
        </div>
      </Link>

      <div className="absolute end-2 top-2 flex flex-col gap-1.5">
        {cfg.showButton && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onQuickAdd(product.id);
            }}
            aria-label={t("product.quick_add_aria")}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-background/85 text-foreground shadow-soft backdrop-blur-sm transition-all duration-200 hover:bg-primary hover:text-primary-foreground active:scale-90"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
          </button>
        )}
        {(() => {
          const oc = Array.isArray(product.origin_country) ? product.origin_country[0] : product.origin_country;
          const vendorSrc = (Array.isArray(product.profiles) ? product.profiles[0]?.source_country_id : product.profiles?.source_country_id) ?? null;
          const originType: "local" | "import" | null = vendorSrc
            ? "import"
            : oc?.name
            ? "local"
            : null;
          const originLabel = oc?.name ? `${oc.flag_emoji ? oc.flag_emoji + " " : ""}${oc.name}` : null;
          return (
            <ShareButton
              variant="icon"
              product={{
                id: product.id,
                name: displayName,
                imageUrl: img ?? null,
                priceLabel: dp ? fmt(Number(dp.final_price)) : `${product.price} XOF`,
                originType,
                originLabel,
              }}
            />
          );
        })()}
      </div>
    </div>
  );
}
