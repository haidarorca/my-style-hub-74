CREATE OR REPLACE FUNCTION public._search_dbg(p_q text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
DECLARE t0 timestamptz := clock_timestamp(); x jsonb; r jsonb := '{}'; c int;
BEGIN
  x := search_expand(p_q); r := r || jsonb_build_object('expand_ms', extract(milliseconds from clock_timestamp()-t0), 'x', x);
  t0 := clock_timestamp(); SELECT count(*) INTO c FROM search_products_v2(p_q);
  r := r || jsonb_build_object('full_ms', extract(milliseconds from clock_timestamp()-t0));
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public._search_dbg(text) FROM PUBLIC, anon, authenticated;