CREATE TABLE IF NOT EXISTS public.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'product' CHECK (kind IN ('product','shop')),
  platform text CHECK (platform IN ('taobao','tmall','1688','unknown')),
  source_url text NOT NULL,
  final_url text,
  source_product_id text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed','cancelled')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  confidence numeric(5,2) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 100),
  extraction_source text,
  validation_issues text[] NOT NULL DEFAULT '{}',
  draft jsonb,
  logs jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  attempts integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS import_jobs_user_created_idx
  ON public.import_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS import_jobs_shop_created_idx
  ON public.import_jobs (shop_id, created_at DESC);

CREATE INDEX IF NOT EXISTS import_jobs_status_created_idx
  ON public.import_jobs (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS import_jobs_shop_source_pid_unique_idx
  ON public.import_jobs (shop_id, platform, source_product_id)
  WHERE source_product_id IS NOT NULL AND status <> 'failed';

DROP POLICY IF EXISTS import_jobs_owner_read ON public.import_jobs;
CREATE POLICY import_jobs_owner_read
ON public.import_jobs
FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS import_jobs_owner_insert ON public.import_jobs;
CREATE POLICY import_jobs_owner_insert
ON public.import_jobs
FOR INSERT
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS import_jobs_owner_update ON public.import_jobs;
CREATE POLICY import_jobs_owner_update
ON public.import_jobs
FOR UPDATE
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS import_jobs_owner_delete ON public.import_jobs;
CREATE POLICY import_jobs_owner_delete
ON public.import_jobs
FOR DELETE
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_import_jobs_updated_at ON public.import_jobs;
CREATE TRIGGER trg_import_jobs_updated_at
BEFORE UPDATE ON public.import_jobs
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.create_imported_product_atomic(
  _shop_id uuid,
  _source_url text,
  _source_platform text,
  _source_product_id text,
  _name text,
  _designation text,
  _description text,
  _price numeric,
  _category_id uuid,
  _images jsonb,
  _variants jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing uuid;
  _product_id uuid;
  _code text;
  _img jsonb;
  _variant jsonb;
BEGIN
  IF _shop_id IS NULL THEN
    RAISE EXCEPTION 'Boutique manquante';
  END IF;
  IF COALESCE(trim(_name), '') = '' THEN
    RAISE EXCEPTION 'Nom produit manquant';
  END IF;
  IF COALESCE(_price, 0) <= 0 THEN
    RAISE EXCEPTION 'Prix produit invalide';
  END IF;
  IF jsonb_array_length(COALESCE(_images, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Image produit manquante';
  END IF;
  IF jsonb_array_length(COALESCE(_variants, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Variante produit manquante';
  END IF;

  SELECT pam.product_id INTO _existing
  FROM public.product_admin_metadata pam
  WHERE pam.source_url = _source_url
     OR (_source_product_id IS NOT NULL AND pam.source_platform = _source_platform AND pam.source_product_id = _source_product_id)
  LIMIT 1;

  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('duplicate', true, 'productId', _existing);
  END IF;

  SELECT p.id INTO _existing
  FROM public.products p
  WHERE p.vendor_id = _shop_id AND lower(p.name) = lower(_name)
  LIMIT 1;

  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('duplicate', true, 'productId', _existing);
  END IF;

  _code := 'IMP-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));

  INSERT INTO public.products (
    vendor_id, category_id, code, name, designation, description, price, status, is_active
  ) VALUES (
    _shop_id, _category_id, _code, _name, _designation, _description, _price, 'pending', false
  ) RETURNING id INTO _product_id;

  FOR _img IN SELECT * FROM jsonb_array_elements(COALESCE(_images, '[]'::jsonb)) WITH ORDINALITY AS t(value, ord)
  LOOP
    INSERT INTO public.product_images (product_id, url, position)
    VALUES (_product_id, _img->>'url', COALESCE((_img->>'position')::integer, 0));
  END LOOP;

  FOR _variant IN SELECT * FROM jsonb_array_elements(COALESCE(_variants, '[]'::jsonb))
  LOOP
    INSERT INTO public.product_variants (product_id, size, color, color_hex, stock, price_override, image_url)
    VALUES (
      _product_id,
      NULLIF(_variant->>'size', ''),
      NULLIF(_variant->>'color', ''),
      NULLIF(_variant->>'colorHex', ''),
      GREATEST(0, COALESCE((_variant->>'stock')::integer, 0)),
      NULLIF(_variant->>'price', '')::numeric,
      NULLIF(_variant->>'imageUrl', '')
    );
  END LOOP;

  INSERT INTO public.product_admin_metadata (product_id, source_url, source_platform, source_product_id)
  VALUES (_product_id, _source_url, NULLIF(_source_platform, 'unknown'), _source_product_id);

  RETURN jsonb_build_object('duplicate', false, 'productId', _product_id);
EXCEPTION WHEN OTHERS THEN
  IF _product_id IS NOT NULL THEN
    DELETE FROM public.products WHERE id = _product_id;
  END IF;
  RAISE;
END;
$$;