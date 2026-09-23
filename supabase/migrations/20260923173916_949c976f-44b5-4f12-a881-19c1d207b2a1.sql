CREATE OR REPLACE FUNCTION public.kawscan_store_protection(_slug text)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object('mode', protection_mode, 'session_minutes', session_max_minutes,
    'is_manager', auth.uid() IS NOT NULL AND public.kawscan_can_manage(id, auth.uid()))
  FROM public.kawscan_stores WHERE slug = _slug
$$;

CREATE OR REPLACE FUNCTION public.kawscan_session_check(_store_id uuid, _token text, _kind text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE s record; se record;
BEGIN
  SELECT * INTO s FROM public.kawscan_stores WHERE id = _store_id;
  IF s.protection_mode = 'none' THEN RETURN 'ok'; END IF;
  -- Propriétaire / employés : accès direct, jamais de session client ni de compteur.
  IF auth.uid() IS NOT NULL AND public.kawscan_can_manage(_store_id, auth.uid()) THEN RETURN 'ok'; END IF;
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
END $function$;

-- Garde-fou : un gestionnaire ne peut pas créer de session client.
CREATE OR REPLACE FUNCTION public.kawscan_session_start_guard(_slug text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.kawscan_stores WHERE slug=_slug AND public.kawscan_can_manage(id, auth.uid())) $$;

DO $$
DECLARE def text;
BEGIN
  def := pg_get_functiondef('public.kawscan_session_start(text,double precision,double precision,double precision,text,text)'::regprocedure);
  def := replace(def, E'BEGIN\n  SELECT * INTO st FROM public.kawscan_public_store(_slug);',
    E'BEGIN\n  IF public.kawscan_session_start_guard(_slug) THEN RETURN jsonb_build_object(''error'',''manager''); END IF;\n  SELECT * INTO st FROM public.kawscan_public_store(_slug);');
  IF position('kawscan_session_start_guard' in def) = 0 THEN RAISE EXCEPTION 'patch failed'; END IF;
  EXECUTE def;
END $$;

-- Supprimer les sessions déjà créées par erreur n'est pas possible (anonymes) : elles expirent seules.