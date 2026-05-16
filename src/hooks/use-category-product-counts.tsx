import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a Map of categoryId → count of approved products in that category
 * AND all its descendants (sub & sub-sub categories).
 */
export function useCategoryProductCounts() {
  return useQuery({
    queryKey: ["category-product-counts"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_category_product_counts");
      if (error) throw error;
      const map = new Map<string, number>();
      for (const row of (data ?? []) as Array<{ category_id: string; product_count: number }>) {
        map.set(row.category_id, Number(row.product_count) || 0);
      }
      return map;
    },
  });
}
