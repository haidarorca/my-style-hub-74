CREATE UNIQUE INDEX IF NOT EXISTS product_variants_external_variant_id_key ON public.product_variants (external_variant_id);
DROP INDEX IF EXISTS public.product_variants_external_variant_id_uniq;