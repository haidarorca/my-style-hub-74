/**
 * Flux unique de la page d'accueil.
 *
 * Une seule source de vérité pour décider QUEL produit apparaît DANS QUELLE
 * section : toutes les sections produits sont chargées ici, puis servies dans
 * l'ordre d'affichage avec une déduplication globale (un produit n'apparaît
 * qu'une seule fois sur toute la page d'accueil).
 */
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { ProductCardProduct } from "@/components/product/ProductCard";
import {
  PRODUCT_SECTION_KINDS,
  sectionProductsQueryOptions,
  type HomeSection,
} from "@/hooks/use-home-sections";
import {
  markSeen,
  selectSectionProducts,
  withoutExcluded,
  withoutSeen,
} from "@/lib/home/merchandising";

export interface HomeFeedSlot {
  key: string;
  section?: HomeSection;
  title: string;
  subtitle?: string;
  products: ProductCardProduct[];
  isLoading: boolean;
}

export interface HomeFeedInput {
  sections: HomeSection[];
  /** Recommandations personnalisées (vivier large). */
  reco?: ProductCardProduct[];
  recoLoading?: boolean;
  /** Tendances réelles issues des événements récents (vivier large). */
  trending?: ProductCardProduct[];
  trendingLoading?: boolean;
  /** Nombre d'éléments visés pour les blocs recommandation / tendance. */
  blockSize?: number;
}

export interface HomeFeed {
  /** Sections configurées en admin, dans l'ordre, déjà dédupliquées. */
  sectionSlots: HomeFeedSlot[];
  /** Bloc « Recommandé pour vous ». */
  recoProducts: ProductCardProduct[];
  recoLoading: boolean;
  /** Bloc « Tendances » (vraies données) ou vide s'il n'y a rien d'unique. */
  trendingProducts: ProductCardProduct[];
  trendingLoading: boolean;
  /** Tous les identifiants déjà affichés plus haut sur la page d'accueil. */
  displayedIds: Set<string>;
}

export function useHomeFeed({
  sections,
  reco,
  recoLoading = false,
  trending,
  trendingLoading = false,
  blockSize = 8,
}: HomeFeedInput): HomeFeed {
  const productSections = useMemo(
    () => sections.filter((s) => PRODUCT_SECTION_KINDS.includes(s.kind)),
    [sections],
  );

  const results = useQueries({
    queries: productSections.map((s) => sectionProductsQueryOptions(s) as never),
  }) as Array<{ data?: ProductCardProduct[]; isLoading: boolean }>;

  const pools = results.map((r) => r.data);
  const loadings = results.map((r) => r.isLoading);

  return useMemo(() => {
    const seen = new Set<string>();
    const sectionSlots: HomeFeedSlot[] = [];

    productSections.forEach((section, i) => {
      const pool = withoutSeen(withoutExcluded(pools[i] ?? []), seen);
      const count = Math.max(1, section.max_items || 8);
      // Les produits « à la une » sont choisis à la main : pas de rotation.
      const picked = selectSectionProducts(pool, count, section.id, {
        rotate: section.kind !== "featured",
      });
      markSeen(seen, picked);
      sectionSlots.push({
        key: section.id,
        section,
        title: section.title ?? "",
        subtitle: section.subtitle ?? undefined,
        products: picked,
        isLoading: loadings[i] ?? false,
      });
    });

    const recoPool = withoutSeen(withoutExcluded(reco ?? []), seen);
    const recoProducts = selectSectionProducts(recoPool, blockSize, "home-reco", { rotate: false });
    markSeen(seen, recoProducts);

    const trendingPool = withoutSeen(withoutExcluded(trending ?? []), seen);
    const trendingProducts = selectSectionProducts(trendingPool, blockSize, "home-trending", {
      rotate: false,
    });
    markSeen(seen, trendingProducts);

    return {
      sectionSlots,
      recoProducts,
      recoLoading,
      trendingProducts,
      trendingLoading,
      displayedIds: seen,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    productSections,
    JSON.stringify(pools.map((p) => (p ?? []).map((x) => x.id))),
    loadings.join(","),
    reco,
    trending,
    recoLoading,
    trendingLoading,
    blockSize,
  ]);
}
