ALTER TABLE public.product_admin_metadata
  ADD COLUMN IF NOT EXISTS source_product_id text,
  ADD COLUMN IF NOT EXISTS source_platform text;

CREATE UNIQUE INDEX IF NOT EXISTS product_admin_metadata_source_pid_idx
  ON public.product_admin_metadata (source_platform, source_product_id)
  WHERE source_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS product_admin_metadata_source_url_idx
  ON public.product_admin_metadata (source_url)
  WHERE source_url IS NOT NULL;