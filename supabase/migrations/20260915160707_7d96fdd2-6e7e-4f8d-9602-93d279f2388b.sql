
CREATE OR REPLACE FUNCTION public.kawscan_norm(_t text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT regexp_replace(
    translate(lower(coalesce(_t, '')),
      'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ',
      'aaaaaaceeeeiiiinooooouuuuyy'),
    '[^a-z0-9]', '', 'g')
$$;

CREATE OR REPLACE FUNCTION public.kawscan_search(_slug text, _q text, _limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  st record;
  q text;
  qn text;
  rows jsonb;
BEGIN
  SELECT * INTO st FROM public.kawscan_public_store(_slug);
  IF st.id IS NULL THEN RETURN jsonb_build_object('error','store_not_found'); END IF;
  IF st.access_state <> 'ok' THEN RETURN jsonb_build_object('error', st.access_state); END IF;

  q := btrim(coalesce(_q, ''));
  qn := public.kawscan_norm(q);
  IF length(qn) < 2 THEN RETURN jsonb_build_object('results', '[]'::jsonb); END IF;

  SELECT coalesce(jsonb_agg(r ORDER BY r_rank, r_name), '[]'::jsonb) INTO rows
  FROM (
    SELECT
      jsonb_build_object(
        'id', p.id,
        'code', p.code,
        'name', p.name,
        'unit', p.unit,
        'price', p.price,
        'promo', (p.promo_active AND p.promo_price IS NOT NULL
                  AND (p.promo_starts_at IS NULL OR p.promo_starts_at <= now())
                  AND (p.promo_ends_at IS NULL OR p.promo_ends_at >= now())),
        'promo_price', p.promo_price,
        'effective_price', CASE
          WHEN p.promo_active AND p.promo_price IS NOT NULL
               AND (p.promo_starts_at IS NULL OR p.promo_starts_at <= now())
               AND (p.promo_ends_at IS NULL OR p.promo_ends_at >= now())
          THEN p.promo_price ELSE p.price END,
        'currency', coalesce(p.currency_code, st.currency_code)
      ) AS r,
      CASE
        WHEN public.kawscan_norm(p.code) = qn THEN 1                       -- code exact
        WHEN public.kawscan_norm(p.name) = qn THEN 2                       -- nom exact
        WHEN public.kawscan_norm(p.code) LIKE qn || '%' THEN 3             -- code commence par
        WHEN public.kawscan_norm(p.code) LIKE '%' || qn THEN 4             -- code finit par
        WHEN public.kawscan_norm(p.code) LIKE '%' || qn || '%' THEN 5      -- code contient
        WHEN public.kawscan_norm(p.name) LIKE qn || '%' THEN 6             -- nom commence par
        WHEN p.name IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM unnest(string_to_array(lower(regexp_replace(q, '[^a-zA-Z0-9 ]', ' ', 'g')), ' ')) w
          WHERE btrim(w) <> '' AND public.kawscan_norm(p.name) NOT LIKE '%' || public.kawscan_norm(w) || '%'
        ) THEN 7                                                            -- tous les mots présents
        ELSE 8                                                              -- correspondance partielle
      END AS r_rank,
      coalesce(p.name, p.code) AS r_name
    FROM public.kawscan_products p
    WHERE p.store_id = st.id
      AND p.is_active = true
      AND (
        public.kawscan_norm(p.code) LIKE '%' || qn || '%'
        OR public.kawscan_norm(coalesce(p.name, '')) LIKE '%' || qn || '%'
        OR (p.name IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM unnest(string_to_array(lower(regexp_replace(q, '[^a-zA-Z0-9 ]', ' ', 'g')), ' ')) w
              WHERE btrim(w) <> '' AND public.kawscan_norm(p.name) NOT LIKE '%' || public.kawscan_norm(w) || '%'
           ))
      )
    LIMIT greatest(1, least(coalesce(_limit, 20), 50))
  ) s;

  RETURN jsonb_build_object('results', rows, 'currency', st.currency_code);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kawscan_search(text, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.kawscan_search(text, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kawscan_norm(text) TO anon, authenticated;
