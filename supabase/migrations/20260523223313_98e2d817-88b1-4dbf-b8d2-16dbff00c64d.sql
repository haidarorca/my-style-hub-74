-- Enable pgcrypto for AES encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Singleton session table
CREATE TABLE IF NOT EXISTS public.taobao_sessions (
  id text PRIMARY KEY DEFAULT 'main' CHECK (id = 'main'),
  cookies_encrypted bytea,
  user_agent text,
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected','connected','expired','pending')),
  connected_at timestamptz,
  last_check_at timestamptz,
  expires_at timestamptz,
  nickname text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.taobao_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "taobao_sessions admins read" ON public.taobao_sessions;
CREATE POLICY "taobao_sessions admins read"
  ON public.taobao_sessions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

-- No insert/update/delete policy: only service role (server functions) writes.

-- SECURITY DEFINER helpers. Key is passed by the server function (read from env),
-- never stored in the DB. These functions are callable by admins only.

CREATE OR REPLACE FUNCTION public.taobao_session_save(_cookies jsonb, _ua text, _nickname text, _key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF _key IS NULL OR length(_key) < 16 THEN
    RAISE EXCEPTION 'Invalid encryption key';
  END IF;
  INSERT INTO public.taobao_sessions (id, cookies_encrypted, user_agent, status, connected_at, last_check_at, expires_at, nickname, updated_at)
  VALUES (
    'main',
    pgp_sym_encrypt(_cookies::text, _key),
    _ua,
    'connected',
    now(),
    now(),
    now() + interval '14 days',
    _nickname,
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    cookies_encrypted = EXCLUDED.cookies_encrypted,
    user_agent = EXCLUDED.user_agent,
    status = 'connected',
    connected_at = now(),
    last_check_at = now(),
    expires_at = now() + interval '14 days',
    nickname = EXCLUDED.nickname,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.taobao_session_load(_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enc bytea;
  v_text text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT cookies_encrypted INTO v_enc FROM public.taobao_sessions WHERE id='main';
  IF v_enc IS NULL THEN RETURN NULL; END IF;
  BEGIN
    v_text := pgp_sym_decrypt(v_enc, _key);
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  UPDATE public.taobao_sessions SET last_check_at = now() WHERE id='main';
  RETURN v_text::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.taobao_session_clear()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE public.taobao_sessions
  SET cookies_encrypted = NULL,
      status = 'disconnected',
      nickname = NULL,
      connected_at = NULL,
      expires_at = NULL,
      updated_at = now()
  WHERE id='main';
END;
$$;

CREATE OR REPLACE FUNCTION public.taobao_session_mark_expired()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE public.taobao_sessions
  SET status = 'expired', last_check_at = now(), updated_at = now()
  WHERE id='main';
END;
$$;

-- Seed singleton row
INSERT INTO public.taobao_sessions (id, status) VALUES ('main', 'disconnected')
ON CONFLICT (id) DO NOTHING;