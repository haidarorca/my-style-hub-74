ALTER TABLE public.kawscan_stores
  ADD COLUMN IF NOT EXISTS code_op1 text NOT NULL DEFAULT '*',
  ADD COLUMN IF NOT EXISTS code_n1 integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS code_op2 text,
  ADD COLUMN IF NOT EXISTS code_n2 integer,
  ADD COLUMN IF NOT EXISTS code_timezone text NOT NULL DEFAULT 'Africa/Dakar';
DO $$ BEGIN
  ALTER TABLE public.kawscan_stores ADD CONSTRAINT kawscan_stores_code_ops_chk CHECK (
    code_op1 IN ('+','*') AND (code_op2 IS NULL OR code_op2 IN ('+','*'))
    AND code_n1 BETWEEN 0 AND 9999 AND (code_n2 IS NULL OR code_n2 BETWEEN 0 AND 9999));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.kawscan_apply_formula(_h int, _op1 text, _n1 int, _op2 text, _n2 int)
RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _op2 IS NULL OR _n2 IS NULL THEN r1
              WHEN _op2 = '*' THEN r1 * _n2 ELSE r1 + _n2 END
  FROM (SELECT CASE WHEN _op1 = '*' THEN _h::bigint * _n1 ELSE _h::bigint + _n1 END AS r1) x
$$;

CREATE OR REPLACE FUNCTION public.kawscan_current_code(_store_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; loc timestamp; h int; nxt timestamptz;
BEGIN
  IF NOT public.kawscan_can_manage(_store_id, auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO s FROM public.kawscan_stores WHERE id = _store_id;
  loc := now() AT TIME ZONE s.code_timezone;
  h := extract(hour FROM loc);
  nxt := (date_trunc('hour', loc) + interval '1 hour') AT TIME ZONE s.code_timezone;
  RETURN jsonb_build_object('code', public.kawscan_apply_formula(h, s.code_op1, s.code_n1, s.code_op2, s.code_n2)::text,
    'hour', h, 'server_now', now(), 'next_change_at', nxt, 'expires_at', nxt, 'period_minutes', s.code_period_minutes);
END $$;

CREATE OR REPLACE FUNCTION public.kawscan_session_start(_slug text, _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL, _acc double precision DEFAULT NULL, _code text DEFAULT NULL, _attempt_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE st record; s record; needs_gps boolean; needs_code boolean; d float8;
  c text; ok boolean := false; tok text; ak text; exp timestamptz; loc timestamp; h int; hp int;
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
    c := ltrim(regexp_replace(coalesce(_code,''), '\D', '', 'g'), '0');
    IF regexp_replace(coalesce(_code,''), '\D', '', 'g') = '' THEN RETURN jsonb_build_object('error','code_required'); END IF;
    IF c = '' THEN c := '0'; END IF;
    loc := now() AT TIME ZONE s.code_timezone;
    h := extract(hour FROM loc);
    hp := extract(hour FROM loc - interval '1 hour');
    IF c = public.kawscan_apply_formula(h, s.code_op1, s.code_n1, s.code_op2, s.code_n2)::text THEN ok := true;
    ELSIF loc - date_trunc('hour', loc) <= make_interval(mins => s.code_period_minutes)
      AND c = public.kawscan_apply_formula(hp, s.code_op1, s.code_n1, s.code_op2, s.code_n2)::text THEN ok := true; END IF;
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