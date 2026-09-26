CREATE OR REPLACE FUNCTION public.search_products_v2(p_q text, p_vendor_ids uuid[] DEFAULT NULL::uuid[], p_min numeric DEFAULT NULL::numeric, p_max numeric DEFAULT NULL::numeric, p_limit integer DEFAULT 60, p_offset integer DEFAULT 0)
 RETURNS TABLE(product_id uuid, score numeric, match_kind text, total bigint, corrected text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
#variable_conflict use_column
DECLARE
  x jsonb := search_expand(p_q);
  qn text := x->>'q';
  raw text := lower(trim(coalesce(p_q, '')));
  n int := coalesce((x->>'n')::int, 0);
  corr text := nullif(array_to_string(ARRAY(SELECT jsonb_array_elements_text(x->'corrected')), ' '), '');
  stk jsonb;
  allw text[];
  ids uuid[] := '{}';
  code_ids uuid[] := '{}';
BEGIN
  IF raw = '' THEN RETURN; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('ord', ord, 'term', term, 'w', w, 'pat', pat, 'words', to_jsonb(words))), '[]') INTO stk FROM (
    SELECT e.key::int AS ord, t->>'t' AS term, (t->>'w')::numeric AS w,
           CASE WHEN (t->>'p')::boolean THEN '% ' || (t->>'t') || '%' ELSE '% ' || (t->>'t') || ' %' END AS pat,
           CASE WHEN (t->>'p')::boolean
                THEN ARRAY[t->>'t'] || ARRAY(SELECT v.word FROM search_vocab v WHERE v.word LIKE (t->>'t') || '%' LIMIT 300)
                ELSE ARRAY[t->>'t'] END AS words
    FROM jsonb_each(x->'exp') e, jsonb_array_elements(e.value) t
  ) z;

  SELECT coalesce(array_agg(DISTINCT w), '{}') INTO allw
    FROM jsonb_array_elements(stk) s, jsonb_array_elements_text(s->'words') w;
  IF n > 0 AND cardinality(allw) > 0 THEN
    EXECUTE format('SELECT coalesce(array_agg(s.product_id), ''{}'') FROM (SELECT i.product_id FROM product_search_index i WHERE i.toks && %L::text[] AND i.status = ''approved'' LIMIT 6000) s', allw) INTO ids;
  END IF;

  EXECUTE format('SELECT coalesce(array_agg(i.product_id), ''{}'') FROM product_search_index i WHERE i.status = ''approved'' AND i.codes @> %L::text[]', ARRAY[raw]) INTO code_ids;
  IF length(raw) >= 4 AND raw !~ '\s' AND raw ~ '[0-9]' THEN
    code_ids := code_ids || ARRAY(SELECT i.product_id FROM product_search_index i
      WHERE i.status = 'approved' AND EXISTS (SELECT 1 FROM unnest(i.codes) c WHERE c LIKE raw || '%') LIMIT 200);
  END IF;

  RETURN QUERY EXECUTE $q$
  WITH tk AS MATERIALIZED (
    SELECT row_number() OVER () AS tid, (s->>'ord')::int AS ord, s->>'term' AS term, (s->>'w')::numeric AS w, s->>'pat' AS pat,
           ARRAY(SELECT jsonb_array_elements_text(s->'words')) AS words
    FROM jsonb_array_elements($3::jsonb) s
  ),
  t_ids AS MATERIALIZED (SELECT DISTINCT unnest($1::uuid[]) AS id),
  k_ids AS MATERIALIZED (SELECT DISTINCT unnest($2::uuid[]) AS id),
  cand AS MATERIALIZED (
    SELECT i.product_id, i.created_at, i.codes, i.toks, (t.id IS NOT NULL) AS is_txt, (k.id IS NOT NULL) AS is_code,
           ' ' || coalesce(i.names,'') || ' ' AS nm, ' ' || coalesce(i.cats,'') || ' ' AS ct, ' ' || coalesce(i.attrs,'') || ' ' AS at
    FROM (SELECT id FROM t_ids UNION SELECT id FROM k_ids) u
    JOIN product_search_index i ON i.product_id = u.id
    LEFT JOIN t_ids t ON t.id = u.id
    LEFT JOIN k_ids k ON k.id = u.id
    WHERE i.status = 'approved'
      AND ($8::uuid[] IS NULL OR i.vendor_id = ANY($8::uuid[]))
      AND ($9::numeric IS NULL OR i.price >= $9::numeric) AND ($10::numeric IS NULL OR i.price <= $10::numeric)
  ),
  codes AS (
    SELECT c.product_id AS pid, CASE WHEN $4::text = ANY(c.codes) THEN 1000 ELSE 500 END::numeric AS s
    FROM cand c WHERE c.is_code
  ),
  tw AS MATERIALIZED (SELECT DISTINCT tk.tid, uw.wd AS word FROM tk, unnest(tk.words) uw(wd)),
  hit AS MATERIALIZED (
    SELECT DISTINCT c.product_id, tw.tid
    FROM cand c CROSS JOIN LATERAL unnest(c.toks) ctk(wd) JOIN tw ON tw.word = ctk.wd
    WHERE c.is_txt
  ),
  raw_sc AS (
    SELECT c.product_id AS pid, tk.ord,
      (CASE WHEN c.nm LIKE tk.pat OR c.ct LIKE tk.pat THEN
              (CASE WHEN c.nm LIKE tk.pat THEN 10 ELSE 0 END) + (CASE WHEN c.ct LIKE tk.pat THEN 12 ELSE 0 END)
            WHEN c.at LIKE tk.pat THEN 5
            ELSE 2 END
       + CASE WHEN c.nm LIKE '% ' || tk.term || ' %' THEN 2 ELSE 0 END) * tk.w AS s
    FROM hit h JOIN cand c ON c.product_id = h.product_id JOIN tk ON tk.tid = h.tid
  ),
  sc AS (SELECT pid, ord, max(s) AS s FROM raw_sc GROUP BY 1, 2),
  agg AS (SELECT sc.pid, count(*) AS matched, sum(sc.s) AS s FROM sc GROUP BY 1),
  lim AS (SELECT CASE WHEN max(agg.matched) >= $6::int THEN $6::int ELSE greatest(1, max(agg.matched)) END AS need FROM agg),
  txt AS (
    SELECT a.pid,
      (a.s + a.matched * 20
        + CASE WHEN c.nm LIKE '% ' || $5::text || '%' THEN 15 ELSE 0 END
        + CASE WHEN c.nm LIKE ' ' || $5::text || '%' THEN 5 ELSE 0 END)::numeric AS s
    FROM agg a JOIN cand c ON c.product_id = a.pid CROSS JOIN lim
    WHERE a.matched >= lim.need
  ),
  allr AS (
    SELECT u.pid, max(u.s) AS s, min(u.k) AS k FROM (
      SELECT codes.pid, codes.s, 'code' AS k FROM codes
      UNION ALL SELECT txt.pid, txt.s, 'text' FROM txt
    ) u GROUP BY 1
  )
  SELECT r.pid, r.s, r.k, count(*) OVER (), $7::text
  FROM allr r JOIN cand b ON b.product_id = r.pid
  ORDER BY r.s DESC, b.created_at DESC
  LIMIT greatest(1, least($11::int, 200)) OFFSET greatest(0, $12::int)
  $q$ USING ids, code_ids, stk, raw, qn, n, corr, p_vendor_ids, p_min, p_max, p_limit, p_offset;
END $function$;