ALTER FUNCTION public.search_jtxt(jsonb) SET search_path = public;
REVOKE ALL ON FUNCTION public.trg_search_index_product() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_search_index_variants_stmt() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_search_index_variant_row() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_search_index_category() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_index_rebuild(uuid[]) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_expand(text) FROM public, anon, authenticated;