CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON public.products USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_designation_trgm
  ON public.products USING gin (designation gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_shop_name_trgm
  ON public.profiles USING gin (shop_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_categories_name_trgm
  ON public.categories USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_vendor_status
  ON public.products (vendor_id, status);