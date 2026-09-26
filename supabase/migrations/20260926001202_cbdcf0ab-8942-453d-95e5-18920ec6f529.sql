DO $do$
DECLARE d text := pg_get_functiondef('public.search_products_v2(text,uuid[],numeric,numeric,integer,integer)'::regprocedure);
BEGIN
  d := replace(d, 'SELECT DISTINCT tk.tid, w AS word FROM tk, unnest(tk.words) w)', 'SELECT DISTINCT tk.tid, uw.wd AS word FROM tk, unnest(tk.words) uw(wd))');
  d := replace(d, 'unnest(c.toks) ct(w) JOIN tw ON tw.word = ct.w', 'unnest(c.toks) ctk(wd) JOIN tw ON tw.word = ctk.wd');
  EXECUTE d;
END $do$;