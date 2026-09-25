CREATE OR REPLACE FUNCTION public.shop_catalog(_f jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE
 SECURITY DEFINER
 SET search_path TO 'public'
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
  CREATE TEMP TABLE IF NOT EXISTS _kz_base (id uuid, price numeric, created_at timestamptz, views_count int, stock_status text, mat text, country uuid) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _kz_vars (product_id uuid, color text, size text) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _kz_filt (id uuid, price numeric, created_at timestamptz, views_count int, mat text, country uuid) ON COMMIT DROP;
  TRUNCATE _kz_base, _kz_vars, _kz_filt;

  INSERT INTO _kz_base
  SELECT p.id, p.price, p.created_at, p.views_count, p.stock_status, p.material_family,
         coalesce(p.origin_country_id, pr.source_country_id)
  FROM products p
  JOIN profiles pr ON pr.id = p.vendor_id
  WHERE p.status = 'approved' AND p.is_active = true AND p.archived_at IS NULL AND p.deleted_at IS NULL
    AND pr.is_verified = true AND pr.vendor_status = 'active'::public.vendor_account_status
    AND (pr.access_ends_at IS NULL OR pr.access_ends_at > now())
    AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = pr.id AND ur.role = 'vendeur'::public.app_role)
    AND (_cats IS NULL OR p.category_id = ANY(_cats))
    AND (_vendors IS NULL OR p.vendor_id = ANY(_vendors))
    AND (_q IS NULL OR p.name ILIKE '%'||_q||'%' OR p.designation ILIKE '%'||_q||'%' OR p.code ILIKE _q||'%');

  INSERT INTO _kz_vars
  SELECT DISTINCT v.product_id, v.color_family, v.size_norm
  FROM product_variants v JOIN _kz_base b ON b.id = v.product_id;
  ANALYZE _kz_base; ANALYZE _kz_vars;

  INSERT INTO _kz_filt
  SELECT b.id, b.price, b.created_at, b.views_count, b.mat, b.country FROM _kz_base b
  WHERE (_mats IS NULL OR b.mat = ANY(_mats))
    AND (_countries IS NULL OR b.country = ANY(_countries))
    AND (_min IS NULL OR b.price >= _min)
    AND (_max IS NULL OR b.price <= _max)
    AND (NOT _stock OR coalesce(b.stock_status,'in') <> 'out')
    AND (_colors IS NULL OR b.id IN (SELECT x.product_id FROM _kz_vars x WHERE x.color = ANY(_colors)))
    AND (_sizes IS NULL OR b.id IN (SELECT x.product_id FROM _kz_vars x WHERE x.size = ANY(_sizes)));

  SELECT jsonb_build_object(
    'ids', coalesce((SELECT jsonb_agg(id) FROM (
        SELECT id FROM _kz_filt ORDER BY
          CASE WHEN _sort='price_asc' THEN price END ASC NULLS LAST,
          CASE WHEN _sort='price_desc' THEN price END DESC NULLS LAST,
          CASE WHEN _sort='popular' THEN views_count END DESC NULLS LAST,
          created_at DESC, id
        LIMIT _limit OFFSET _offset) pg), '[]'::jsonb),
    'total', (SELECT count(*) FROM _kz_filt),
    'price', (SELECT jsonb_build_object('min', min(price), 'max', max(price)) FROM _kz_base),
    'materials', coalesce((SELECT jsonb_agg(jsonb_build_object('k', mat, 'n', n) ORDER BY n DESC) FROM (SELECT mat, count(*) n FROM _kz_filt WHERE mat IS NOT NULL GROUP BY mat) s), '[]'::jsonb),
    'colors', coalesce((SELECT jsonb_agg(jsonb_build_object('k', color, 'n', n) ORDER BY n DESC) FROM (SELECT x.color, count(DISTINCT x.product_id) n FROM _kz_vars x JOIN _kz_filt f ON f.id=x.product_id WHERE x.color IS NOT NULL GROUP BY x.color) s), '[]'::jsonb),
    'sizes', coalesce((SELECT jsonb_agg(jsonb_build_object('k', size, 'n', n) ORDER BY n DESC) FROM (SELECT x.size, count(DISTINCT x.product_id) n FROM _kz_vars x JOIN _kz_filt f ON f.id=x.product_id WHERE x.size IS NOT NULL AND length(x.size) <= 12 GROUP BY x.size ORDER BY 2 DESC LIMIT 30) s), '[]'::jsonb),
    'countries', coalesce((SELECT jsonb_agg(jsonb_build_object('k', c.id, 'label', c.name, 'flag', c.flag_emoji, 'n', s.n) ORDER BY s.n DESC) FROM (SELECT country, count(*) n FROM _kz_filt WHERE country IS NOT NULL GROUP BY country) s JOIN countries c ON c.id = s.country), '[]'::jsonb)
  ) INTO _res;
  RETURN _res;
END $function$;
GRANT EXECUTE ON FUNCTION public.shop_catalog(jsonb) TO anon, authenticated;