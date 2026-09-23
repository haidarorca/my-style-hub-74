ALTER TABLE public.kawscan_stores
  ADD COLUMN IF NOT EXISTS protection_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS zone_polygon jsonb,
  ADD COLUMN IF NOT EXISTS code_period_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS session_max_minutes integer NOT NULL DEFAULT 15;
DO $$ BEGIN
  ALTER TABLE public.kawscan_stores ADD CONSTRAINT kawscan_stores_protection_mode_chk CHECK (protection_mode IN ('none','gps','code','gps_code'));
  ALTER TABLE public.kawscan_stores ADD CONSTRAINT kawscan_stores_code_period_chk CHECK (code_period_minutes BETWEEN 2 AND 240);
  ALTER TABLE public.kawscan_stores ADD CONSTRAINT kawscan_stores_session_max_chk CHECK (session_max_minutes BETWEEN 1 AND 240);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.kawscan_store_secrets (
  store_id uuid PRIMARY KEY REFERENCES public.kawscan_stores(id) ON DELETE CASCADE,
  secret bytea NOT NULL DEFAULT extensions.gen_random_bytes(32),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.kawscan_store_secrets TO service_role;
ALTER TABLE public.kawscan_store_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.kawscan_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.kawscan_stores(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  short_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  scans integer NOT NULL DEFAULT 0,
  searches integer NOT NULL DEFAULT 0,
  last_ping_at timestamptz,
  out_of_zone_since timestamptz
);
CREATE INDEX IF NOT EXISTS kawscan_sessions_store_idx ON public.kawscan_sessions(store_id, expires_at);
GRANT SELECT ON public.kawscan_sessions TO authenticated;
GRANT ALL ON public.kawscan_sessions TO service_role;
ALTER TABLE public.kawscan_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestionnaires voient les sessions de leur magasin" ON public.kawscan_sessions
  FOR SELECT TO authenticated USING (public.kawscan_can_manage(store_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.kawscan_code_attempts (
  id bigserial PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.kawscan_stores(id) ON DELETE CASCADE,
  attempt_key text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kawscan_code_attempts_idx ON public.kawscan_code_attempts(store_id, at);
GRANT ALL ON public.kawscan_code_attempts TO service_role;
ALTER TABLE public.kawscan_code_attempts ENABLE ROW LEVEL SECURITY;

-- Distance (m) entre un point et la zone (0 si à l'intérieur). Zone = [[lat,lng],...]
CREATE OR REPLACE FUNCTION public.kawscan_zone_distance(_poly jsonb, _lat double precision, _lng double precision)
RETURNS double precision LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE n int; i int; j int; xi float8; yi float8; xj float8; yj float8;
  kx float8; ky float8 := 110540; inside boolean := false; best float8 := 1e12;
  dx float8; dy float8; t float8; px float8; py float8; d float8;
BEGIN
  IF _poly IS NULL OR jsonb_typeof(_poly) <> 'array' THEN RETURN NULL; END IF;
  n := jsonb_array_length(_poly);
  IF n < 3 THEN RETURN NULL; END IF;
  kx := 111320 * cos(radians(_lat));
  j := n - 1;
  FOR i IN 0..n-1 LOOP
    xi := ((_poly->i->>1)::float8 - _lng) * kx; yi := ((_poly->i->>0)::float8 - _lat) * ky;
    xj := ((_poly->j->>1)::float8 - _lng) * kx; yj := ((_poly->j->>0)::float8 - _lat) * ky;
    IF ((yi > 0) <> (yj > 0)) AND (0 < (xj - xi) * (0 - yi) / (yj - yi) + xi) THEN inside := NOT inside; END IF;
    dx := xj - xi; dy := yj - yi;
    IF dx = 0 AND dy = 0 THEN t := 0; ELSE t := greatest(0, least(1, -(xi*dx + yi*dy) / (dx*dx + dy*dy))); END IF;
    px := xi + t*dx; py := yi + t*dy; d := sqrt(px*px + py*py);
    IF d < best THEN best := d; END IF;
    j := i;
  END LOOP;
  IF inside THEN RETURN 0; END IF;
  RETURN best;
END $$;

CREATE OR REPLACE FUNCTION public.kawscan_code_for(_store_id uuid, _period int, _counter bigint)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE sec bytea; h text;
BEGIN
  INSERT INTO public.kawscan_store_secrets(store_id) VALUES (_store_id) ON CONFLICT DO NOTHING;
  SELECT secret INTO sec FROM public.kawscan_store_secrets WHERE store_id = _store_id;
  h := encode(extensions.hmac(convert_to(_store_id::text || ':' || _period || ':' || _counter, 'UTF8'), sec, 'sha256'), 'hex');
  RETURN lpad(((('x' || substr(h, 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0');
END $$;
REVOKE ALL ON FUNCTION public.kawscan_code_for(uuid, int, bigint) FROM PUBLIC, anon, authenticated;

-- Code actuel pour le vendeur
CREATE OR REPLACE FUNCTION public.kawscan_current_code(_store_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; secs bigint; ctr bigint;
BEGIN
  IF NOT public.kawscan_can_manage(_store_id, auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO s FROM public.kawscan_stores WHERE id = _store_id;
  secs := s.code_period_minutes * 60;
  ctr := floor(extract(epoch FROM now()) / secs);
  RETURN jsonb_build_object('code', public.kawscan_code_for(_store_id, s.code_period_minutes, ctr),
    'expires_at', to_timestamp((ctr + 1) * secs), 'period_minutes', s.code_period_minutes);
END $$;
REVOKE ALL ON FUNCTION public.kawscan_current_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kawscan_current_code(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.kawscan_close_session(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sid uuid;
BEGIN
  SELECT store_id INTO sid FROM public.kawscan_sessions WHERE id = _id;
  IF sid IS NULL THEN RETURN; END IF;
  IF NOT public.kawscan_can_manage(sid, auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.kawscan_sessions WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.kawscan_close_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kawscan_close_session(uuid) TO authenticated;

-- Mode de protection visible par le client (sans secret)
CREATE OR REPLACE FUNCTION public.kawscan_store_protection(_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('mode', protection_mode, 'session_minutes', session_max_minutes)
  FROM public.kawscan_stores WHERE slug = _slug
$$;
GRANT EXECUTE ON FUNCTION public.kawscan_store_protection(text) TO anon, authenticated;

-- Démarrage d'une session
CREATE OR REPLACE FUNCTION public.kawscan_session_start(_slug text, _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL, _acc double precision DEFAULT NULL, _code text DEFAULT NULL, _attempt_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE st record; s record; needs_gps boolean; needs_code boolean; d float8; secs bigint; ctr bigint;
  c text; ok boolean := false; tok text; ak text; exp timestamptz;
BEGIN
  SELECT * INTO st FROM public.kawscan_public_store(_slug);
  IF st.id IS NULL THEN RETURN jsonb_build_object('error','store_not_found'); END IF;
  IF st.access_state <> 'ok' THEN RETURN jsonb_build_object('error', st.access_state); END IF;
  SELECT * INTO s FROM public.kawscan_stores WHERE id = st.id;
  needs_gps := s.protection_mode IN ('gps','gps_code');
  needs_code := s.protection_mode IN ('code','gps_code');

  DELETE FROM public.kawscan_sessions WHERE expires_at < now() - interval '1 minute';
  DELETE FROM public.kawscan_code_attempts WHERE at < now() - interval '10 minutes';

  IF needs_gps THEN
    IF s.zone_polygon IS NULL THEN RETURN jsonb_build_object('error','zone_not_configured'); END IF;
    IF _lat IS NULL OR _lng IS NULL THEN RETURN jsonb_build_object('error','location_required'); END IF;
    IF _acc IS NULL OR _acc > 100 THEN RETURN jsonb_build_object('error','gps_imprecise'); END IF;
    d := public.kawscan_zone_distance(s.zone_polygon, _lat, _lng);
    IF d - _acc - 15 > 0 THEN RETURN jsonb_build_object('error','out_of_zone'); END IF;
  END IF;

  IF needs_code THEN
    ak := left(coalesce(nullif(_attempt_key,''), 'anon'), 80);
    IF (SELECT count(*) FROM public.kawscan_code_attempts WHERE store_id = st.id AND attempt_key = ak AND at > now() - interval '5 minutes') >= 5
       OR (SELECT count(*) FROM public.kawscan_code_attempts WHERE store_id = st.id AND at > now() - interval '5 minutes') >= 60 THEN
      RETURN jsonb_build_object('error','too_many_attempts');
    END IF;
    c := regexp_replace(coalesce(_code,''), '\D', '', 'g');
    IF c = '' THEN RETURN jsonb_build_object('error','code_required'); END IF;
    secs := s.code_period_minutes * 60;
    ctr := floor(extract(epoch FROM now()) / secs);
    IF c = public.kawscan_code_for(st.id, s.code_period_minutes, ctr) THEN ok := true;
    ELSIF extract(epoch FROM now()) - ctr * secs <= 30
      AND c = public.kawscan_code_for(st.id, s.code_period_minutes, ctr - 1) THEN ok := true; END IF;
    IF NOT ok THEN
      INSERT INTO public.kawscan_code_attempts(store_id, attempt_key) VALUES (st.id, ak);
      RETURN jsonb_build_object('error','bad_code');
    END IF;
  END IF;

  IF s.protection_mode = 'none' THEN RETURN jsonb_build_object('mode','none'); END IF;

  tok := encode(gen_random_bytes(24), 'hex');
  exp := now() + make_interval(mins => s.session_max_minutes);
  INSERT INTO public.kawscan_sessions(store_id, token_hash, short_id, expires_at, last_ping_at)
  VALUES (st.id, encode(digest(tok, 'sha256'), 'hex'), lpad((floor(random()*10000))::int::text, 4, '0'), exp,
          CASE WHEN needs_gps THEN now() END);
  RETURN jsonb_build_object('token', tok, 'expires_at', exp, 'mode', s.protection_mode);
END $$;
GRANT EXECUTE ON FUNCTION public.kawscan_session_start(text, double precision, double precision, double precision, text, text) TO anon, authenticated;

-- Contrôle de session (interne) : renvoie 'ok' ou un code d'erreur, incrémente les compteurs
CREATE OR REPLACE FUNCTION public.kawscan_session_check(_store_id uuid, _token text, _kind text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE s record; se record;
BEGIN
  SELECT * INTO s FROM public.kawscan_stores WHERE id = _store_id;
  IF s.protection_mode = 'none' THEN RETURN 'ok'; END IF;
  IF _token IS NULL OR _token = '' THEN RETURN 'session_required'; END IF;
  SELECT * INTO se FROM public.kawscan_sessions WHERE token_hash = encode(digest(_token, 'sha256'), 'hex') AND store_id = _store_id;
  IF se.id IS NULL THEN RETURN 'session_ended'; END IF;
  IF se.expires_at < now() THEN DELETE FROM public.kawscan_sessions WHERE id = se.id; RETURN 'session_expired'; END IF;
  IF s.protection_mode IN ('gps','gps_code') AND (se.last_ping_at IS NULL OR se.last_ping_at < now() - interval '120 seconds') THEN
    RETURN 'location_required';
  END IF;
  IF _kind = 'scan' THEN UPDATE public.kawscan_sessions SET scans = scans + 1 WHERE id = se.id;
  ELSIF _kind = 'search' THEN UPDATE public.kawscan_sessions SET searches = searches + 1 WHERE id = se.id; END IF;
  RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION public.kawscan_session_check(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Suivi de position pendant la session
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
  IF s.protection_mode IN ('gps','gps_code') AND _lat IS NOT NULL AND _lng IS NOT NULL AND _acc IS NOT NULL AND _acc <= 100 THEN
    d := public.kawscan_zone_distance(s.zone_polygon, _lat, _lng);
    IF d IS NOT NULL AND d - _acc - 15 > 0 THEN
      IF se.out_of_zone_since IS NOT NULL AND se.out_of_zone_since <= now() - interval '60 seconds' THEN
        DELETE FROM public.kawscan_sessions WHERE id = se.id;
        RETURN jsonb_build_object('error','out_of_zone');
      END IF;
      UPDATE public.kawscan_sessions SET last_ping_at = now(), out_of_zone_since = coalesce(out_of_zone_since, now()) WHERE id = se.id;
    ELSE
      UPDATE public.kawscan_sessions SET last_ping_at = now(), out_of_zone_since = NULL WHERE id = se.id;
    END IF;
  ELSIF s.protection_mode = 'code' THEN
    NULL;
  END IF;
  RETURN jsonb_build_object('ok', true, 'expires_at', se.expires_at);
END $$;
GRANT EXECUTE ON FUNCTION public.kawscan_session_ping(text, text, double precision, double precision, double precision) TO anon, authenticated;

-- Garder l'ancien calcul comme fonctions internes, puis ajouter le contrôle de session
ALTER FUNCTION public.kawscan_lookup(text, text) RENAME TO kawscan_lookup_core;
REVOKE ALL ON FUNCTION public.kawscan_lookup_core(text, text) FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.kawscan_search(text, text, integer) RENAME TO kawscan_search_core;
REVOKE ALL ON FUNCTION public.kawscan_search_core(text, text, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.kawscan_lookup(_slug text, _code text, _session text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE st record; chk text; r jsonb;
BEGIN
  SELECT * INTO st FROM public.kawscan_public_store(_slug);
  IF st.id IS NULL THEN RETURN jsonb_build_object('error','store_not_found'); END IF;
  IF st.access_state <> 'ok' THEN RETURN jsonb_build_object('error', st.access_state); END IF;
  chk := public.kawscan_session_check(st.id, _session, 'none');
  IF chk <> 'ok' THEN RETURN jsonb_build_object('error', chk); END IF;
  r := public.kawscan_lookup_core(_slug, _code);
  IF NOT (r ? 'error') THEN PERFORM public.kawscan_session_check(st.id, _session, 'scan'); END IF;
  RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.kawscan_lookup(text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.kawscan_search(_slug text, _q text, _limit integer DEFAULT 20, _session text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE st record; chk text;
BEGIN
  SELECT * INTO st FROM public.kawscan_public_store(_slug);
  IF st.id IS NULL THEN RETURN jsonb_build_object('error','store_not_found'); END IF;
  IF st.access_state <> 'ok' THEN RETURN jsonb_build_object('error', st.access_state); END IF;
  chk := public.kawscan_session_check(st.id, _session, 'search');
  IF chk <> 'ok' THEN RETURN jsonb_build_object('error', chk); END IF;
  RETURN public.kawscan_search_core(_slug, _q, _limit);
END $$;
GRANT EXECUTE ON FUNCTION public.kawscan_search(text, text, integer, text) TO anon, authenticated;

-- Purge régulière
SELECT cron.schedule('kawscan-sessions-purge', '0 3 * * *',
  $$DELETE FROM public.kawscan_sessions WHERE expires_at < now(); DELETE FROM public.kawscan_code_attempts WHERE at < now() - interval '10 minutes';$$);