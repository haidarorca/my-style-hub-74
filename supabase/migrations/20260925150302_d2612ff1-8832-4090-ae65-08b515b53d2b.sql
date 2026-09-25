CREATE OR REPLACE FUNCTION public.kz_material_family(_m text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _m IS NULL OR btrim(_m) = '' THEN NULL
    WHEN lower(_m) ~ '(coton|cotton)' THEN 'Coton'
    WHEN lower(_m) ~ '(denim|jean)' THEN 'Denim'
    WHEN lower(_m) ~ '(^|[^a-z])(pu|similicuir|faux leather|synthetic leather)([^a-z]|$)' THEN 'Similicuir'
    WHEN lower(_m) ~ '(cuir|leather|cowhide)' THEN 'Cuir'
    WHEN lower(_m) ~ '(linen|(^|[^a-z])lin([^a-z]|$))' THEN 'Lin'
    WHEN lower(_m) ~ '(soie|silk|satin)' THEN 'Soie / Satin'
    WHEN lower(_m) ~ '(laine|wool|cachemire|cashmere)' THEN 'Laine'
    WHEN lower(_m) ~ '(velours|velvet|corduroy)' THEN 'Velours'
    WHEN lower(_m) ~ '(polyester)' THEN 'Polyester'
    WHEN lower(_m) ~ '(nylon)' THEN 'Nylon'
    WHEN lower(_m) ~ '(viscose|rayon|modal)' THEN 'Viscose'
    WHEN lower(_m) ~ '(spandex|elasthan|élasthan|lycra)' THEN 'Élasthanne'
    WHEN lower(_m) ~ '(chemical fiber|synth|acryli|fibre|fiber)' THEN 'Synthétique'
    WHEN lower(_m) ~ '(tissu|cloth|fabric|textile)' THEN 'Tissu'
    WHEN lower(_m) ~ '(silicone|tpu)' THEN 'Silicone / TPU'
    WHEN lower(_m) ~ '(plasti|(^|[^a-z])(pc|abs|pp|pvc|pe)([^a-z]|$)|resin|résine|acrylic)' THEN 'Plastique'
    WHEN lower(_m) ~ '(métal|metal|alloy|alliage|steel|acier|zinc|alumin|iron|fer|copper|cuivre|brass|laiton)' THEN 'Métal'
    WHEN lower(_m) ~ '(bois|wood|bamboo|bambou)' THEN 'Bois'
    WHEN lower(_m) ~ '(verre|glass|crystal|cristal)' THEN 'Verre'
    WHEN lower(_m) ~ '(céramique|ceramic|porcelain|porcelaine)' THEN 'Céramique'
    WHEN lower(_m) ~ '(caoutchouc|rubber|latex)' THEN 'Caoutchouc'
    WHEN lower(_m) ~ '(papier|paper|carton)' THEN 'Papier'
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.kz_color_family(_c text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _c IS NULL OR btrim(_c) = '' THEN NULL
    WHEN lower(_c) ~ '(multi|colorful|mixed|rainbow)' THEN 'Multicolore'
    WHEN lower(_c) ~ '(black|noir)' THEN 'Noir'
    WHEN lower(_c) ~ '(white|blanc|ivory)' THEN 'Blanc'
    WHEN lower(_c) ~ '(gr[ae]y|gris|charcoal)' THEN 'Gris'
    WHEN lower(_c) ~ '(navy|blue|bleu|denim|cyan|turquoise)' THEN 'Bleu'
    WHEN lower(_c) ~ '(pink|rose)' THEN 'Rose'
    WHEN lower(_c) ~ '(red|rouge|wine|burgundy|bordeaux)' THEN 'Rouge'
    WHEN lower(_c) ~ '(green|vert|olive|mint)' THEN 'Vert'
    WHEN lower(_c) ~ '(yellow|jaune)' THEN 'Jaune'
    WHEN lower(_c) ~ '(orange)' THEN 'Orange'
    WHEN lower(_c) ~ '(purple|violet|lilac|lavender)' THEN 'Violet'
    WHEN lower(_c) ~ '(brown|marron|coffee|caramel|chocolate|camel)' THEN 'Marron'
    WHEN lower(_c) ~ '(khaki|beige|apricot|cream|nude|off.?white)' THEN 'Beige'
    WHEN lower(_c) ~ '(gold|doré|dore)' THEN 'Doré'
    WHEN lower(_c) ~ '(silver|argent)' THEN 'Argenté'
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.shop_catalog(_f jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
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
  WITH base AS (
    SELECT p.id, p.price, p.created_at, p.views_count, p.stock_status,
           kz_material_family(p.material) AS mat,
           coalesce(p.origin_country_id, pr.source_country_id) AS country
    FROM products p
    LEFT JOIN profiles pr ON pr.id = p.vendor_id
    WHERE p.status = 'approved' AND p.is_active = true AND p.archived_at IS NULL AND p.deleted_at IS NULL
      AND (_cats IS NULL OR p.category_id = ANY(_cats))
      AND (_vendors IS NULL OR p.vendor_id = ANY(_vendors))
      AND (_q IS NULL OR p.name ILIKE '%'||_q||'%' OR p.designation ILIKE '%'||_q||'%' OR p.code ILIKE _q||'%')
  ),
  vars AS (
    SELECT v.product_id, kz_color_family(v.color) AS color, upper(nullif(btrim(v.size),'')) AS size
    FROM product_variants v JOIN base b ON b.id = v.product_id
  ),
  filt AS (
    SELECT b.* FROM base b
    WHERE (_mats IS NULL OR b.mat = ANY(_mats))
      AND (_countries IS NULL OR b.country = ANY(_countries))
      AND (_min IS NULL OR b.price >= _min)
      AND (_max IS NULL OR b.price <= _max)
      AND (NOT _stock OR coalesce(b.stock_status,'in') <> 'out')
      AND (_colors IS NULL OR EXISTS (SELECT 1 FROM vars x WHERE x.product_id=b.id AND x.color = ANY(_colors)))
      AND (_sizes IS NULL OR EXISTS (SELECT 1 FROM vars x WHERE x.product_id=b.id AND x.size = ANY(_sizes)))
  ),
  page AS (
    SELECT id FROM filt
    ORDER BY
      CASE WHEN _sort='price_asc' THEN price END ASC NULLS LAST,
      CASE WHEN _sort='price_desc' THEN price END DESC NULLS LAST,
      CASE WHEN _sort='popular' THEN views_count END DESC NULLS LAST,
      created_at DESC, id
    LIMIT _limit OFFSET _offset
  )
  SELECT jsonb_build_object(
    'ids', coalesce((SELECT jsonb_agg(id) FROM page), '[]'::jsonb),
    'total', (SELECT count(*) FROM filt),
    'price', (SELECT jsonb_build_object('min', min(price), 'max', max(price)) FROM base),
    'materials', coalesce((SELECT jsonb_agg(jsonb_build_object('k', mat, 'n', n) ORDER BY n DESC) FROM (SELECT mat, count(*) n FROM filt WHERE mat IS NOT NULL GROUP BY mat) s), '[]'::jsonb),
    'colors', coalesce((SELECT jsonb_agg(jsonb_build_object('k', color, 'n', n) ORDER BY n DESC) FROM (SELECT x.color, count(DISTINCT x.product_id) n FROM vars x JOIN filt f ON f.id=x.product_id WHERE x.color IS NOT NULL GROUP BY x.color) s), '[]'::jsonb),
    'sizes', coalesce((SELECT jsonb_agg(jsonb_build_object('k', size, 'n', n) ORDER BY n DESC) FROM (SELECT x.size, count(DISTINCT x.product_id) n FROM vars x JOIN filt f ON f.id=x.product_id WHERE x.size IS NOT NULL AND length(x.size) <= 12 GROUP BY x.size ORDER BY 2 DESC LIMIT 30) s), '[]'::jsonb),
    'countries', coalesce((SELECT jsonb_agg(jsonb_build_object('k', c.id, 'label', c.name, 'flag', c.flag_emoji, 'n', s.n) ORDER BY s.n DESC) FROM (SELECT country, count(*) n FROM filt WHERE country IS NOT NULL GROUP BY country) s JOIN countries c ON c.id = s.country), '[]'::jsonb)
  ) INTO _res;
  RETURN _res;
END $$;

GRANT EXECUTE ON FUNCTION public.shop_catalog(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kz_material_family(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kz_color_family(text) TO anon, authenticated;