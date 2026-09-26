ALTER TABLE public.product_search_index ADD COLUMN IF NOT EXISTS toks text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.psi_set_toks()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.toks := coalesce(ARRAY(SELECT DISTINCT w FROM unnest(regexp_split_to_array(coalesce(NEW.doc,''), '\s+')) w WHERE w <> ''), '{}');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS psi_set_toks ON public.product_search_index;
CREATE TRIGGER psi_set_toks BEFORE INSERT OR UPDATE OF doc ON public.product_search_index
FOR EACH ROW EXECUTE FUNCTION public.psi_set_toks();

UPDATE public.product_search_index
SET toks = coalesce(ARRAY(SELECT DISTINCT w FROM unnest(regexp_split_to_array(coalesce(doc,''), '\s+')) w WHERE w <> ''), '{}');

CREATE INDEX IF NOT EXISTS psi_toks_gin ON public.product_search_index USING gin (toks);
CREATE INDEX IF NOT EXISTS search_vocab_word_pat ON public.search_vocab (word text_pattern_ops);

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
  allw text[];
  ids uuid[] := '{}';
  code_ids uuid[] := '{}';
BEGIN
  IF raw = '' THEN RETURN; END IF;

  CREATE TEMP TABLE IF NOT EXISTS _stk (ord int, term text, w numeric, pat text, words text[]) ON COMMIT DROP;
  TRUNCATE _stk;
  INSERT INTO _stk
  SELECT e.key::int, t->>'t', (t->>'w')::numeric,
         CASE WHEN (t->>'p')::boolean THEN '% ' || (t->>'t') || '%' ELSE '% ' || (t->>'t') || ' %' END,
         CASE WHEN (t->>'p')::boolean
              THEN ARRAY[t->>'t'] || ARRAY(SELECT v.word FROM search_vocab v WHERE v.word LIKE (t->>'t') || '%' LIMIT 300)
              ELSE ARRAY[t->>'t'] END
  FROM jsonb_each(x->'exp') e, jsonb_array_elements(e.value) t;

  SELECT coalesce(array_agg(DISTINCT w), '{}') INTO allw FROM _stk, unnest(_stk.words) w;
  IF n > 0 AND cardinality(allw) > 0 THEN
    SELECT coalesce(array_agg(s.product_id), '{}') INTO ids FROM (
      SELECT i.product_id FROM product_search_index i
      WHERE i.toks && allw AND i.status = 'approved' LIMIT 6000) s;
  END IF;

  SELECT coalesce(array_agg(i.product_id), '{}') INTO code_ids FROM product_search_index i
   WHERE i.status = 'approved' AND i.codes @> ARRAY[raw];
  IF length(raw) >= 4 AND raw !~ '\s' AND raw ~ '[0-9]' THEN
    code_ids := code_ids || ARRAY(SELECT i.product_id FROM product_search_index i
      WHERE i.status = 'approved' AND EXISTS (SELECT 1 FROM unnest(i.codes) c WHERE c LIKE raw || '%') LIMIT 200);
  END IF;

  RETURN QUERY
  WITH cand AS MATERIALIZED (
    SELECT i.product_id, i.created_at, i.codes, i.toks,
           ' ' || coalesce(i.names,'') || ' ' AS nm, ' ' || coalesce(i.cats,'') || ' ' AS ct, ' ' || coalesce(i.attrs,'') || ' ' AS at
    FROM product_search_index i
    WHERE i.product_id = ANY(ids || code_ids)
      AND i.status = 'approved'
      AND (p_vendor_ids IS NULL OR i.vendor_id = ANY(p_vendor_ids))
      AND (p_min IS NULL OR i.price >= p_min) AND (p_max IS NULL OR i.price <= p_max)
  ),
  codes AS (
    SELECT c.product_id AS pid, CASE WHEN raw = ANY(c.codes) THEN 1000 ELSE 500 END::numeric AS s
    FROM cand c WHERE c.product_id = ANY(code_ids)
  ),
  raw_sc AS (
    SELECT c.product_id AS pid, tk.ord,
      (CASE WHEN c.nm LIKE tk.pat OR c.ct LIKE tk.pat THEN
              (CASE WHEN c.nm LIKE tk.pat THEN 10 ELSE 0 END) + (CASE WHEN c.ct LIKE tk.pat THEN 12 ELSE 0 END)
            WHEN c.at LIKE tk.pat THEN 5
            WHEN c.toks && tk.words THEN 2 END
       + CASE WHEN c.nm LIKE '% ' || tk.term || ' %' THEN 2 ELSE 0 END) * tk.w AS s
    FROM cand c CROSS JOIN _stk tk
    WHERE c.product_id = ANY(ids) AND c.toks && tk.words
  ),
  sc AS (SELECT pid, ord, max(s) AS s FROM raw_sc WHERE s IS NOT NULL GROUP BY 1, 2),
  agg AS (SELECT sc.pid, count(*) AS matched, sum(sc.s) AS s FROM sc GROUP BY 1),
  lim AS (SELECT CASE WHEN max(agg.matched) >= n THEN n ELSE greatest(1, max(agg.matched)) END AS need FROM agg),
  txt AS (
    SELECT a.pid,
      (a.s + a.matched * 20
        + CASE WHEN c.nm LIKE '% ' || qn || '%' THEN 15 ELSE 0 END
        + CASE WHEN c.nm LIKE ' ' || qn || '%' THEN 5 ELSE 0 END)::numeric AS s
    FROM agg a JOIN cand c ON c.product_id = a.pid CROSS JOIN lim
    WHERE a.matched >= lim.need
  ),
  allr AS (
    SELECT u.pid, max(u.s) AS s, min(u.k) AS k FROM (
      SELECT codes.pid, codes.s, 'code' AS k FROM codes
      UNION ALL SELECT txt.pid, txt.s, 'text' FROM txt
    ) u GROUP BY 1
  )
  SELECT r.pid, r.s, r.k, count(*) OVER (), corr
  FROM allr r JOIN cand b ON b.product_id = r.pid
  ORDER BY r.s DESC, b.created_at DESC
  LIMIT greatest(1, least(p_limit, 200)) OFFSET greatest(0, p_offset);
END $function$;