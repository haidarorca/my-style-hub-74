/**
 * Accès unique aux recommandations : toutes les surfaces passent par ici.
 * Les scores sont calculés côté base (fonctions `reco_*`), la diversification
 * et la rotation sont appliquées par `src/lib/reco/engine.ts`.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_CARD_SELECT } from "@/lib/product-select";
import { useAuth } from "@/hooks/use-auth";
import { getAnonId, selectRecommendations, type RecoContext } from "@/lib/reco/engine";
import type { ProductCardProduct } from "@/components/product/ProductCard";

interface Candidate {
  product_id: string;
  category_id: string | null;
  score: number;
}

async function fetchProducts(ids: string[]): Promise<ProductCardProduct[]> {
  if (ids.length === 0) return [];
  const { data, error } = await (supabase as any)
    .from("products")
    .select(PRODUCT_CARD_SELECT)
    .in("id", ids)
    .eq("status", "approved")
    .order("position", { referencedTable: "product_images", ascending: true })
    .limit(1, { referencedTable: "product_images" });
  if (error) throw error;
  const rows = (data ?? []) as ProductCardProduct[];
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export interface RecoOptions {
  context: RecoContext;
  /** Restreint aux produits d'une famille de catégories (page catégorie / similaires). */
  categoryIds?: string[] | null;
  /** Produits déjà visibles à l'écran, à ne pas répéter. */
  exclude?: string[];
  limit?: number;
  enabled?: boolean;
}

export function useRecommendations({
  context,
  categoryIds = null,
  exclude = [],
  limit = 8,
  enabled = true,
}: RecoOptions) {
  const { user } = useAuth();
  const anonId = getAnonId();

  return useQuery({
     queryKey: ["reco", context, user?.id ?? anonId, categoryIds, exclude, limit],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ProductCardProduct[]> => {
      const { data, error } = await (supabase as any).rpc("reco_products", {
        _user: user?.id ?? null,
        _anon: anonId,
        _limit: 80,
        _exclude: exclude,
      });
      if (error) throw error;
      let candidates = ((data ?? []) as Candidate[]).map((c) => ({
        id: c.product_id,
        categoryId: c.category_id,
        score: Number(c.score),
      }));

      if (categoryIds && categoryIds.length > 0) {
        const set = new Set(categoryIds);
        const inFamily = candidates.filter((c) => c.categoryId && set.has(c.categoryId));
        // On privilégie la famille demandée, puis on complète avec le reste.
        candidates = [...inFamily, ...candidates.filter((c) => !inFamily.includes(c))];
      }

       // Sur une fiche produit, les découvertes de la même famille passent
       // toujours avant les tendances générales, sans requête supplémentaire.
       const picked = selectRecommendations(candidates, { limit, context, exclude, maxPerCategory: context === "product" ? limit : 2 });
      return fetchProducts(picked.map((p) => p.id));
    },
  });
}

/** Tendances réelles (événements récents + consultations). */
export function useTrendingProducts(limit = 8, enabled = true) {
  return useQuery({
    queryKey: ["reco-trending", limit],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ProductCardProduct[]> => {
      const { data, error } = await (supabase as any).rpc("reco_trending", { _limit: limit * 3 });
      if (error) throw error;
      const candidates = ((data ?? []) as Candidate[]).map((c) => ({
        id: c.product_id,
        categoryId: c.category_id,
        score: Number(c.score),
      }));
      const picked = selectRecommendations(candidates, { limit, context: "trending" });
      return fetchProducts(picked.map((p) => p.id));
    },
  });
}
