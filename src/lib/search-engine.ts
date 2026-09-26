import { supabase } from "@/integrations/supabase/client";

/**
 * Moteur de recherche multilingue (index serveur `product_search_index`).
 * Cherche dans les noms FR/EN/AR/originaux, catégories, attributs, descriptions,
 * codes/SKU/barcode, avec synonymes et correction des fautes. Classement fait en base.
 */
export interface SearchHit { product_id: string; score: number; match_kind: string; total: number; corrected: string | null }

export async function searchProductHits(opts: {
  q: string; vendorIds?: string[] | null; min?: number | null; max?: number | null; limit?: number; offset?: number;
}): Promise<SearchHit[]> {
  const { data, error } = await (supabase as any).rpc("search_products_v2", {
    p_q: opts.q,
    p_vendor_ids: opts.vendorIds ?? null,
    p_min: opts.min ?? null,
    p_max: opts.max ?? null,
    p_limit: opts.limit ?? 60,
    p_offset: opts.offset ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as SearchHit[];
}

/** Recherche + chargement des fiches dans l'ordre de pertinence. */
export async function searchProducts<T extends { id: string }>(opts: {
  q: string; select: string; vendorIds?: string[] | null; min?: number | null; max?: number | null; limit?: number;
}): Promise<{ rows: T[]; total: number; corrected: string | null }> {
  if (opts.vendorIds && opts.vendorIds.length === 0) return { rows: [], total: 0, corrected: null };
  const hits = await searchProductHits(opts);
  if (hits.length === 0) return { rows: [], total: 0, corrected: null };
  const ids = hits.map((h) => h.product_id);
  const { data } = await supabase.from("products").select(opts.select).in("id", ids).eq("status", "approved");
  const byId = new Map(((data ?? []) as unknown as T[]).map((r) => [r.id, r]));
  const rows = ids.map((id) => byId.get(id)).filter(Boolean) as T[];
  return { rows, total: Number(hits[0].total) || rows.length, corrected: hits[0].corrected };
}

export async function searchCategories(q: string, limit = 8) {
  const { data, error } = await (supabase as any).rpc("search_categories_v2", { p_q: q, p_limit: limit });
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; name: string; name_i18n: any; level: number; logo_url: string | null; score: number }>;
}
