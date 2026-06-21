
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS variant_ref text,
  ADD COLUMN IF NOT EXISTS measurements jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS fit_type text;

ALTER TABLE public.products
  DROP COLUMN IF EXISTS variant_ref;
