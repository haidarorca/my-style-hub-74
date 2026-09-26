DO $do$
DECLARE d text := pg_get_functiondef('public.search_products_v2(text,uuid[],numeric,numeric,integer,integer)'::regprocedure);
  a text := $a$    SELECT coalesce(array_agg(s.product_id), '{}') INTO ids FROM (
      SELECT i.product_id FROM product_search_index i
      WHERE i.toks && allw AND i.status = 'approved' LIMIT 6000) s;$a$;
  b text := $b$    EXECUTE format('SELECT coalesce(array_agg(s.product_id), ''{}'') FROM (SELECT i.product_id FROM product_search_index i WHERE i.toks && %L::text[] AND i.status = ''approved'' LIMIT 6000) s', allw) INTO ids;$b$;
BEGIN
  IF position(a in d) = 0 THEN RAISE EXCEPTION 'pattern not found'; END IF;
  EXECUTE replace(d, a, b);
END $do$;
DROP FUNCTION IF EXISTS public._search_dbg(text);