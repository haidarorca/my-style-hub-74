CREATE OR REPLACE FUNCTION public._search_dbg(p_q text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
DECLARE t0 timestamptz; x jsonb; r jsonb := '{}'; stk jsonb; allw text[]; ids uuid[]; c int;
BEGIN
  t0 := clock_timestamp(); x := search_expand(p_q);
  r := r || jsonb_build_object('expand', extract(milliseconds from clock_timestamp()-t0));
  t0 := clock_timestamp();
  SELECT jsonb_agg(to_jsonb(words)) INTO stk FROM (
    SELECT CASE WHEN (t->>'p')::boolean THEN ARRAY[t->>'t'] || ARRAY(SELECT v.word FROM search_vocab v WHERE v.word LIKE (t->>'t') || '%' LIMIT 300) ELSE ARRAY[t->>'t'] END AS words
    FROM jsonb_each(x->'exp') e, jsonb_array_elements(e.value) t) z;
  SELECT array_agg(DISTINCT w) INTO allw FROM jsonb_array_elements(stk) s, jsonb_array_elements_text(s) w;
  r := r || jsonb_build_object('vocab', extract(milliseconds from clock_timestamp()-t0), 'nwords', cardinality(allw));
  t0 := clock_timestamp();
  SELECT array_agg(product_id) INTO ids FROM (SELECT i.product_id FROM product_search_index i WHERE i.toks && allw AND i.status='approved' LIMIT 6000) s;
  r := r || jsonb_build_object('cand', extract(milliseconds from clock_timestamp()-t0), 'ncand', cardinality(ids));
  t0 := clock_timestamp(); SELECT count(*) INTO c FROM search_products_v2(p_q);
  r := r || jsonb_build_object('full', extract(milliseconds from clock_timestamp()-t0));
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public._search_dbg(text) FROM PUBLIC, anon, authenticated;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec') THEN EXECUTE 'GRANT EXECUTE ON FUNCTION public._search_dbg(text) TO sandbox_exec'; END IF; END $$;