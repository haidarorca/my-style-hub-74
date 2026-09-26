DROP INDEX IF EXISTS public.psi_toks_gin;
CREATE INDEX psi_toks_gin ON public.product_search_index USING gin (toks) WITH (fastupdate = off);
ANALYZE public.product_search_index;