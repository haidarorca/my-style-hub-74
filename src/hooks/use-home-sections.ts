import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_CARD_SELECT } from "@/lib/product-select";
import type { ProductCardProduct } from "@/components/product/ProductCard";

export type HomeSectionKind = "hero" | "categories" | "featured" | "new" | "popular" | "category";

export interface HomeSection {
  id: string;
  kind: HomeSectionKind;
  title: string | null;
  subtitle: string | null;
  enabled: boolean;
  position: number;
  category_id: string | null;
  product_ids: string[];
  max_items: number;
  config: Record<string, unknown> | null;
}

export function useHomeSections(includeDisabled = false) {
  return useQuery({
    queryKey: ["home-sections", includeDisabled],
    staleTime: 30_000,
    queryFn: async () => {
      let q = (supabase as any).from("home_sections").select("*").order("position");
      if (!includeDisabled) q = q.eq("enabled", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as HomeSection[];
    },
  });
}

/** Types de sections qui affichent des produits. */
export const PRODUCT_SECTION_KINDS: HomeSectionKind[] = ["featured", "new", "popular", "category"];

/**
 * Options de requête d'une section produits. Exposées séparément pour que la
 * page d'accueil puisse charger toutes les sections d'un coup (`useQueries`)
 * et appliquer ensuite une déduplication globale.
 */
export function sectionProductsQueryOptions(section: HomeSection) {
  return {
    queryKey: [
      "home-section-products",
      section.id,
      section.kind,
      section.category_id,
      section.product_ids,
      section.max_items,
    ] as const,
    enabled: PRODUCT_SECTION_KINDS.includes(section.kind),
    staleTime: 30_000,
    queryFn: async (): Promise<ProductCardProduct[]> => {
      const limit = Math.max(1, section.max_items || 8);
      // Vivier volontairement plus large que l'affichage : la rotation marketing
      // et la déduplication entre sections piochent dedans.
      const poolLimit = Math.min(90, Math.max(24, limit * 5));
      let q = (supabase as any)
        .from("products")
        .select(PRODUCT_CARD_SELECT)
        .eq("status", "approved")
        .not("category_id", "is", null)
        .eq("home_excluded", false)
        .or("group_id.is.null,show_individually.eq.true,group_position.eq.0")
        .order("position", { referencedTable: "product_images", ascending: true });

      if (section.kind === "featured") {
        const ids = section.product_ids ?? [];
        if (ids.length === 0) return [];
        q = q.in("id", ids).limit(ids.length);
      } else if (section.kind === "new") {
        q = q.order("created_at", { ascending: false }).limit(poolLimit);
      } else if (section.kind === "popular") {
        q = q.order("views_count", { ascending: false }).limit(poolLimit);
      } else if (section.kind === "category") {
        if (!section.category_id) return [];
        const ids = await categoryTreeIds(section.category_id);
        q = q.in("category_id", ids).order("created_at", { ascending: false }).limit(poolLimit);
      }

      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as ProductCardProduct[];
      if (section.kind === "featured") {
        const order = new Map((section.product_ids ?? []).map((id, i) => [id, i]));
        rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      }
      return rows;
    },
  };
}

/** Récupère les produits d'une section (à la une / nouveautés / populaires / catégorie). */
export function useSectionProducts(section: HomeSection | null) {
  const options = section
    ? sectionProductsQueryOptions(section)
    : { queryKey: ["home-section-products", "none"] as const, enabled: false, queryFn: async () => [] as ProductCardProduct[] };
  return useQuery(options as never);
}

/** Ids de la catégorie + ses descendants (niveaux 2 et 3). */
export async function categoryTreeIds(rootId: string): Promise<string[]> {
  const { data: l2 } = await supabase.from("categories").select("id").eq("parent_id", rootId);
  const ids = [rootId, ...(l2 ?? []).map((c) => c.id)];
  if (l2 && l2.length > 0) {
    const { data: l3 } = await supabase
      .from("categories")
      .select("id")
      .in("parent_id", l2.map((c) => c.id));
    ids.push(...(l3 ?? []).map((c) => c.id));
  }
  return ids;
}
