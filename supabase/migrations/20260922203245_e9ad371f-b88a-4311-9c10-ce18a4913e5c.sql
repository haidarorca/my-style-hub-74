
CREATE UNIQUE INDEX IF NOT EXISTS products_external_product_id_uniq
  ON public.products (external_product_id) WHERE external_product_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_external_variant_id_uniq
  ON public.product_variants (external_variant_id) WHERE external_variant_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.cj_products (
  cj_product_id text PRIMARY KEY,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  cj_sku text,
  name_cn text,
  name_en text,
  cj_category_id text,
  cj_category_name text,
  kawzone_category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  category_mapping_status text NOT NULL DEFAULT 'pending',
  customs_code text,
  material text,
  pack_weight_raw text,
  product_weight_raw text,
  main_image text,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw jsonb,
  last_imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cj_import_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cj_product_id text NOT NULL,
  product_id uuid,
  action text NOT NULL,
  variants_total integer NOT NULL DEFAULT 0,
  variants_imported integer NOT NULL DEFAULT 0,
  api_calls integer NOT NULL DEFAULT 0,
  points_used integer,
  points_remaining integer,
  result text NOT NULL,
  missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  traces jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cj_import_log_pid_idx ON public.cj_import_log (cj_product_id, created_at DESC);

GRANT SELECT ON public.cj_products TO authenticated;
GRANT ALL ON public.cj_products TO service_role;
GRANT SELECT ON public.cj_import_log TO authenticated;
GRANT ALL ON public.cj_import_log TO service_role;

ALTER TABLE public.cj_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cj_import_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cj_products_admin_read" ON public.cj_products;
CREATE POLICY "cj_products_admin_read" ON public.cj_products
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "cj_import_log_admin_read" ON public.cj_import_log;
CREATE POLICY "cj_import_log_admin_read" ON public.cj_import_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS cj_products_set_updated_at ON public.cj_products;
CREATE TRIGGER cj_products_set_updated_at BEFORE UPDATE ON public.cj_products
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
