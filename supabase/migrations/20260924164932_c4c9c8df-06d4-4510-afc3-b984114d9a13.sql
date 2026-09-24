ALTER TABLE public.cj_products
  ADD COLUMN IF NOT EXISTS quality_score smallint,
  ADD COLUMN IF NOT EXISTS quality_missing jsonb,
  ADD COLUMN IF NOT EXISTS material_source text,
  ADD COLUMN IF NOT EXISTS material_cj_class text[];