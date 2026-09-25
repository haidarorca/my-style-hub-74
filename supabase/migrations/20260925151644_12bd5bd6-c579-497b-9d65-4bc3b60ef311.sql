CREATE OR REPLACE FUNCTION public.shop_catalog(_f jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
  flags AS MATERIALIZED (
    SELECT b.*,
      (_mats IS NULL OR b.mat = ANY(_mats)) AS m_ok,
      (_countries IS NULL OR b.country = ANY(_countries)) AS k_ok,
      (_colors IS NULL OR b.colors && _colors) AS c_ok,
      (_sizes IS NULL OR b.sizes && _sizes) AS s_ok,
      ((_min IS NULL OR b.price >= _min) AND (_max IS NULL OR b.price <= _max) AND (NOT _stock OR coalesce(b.stock_status,'in') <> 'out')) AS o_ok
    FROM base b
  ),
  filt AS MATERIALIZED (SELECT * FROM flags WHERE m_ok AND k_ok AND c_ok AND s_ok AND o_ok)
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
    'materials', coalesce((SELECT jsonb_agg(jsonb_build_object('k', mat, 'n', n) ORDER BY n DESC) FROM (SELECT mat, count(*) n FROM flags WHERE k_ok AND c_ok AND s_ok AND o_ok AND mat IS NOT NULL GROUP BY mat) s), '[]'::jsonb),
    'colors', coalesce((SELECT jsonb_agg(jsonb_build_object('k', c, 'n', n) ORDER BY n DESC) FROM (SELECT c, count(*) n FROM flags, unnest(flags.colors) c WHERE m_ok AND k_ok AND s_ok AND o_ok GROUP BY c) s), '[]'::jsonb),
    'sizes', coalesce((SELECT jsonb_agg(jsonb_build_object('k', z, 'n', n) ORDER BY n DESC) FROM (SELECT z, count(*) n FROM flags, unnest(flags.sizes) z WHERE m_ok AND k_ok AND c_ok AND o_ok GROUP BY z ORDER BY 2 DESC LIMIT 30) s), '[]'::jsonb),
    'countries', coalesce((SELECT jsonb_agg(jsonb_build_object('k', c.id, 'label', c.name, 'flag', c.flag_emoji, 'n', s.n) ORDER BY s.n DESC) FROM (SELECT country, count(*) n FROM flags WHERE m_ok AND c_ok AND s_ok AND o_ok AND country IS NOT NULL GROUP BY country) s JOIN countries c ON c.id = s.country), '[]'::jsonb)
  ) INTO _res;
  RETURN _res;
END $function$;