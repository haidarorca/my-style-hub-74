CREATE TABLE IF NOT EXISTS public.product_facets (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  colors text[] NOT NULL DEFAULT '{}',
  sizes text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.product_facets TO service_role;
ALTER TABLE public.product_facets ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_product_facets_colors ON public.product_facets USING gin(colors);
CREATE INDEX IF NOT EXISTS idx_product_facets_sizes ON public.product_facets USING gin(sizes);

CREATE OR REPLACE FUNCTION public.refresh_product_facets(_ids uuid[])
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO product_facets(product_id, colors, sizes, updated_at)
  SELECT p.id,
    coalesce((SELECT array_agg(DISTINCT v.color_family) FROM product_variants v WHERE v.product_id = p.id AND v.color_family IS NOT NULL), '{}'),
    coalesce((SELECT array_agg(DISTINCT v.size_norm) FROM product_variants v WHERE v.product_id = p.id AND v.size_norm IS NOT NULL AND length(v.size_norm) <= 12), '{}'),
    now()
  FROM products p WHERE p.id = ANY(_ids)
  ON CONFLICT (product_id) DO UPDATE SET colors = EXCLUDED.colors, sizes = EXCLUDED.sizes, updated_at = now();
$$;
REVOKE ALL ON FUNCTION public.refresh_product_facets(uuid[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_variants_facets_ins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM refresh_product_facets(ARRAY(SELECT DISTINCT product_id FROM new_rows WHERE product_id IS NOT NULL)); RETURN NULL; END $$;
CREATE OR REPLACE FUNCTION public.trg_variants_facets_del()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM refresh_product_facets(ARRAY(SELECT DISTINCT product_id FROM old_rows WHERE product_id IS NOT NULL)); RETURN NULL; END $$;
CREATE OR REPLACE FUNCTION public.trg_variants_facets_upd()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM refresh_product_facets(ARRAY(SELECT product_id FROM new_rows UNION SELECT product_id FROM old_rows)); RETURN NULL; END $$;
REVOKE ALL ON FUNCTION public.trg_variants_facets_ins() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_variants_facets_del() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_variants_facets_upd() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS variants_facets_ins ON public.product_variants;
DROP TRIGGER IF EXISTS variants_facets_del ON public.product_variants;
DROP TRIGGER IF EXISTS variants_facets_upd ON public.product_variants;
CREATE TRIGGER variants_facets_ins AFTER INSERT ON public.product_variants REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.trg_variants_facets_ins();
CREATE TRIGGER variants_facets_del AFTER DELETE ON public.product_variants REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.trg_variants_facets_del();
CREATE TRIGGER variants_facets_upd AFTER UPDATE ON public.product_variants REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.trg_variants_facets_upd();

SELECT public.refresh_product_facets(ARRAY(SELECT id FROM public.products));

CREATE OR REPLACE FUNCTION public.shop_catalog(_f jsonb)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _q text := nullif(btrim(coalesce(_f->>'q','')), '');
  _cats uuid[] := CASE WHEN jsonb_typeof(_f->'categories')='array' AND jsonb_array_length(_f->'categories')>0 THEN ARRAY(SELECT jsonb_array_elements_text(_f->'categories')::uuid) END;
  _vendors uuid[] := CASE WHEN jsonb_typeof(_f->'vendors')='array' THEN ARRAY(SELECT jsonb_array_elements_text(_f->'vendors')::uuid) END;
  _mats text[] := CASE WHEN jsonb_typeof(_f->'materials')='array' AND jsonb_array_length(_f->'materials')>0 THEN ARRAY(SELECT jsonb_array_elements_text(_f->'materials')) END;
  _colors text[] := CASE WHEN jsonb_typeof(_f->'colors')='array' AND jsonb_array_length(_f->'colors')>0 THEN ARRAY(SELECT jsonb_array_elements_text(_f->'colors')) END;
  _sizes text[] := CASE WHEN jsonb_typeof(_f->'sizes')='array' AND jsonb_array_length(_f->'sizes')>0 THEN ARRAY(SELECT upper(jsonb_array_elements_text(_f->'sizes'))) END;
  _countries uuid[] := CASE WHEN jsonb_typeof(_f->'countries')='array' AND jsonb_array_length(_f->'countries')>0 THEN ARRAY(SELECT jsonb_array_elements_text(_f->'countries')::uuid) END;
  _min numeric := nullif(_f->>'minPrice','')::numeric;
  _max numeric := nullif(_f->>'maxPrice','')::numeric;
  _stock boolean := coalesce((_f->>'inStock')::boolean, false);
  _sort text := coalesce(_f->>'sort','new');
  _limit int := least(greatest(coalesce((_f->>'limit')::int, 40), 1), 100);
  _offset int := greatest(coalesce((_f->>'offset')::int, 0), 0);
  _res jsonb;
BEGIN
  WITH base AS MATERIALIZED (
    SELECT p.id, p.price, p.created_at, p.views_count, p.stock_status, p.material_family AS mat,
           coalesce(p.origin_country_id, pr.source_country_id) AS country,
           coalesce(f.colors, '{}') AS colors, coalesce(f.sizes, '{}') AS sizes
    FROM products p
    JOIN profiles pr ON pr.id = p.vendor_id
    LEFT JOIN product_facets f ON f.product_id = p.id
    WHERE p.status = 'approved' AND p.is_active = true AND p.archived_at IS NULL AND p.deleted_at IS NULL
      AND pr.is_verified = true AND pr.vendor_status = 'active'::public.vendor_account_status
      AND (pr.access_ends_at IS NULL OR pr.access_ends_at > now())
      AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = pr.id AND ur.role = 'vendeur'::public.app_role)
      AND (_cats IS NULL OR p.category_id = ANY(_cats))
      AND (_vendors IS NULL OR p.vendor_id = ANY(_vendors))
      AND (_q IS NULL OR p.name ILIKE '%'||_q||'%' OR p.designation ILIKE '%'||_q||'%' OR p.code ILIKE _q||'%')
  ),
  filt AS MATERIALIZED (
    SELECT * FROM base b
    WHERE (_mats IS NULL OR b.mat = ANY(_mats))
      AND (_countries IS NULL OR b.country = ANY(_countries))
      AND (_min IS NULL OR b.price >= _min)
      AND (_max IS NULL OR b.price <= _max)
      AND (NOT _stock OR coalesce(b.stock_status,'in') <> 'out')
      AND (_colors IS NULL OR b.colors && _colors)
      AND (_sizes IS NULL OR b.sizes && _sizes)
  )
  SELECT jsonb_build_object(
    'ids', coalesce((SELECT jsonb_agg(id) FROM (
        SELECT id FROM filt ORDER BY
          CASE WHEN _sort='price_asc' THEN price END ASC NULLS LAST,
          CASE WHEN _sort='price_desc' THEN price END DESC NULLS LAST,
          CASE WHEN _sort='popular' THEN views_count END DESC NULLS LAST,
          created_at DESC, id
        LIMIT _limit OFFSET _offset) pg), '[]'::jsonb),
    'total', (SELECT count(*) FROM filt),
    'price', (SELECT jsonb_build_object('min', min(price), 'max', max(price)) FROM base),
    'materials', coalesce((SELECT jsonb_agg(jsonb_build_object('k', mat, 'n', n) ORDER BY n DESC) FROM (SELECT mat, count(*) n FROM filt WHERE mat IS NOT NULL GROUP BY mat) s), '[]'::jsonb),
    'colors', coalesce((SELECT jsonb_agg(jsonb_build_object('k', c, 'n', n) ORDER BY n DESC) FROM (SELECT c, count(*) n FROM filt, unnest(filt.colors) c GROUP BY c) s), '[]'::jsonb),
    'sizes', coalesce((SELECT jsonb_agg(jsonb_build_object('k', z, 'n', n) ORDER BY n DESC) FROM (SELECT z, count(*) n FROM filt, unnest(filt.sizes) z GROUP BY z ORDER BY 2 DESC LIMIT 30) s), '[]'::jsonb),
    'countries', coalesce((SELECT jsonb_agg(jsonb_build_object('k', c.id, 'label', c.name, 'flag', c.flag_emoji, 'n', s.n) ORDER BY s.n DESC) FROM (SELECT country, count(*) n FROM filt WHERE country IS NOT NULL GROUP BY country) s JOIN countries c ON c.id = s.country), '[]'::jsonb)
  ) INTO _res;
  RETURN _res;
END $function$;
GRANT EXECUTE ON FUNCTION public.shop_catalog(jsonb) TO anon, authenticated;