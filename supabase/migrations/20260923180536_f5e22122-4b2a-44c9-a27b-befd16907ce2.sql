DO $$
DECLARE def text;
BEGIN
  def := pg_get_functiondef('public.kawscan_session_start(text,double precision,double precision,double precision,text,text)'::regprocedure);
  def := replace(def, 'IF _acc IS NULL OR _acc > 100 THEN', 'IF _lat IS NULL OR _lng IS NULL OR _acc IS NULL OR _acc > 50 THEN');
  def := replace(def, 'IF d - _acc - 15 > 0 THEN', 'IF d IS NULL OR d > LEAST(_acc, 20) THEN');
  IF position('LEAST(_acc, 20)' in def) = 0 THEN RAISE EXCEPTION 'patch failed'; END IF;
  EXECUTE def;
END $$;

CREATE OR REPLACE FUNCTION public.kawscan_session_ping(_slug text, _session text, _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL, _acc double precision DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE s record; se record; d float8;
BEGIN
  SELECT * INTO s FROM public.kawscan_stores WHERE slug = _slug;
  IF s.id IS NULL THEN RETURN jsonb_build_object('error','store_not_found'); END IF;
  IF s.protection_mode = 'none' THEN RETURN jsonb_build_object('ok', true, 'mode','none'); END IF;
  SELECT * INTO se FROM public.kawscan_sessions WHERE token_hash = encode(digest(coalesce(_session,''), 'sha256'), 'hex') AND store_id = s.id;
  IF se.id IS NULL THEN RETURN jsonb_build_object('error','session_ended'); END IF;
  IF se.expires_at < now() THEN DELETE FROM public.kawscan_sessions WHERE id = se.id; RETURN jsonb_build_object('error','session_expired'); END IF;
  IF s.protection_mode IN ('gps','gps_code') AND _lat IS NOT NULL AND _lng IS NOT NULL AND _acc IS NOT NULL AND _acc <= 50 THEN
    d := public.kawscan_zone_distance(s.zone_polygon, _lat, _lng);
    IF d IS NULL OR d > LEAST(_acc, 20) THEN
      DELETE FROM public.kawscan_sessions WHERE id = se.id;
      RETURN jsonb_build_object('error','out_of_zone');
    END IF;
    UPDATE public.kawscan_sessions SET last_ping_at = now(), out_of_zone_since = NULL WHERE id = se.id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'expires_at', se.expires_at);
END $$;
GRANT EXECUTE ON FUNCTION public.kawscan_session_ping(text, text, double precision, double precision, double precision) TO anon, authenticated;

-- Invalider toutes les sessions client existantes (anciennes autorisations).
DELETE FROM public.kawscan_sessions WHERE expires_at > now() - interval '1 day';