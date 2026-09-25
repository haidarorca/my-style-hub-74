import { Link } from "@tanstack/react-router";
import { ShoppingBasket } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { pickI18n } from "@/lib/i18n/localized";
import { Skeleton } from "@/components/ui/skeleton";
import { useProductDisplayPrice } from "./ProductPricesProvider";
import { useEstimatedShipping } from "@/hooks/use-estimated-shipping";
import { useFormatDisplay } from "@/hooks/use-currencies";
import { ProductBadges } from "./ProductBadges";
import { ShareButton } from "@/components/share/ShareButton";
import { CatalogImage } from "@/components/images/CatalogImage";
import { useAdminSensitiveView, useSensitiveImage } from "@/lib/sensitive-images";
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
  /** Disponibilité fournisseur calculée automatiquement : in | low | out. */
  stock_status?: string | null;
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
  /** Pré-calculé en base : évite de charger toutes les variantes. */
  has_size_guide?: boolean | null;
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
  const adminView = useAdminSensitiveView();
  const sens = useSensitiveImage(product.category_id ?? null, product.id, img ?? null);
  if (adminView.on && adminView.filter !== "all" && !sens.pending && sens.status !== adminView.filter) return null;

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
            categoryId={product.category_id ?? null}
            productId={product.id}
            ratio={cfg.imageRatio}
            className="shrink-0 bg-[var(--surface)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
          />
          {product.stock_status && (
            <span
              className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold shadow-sm ${
                product.stock_status === "out" ? "text-destructive" : product.stock_status === "low" ? "text-warning" : "text-success"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {product.stock_status === "out" ? "Rupture de stock" : product.stock_status === "low" ? "Stock limité" : "En stock"}
            </span>
          )}
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
              Number(dp.final_price) <= 0 ? (
                // Aucun prix valide (ni produit, ni variante) : on n'affiche jamais « 0 FCFA ».
                <p className="mt-2 text-xs font-medium text-muted-foreground">Prix à définir</p>
              ) : showTotal ? (
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
                  {/* Prix issu de la variante la moins chère → « À partir de ». */}
                  {Number(product.price ?? 0) <= 0 && (
                    <span className="mr-1 text-[11px] font-normal text-muted-foreground">À partir de</span>
                  )}
                  {fmt(dp.final_price)}
                </p>
              )
            ) : (
              <Skeleton className="mt-2 h-4 w-1/2" />
            ))}
          {cfg.showBadges && (() => {
            const oc = Array.isArray(product.origin_country) ? product.origin_country[0] : product.origin_country;
            // Valeur pré-calculée en base ; repli sur les variantes quand
            // l'appelant les fournit encore (fiche produit, admin).
            const hasSizeGuide =
              product.has_size_guide ??
              (product.product_variants ?? []).some((v: any) => {
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

      <div className="absolute end-2.5 top-2.5 flex flex-col gap-2 opacity-95 transition-opacity duration-300 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        {cfg.showButton && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onQuickAdd(product.id);
            }}
            aria-label={t("product.quick_add_aria")}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-soft backdrop-blur transition-all duration-200 hover:border-primary hover:bg-primary hover:text-primary-foreground active:scale-90"
          >
            <ShoppingBasket className="h-[17px] w-[17px]" />
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
