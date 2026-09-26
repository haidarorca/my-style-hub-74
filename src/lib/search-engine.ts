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

/**
 * Moteur v3 : contenu produit > attributs > branche de catégories (récursive),
 * pagination par curseur (score, id), sans plafond de résultats.
 */
export interface SearchCursor { score: number; id: string }
export async function searchProductsPage<T extends { id: string }>(opts: {
  q: string; select: string; vendorIds?: string[] | null; min?: number | null; max?: number | null; limit?: number; cursor?: SearchCursor | null;
}): Promise<{ rows: T[]; total: number; corrected: string | null; next: SearchCursor | null }> {
  const limit = opts.limit ?? 20;
  if (opts.vendorIds && opts.vendorIds.length === 0) return { rows: [], total: 0, corrected: null, next: null };
  const { data, error } = await (supabase as any).rpc("search_products_v3", {
    p_q: opts.q, p_vendor_ids: opts.vendorIds ?? null, p_min: opts.min ?? null, p_max: opts.max ?? null,
    p_limit: limit, p_after_score: opts.cursor?.score ?? null, p_after_id: opts.cursor?.id ?? null,
  });
  if (error) {
    // Repli : ancien moteur (première page seulement).
    if (opts.cursor) return { rows: [], total: 0, corrected: null, next: null };
    const r = await searchProducts<T>({ ...opts, limit: 60 });
    return { ...r, next: null };
  }
  const hits = (data ?? []) as SearchHit[];
  if (hits.length === 0) return { rows: [], total: 0, corrected: null, next: null };
  const ids = hits.map((h) => h.product_id);
  const { data: rowsData } = await supabase.from("products").select(opts.select).in("id", ids).eq("status", "approved");
  const byId = new Map(((rowsData ?? []) as unknown as T[]).map((r) => [r.id, r]));
  const rows = ids.map((id) => byId.get(id)).filter(Boolean) as T[];
  const last = hits[hits.length - 1];
  return {
    rows, total: Number(hits[0].total) || rows.length, corrected: hits[0].corrected,
    next: hits.length >= limit ? { score: Number(last.score), id: last.product_id } : null,
  };
}

/** Recherche + chargement des fiches dans l'ordre de pertinence (ancien moteur, secours). */
export async function searchProducts<T extends { id: string }>(opts: {
  q: string; select: string; vendorIds?: string[] | null; min?: number | null; max?: number | null; limit?: number;
}): Promise<{ rows: T[]; total: number; corrected: string | null }> {
  if (opts.vendorIds && opts.vendorIds.length === 0) return { rows: [], total: 0, corrected: null };
  let hits: SearchHit[];
  try {
    hits = await searchProductHits(opts);
  } catch {
    // Repli : ancienne recherche simple si le moteur est momentanément indisponible.
    const term = opts.q.replace(/[%,()]/g, " ").trim();
    let q = supabase.from("products").select(opts.select).eq("status", "approved")
      .or(`name.ilike.%${term}%,designation.ilike.%${term}%,code.ilike.%${term}%`).limit(opts.limit ?? 60);
    if (opts.vendorIds) q = q.in("vendor_id", opts.vendorIds);
    if (opts.min != null) q = q.gte("price", opts.min);
    if (opts.max != null) q = q.lte("price", opts.max);
    const { data } = await q;
    const rows = (data ?? []) as unknown as T[];
    return { rows, total: rows.length, corrected: null };
  }
  if (hits.length === 0) return { rows: [], total: 0, corrected: null };
  const ids = hits.map((h) => h.product_id);
  const { data } = await supabase.from("products").select(opts.select).in("id", ids).eq("status", "approved");
  const byId = new Map(((data ?? []) as unknown as T[]).map((r) => [r.id, r]));
  const rows = ids.map((id) => byId.get(id)).filter(Boolean) as T[];
  return { rows, total: Number(hits[0].total) || rows.length, corrected: hits[0].corrected };
}

export async function searchCategories(q: string, limit = 8) {
  const { data, error } = await (supabase as any).rpc("search_categories_v2", { p_q: q, p_limit: limit });
  if (error) {
    const { data: fb } = await supabase.from("categories").select("id, name, name_i18n, level, logo_url").ilike("name", `%${q.replace(/[%,()]/g, " ").trim()}%`).limit(limit);
    return (fb ?? []).map((c: any) => ({ ...c, score: 0 }));
  }
  return (data ?? []) as Array<{ id: string; name: string; name_i18n: any; level: number; logo_url: string | null; score: number }>;
}
