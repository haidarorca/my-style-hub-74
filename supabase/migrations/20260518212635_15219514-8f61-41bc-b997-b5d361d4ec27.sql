-- Indexes trigram pour accélérer les recherches ILIKE '%term%'
-- L'extension pg_trgm est déjà installée dans le schéma public.

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON public.products USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_designation_trgm
  ON public.products USING GIN (designation gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_code_trgm
  ON public.products USING GIN (code gin_trgm_ops);

-- Filtres fréquents combinés à la recherche
CREATE INDEX IF NOT EXISTS idx_products_status_active
  ON public.products (status, is_active);

CREATE INDEX IF NOT EXISTS idx_products_vendor
  ON public.products (vendor_id);

CREATE INDEX IF NOT EXISTS idx_products_category
  ON public.products (category_id);

CREATE INDEX IF NOT EXISTS idx_categories_name_trgm
  ON public.categories USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_shop_name_trgm
  ON public.profiles USING GIN (shop_name gin_trgm_ops);