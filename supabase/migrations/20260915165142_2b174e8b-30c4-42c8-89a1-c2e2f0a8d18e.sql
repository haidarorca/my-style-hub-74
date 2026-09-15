CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS kawscan_products_name_trgm
  ON public.kawscan_products USING gin (lower(coalesce(name, '')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS kawscan_products_code_trgm
  ON public.kawscan_products USING gin (lower(coalesce(code, '')) gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.kawscan_search(_slug text, _q text, _limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  st record;
  q text;
  qn text;
  qdigits text;
  words text[];
  lim int;
  rows jsonb;
BEGIN
  SELECT * INTO st FROM public.kawscan_public_store(_slug);
  IF st.id IS NULL THEN RETURN jsonb_build_object('error','store_not_found'); END IF;
  IF st.access_state <> 'ok' THEN RETURN jsonb_build_object('error', st.access_state); END IF;

  q := btrim(coalesce(_q, ''));
  qn := public.kawscan_norm(q);
  IF length(qn) < 1 THEN RETURN jsonb_build_object('results', '[]'::jsonb, 'currency', st.currency_code); END IF;

  qdigits := nullif(regexp_replace(qn, '^0+', ''), '');
  words := array_remove(string_to_array(lower(regexp_replace(q, '[^a-zA-Z0-9]+', ' ', 'g')), ' '), '');
  lim := greatest(1, least(coalesce(_limit, 20), 50));

  SELECT coalesce(jsonb_agg(r ORDER BY score DESC, r_name), '[]'::jsonb) INTO rows
  FROM (
    SELECT
      jsonb_build_object(
        'id', p.id,
        'code', p.code,
        'name', p.name,
        'unit', p.unit,
        'price', p.price,
        'promo', eff.is_promo,
        'promo_price', p.promo_price,
        'effective_price', CASE WHEN eff.is_promo THEN p.promo_price ELSE p.price END,
        'currency', coalesce(p.currency_code, st.currency_code)
      ) AS r,
      coalesce(p.name, p.code) AS r_name,
      (
        CASE WHEN public.kawscan_norm(p.code) = qn THEN 1000
             WHEN qdigits IS NOT NULL AND regexp_replace(public.kawscan_norm(p.code), '^0+', '') = qdigits THEN 950
             WHEN public.kawscan_norm(p.name) = qn THEN 900
             WHEN public.kawscan_norm(p.code) LIKE qn || '%' THEN 800
             WHEN public.kawscan_norm(p.name) LIKE qn || '%' THEN 750
             WHEN public.kawscan_norm(p.code) LIKE '%' || qn THEN 700
             WHEN public.kawscan_norm(p.code) LIKE '%' || qn || '%' THEN 650
             WHEN public.kawscan_norm(p.name) LIKE '%' || qn || '%' THEN 600
             ELSE 0 END
        + CASE WHEN array_length(words, 1) IS NOT NULL AND p.name IS NOT NULL AND NOT EXISTS (
                 SELECT 1 FROM unnest(words) w
                 WHERE public.kawscan_norm(p.name) NOT LIKE '%' || public.kawscan_norm(w) || '%')
               THEN 400 ELSE 0 END
        + (200 * greatest(
            similarity(lower(coalesce(p.name, '')), lower(q)),
            similarity(lower(coalesce(p.code, '')), lower(q))))::int
      ) AS score
    FROM public.kawscan_products p
    CROSS JOIN LATERAL (
      SELECT (p.promo_active AND p.promo_price IS NOT NULL
              AND (p.promo_starts_at IS NULL OR p.promo_starts_at <= now())
              AND (p.promo_ends_at IS NULL OR p.promo_ends_at >= now())) AS is_promo
    ) eff
    WHERE p.store_id = st.id
      AND p.is_active = true
      AND (
        public.kawscan_norm(p.code) LIKE '%' || qn || '%'
        OR public.kawscan_norm(coalesce(p.name, '')) LIKE '%' || qn || '%'
        OR (qdigits IS NOT NULL AND regexp_replace(public.kawscan_norm(p.code), '^0+', '') LIKE '%' || qdigits || '%')
        OR (p.name IS NOT NULL AND array_length(words, 1) IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM unnest(words) w
              WHERE public.kawscan_norm(p.name) NOT LIKE '%' || public.kawscan_norm(w) || '%'))
        OR (length(qn) >= 3 AND (
              similarity(lower(coalesce(p.name, '')), lower(q)) > 0.28
              OR similarity(lower(coalesce(p.code, '')), lower(q)) > 0.35))
      )
    ORDER BY score DESC, r_name
    LIMIT lim
  ) s;

  RETURN jsonb_build_object('results', rows, 'currency', st.currency_code);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kawscan_search(text, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.kawscan_search(text, text, integer) TO anon, authenticated;