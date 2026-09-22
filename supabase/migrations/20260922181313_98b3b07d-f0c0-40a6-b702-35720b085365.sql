-- Jetons CJ : accessibles UNIQUEMENT au serveur (aucun GRANT anon/authenticated).
CREATE TABLE IF NOT EXISTS public.cj_auth_tokens (
  id text PRIMARY KEY DEFAULT 'default',
  access_token text,
  refresh_token text,
  access_token_expiry timestamptz,
  refresh_token_expiry timestamptz,
  obtained_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.cj_auth_tokens TO service_role;
ALTER TABLE public.cj_auth_tokens ENABLE ROW LEVEL SECURITY;
-- Aucune policy : aucun accès via l'API publique, même pour un admin connecté.

-- État de connexion : lisible par les administrateurs.
CREATE TABLE IF NOT EXISTS public.cj_connection_state (
  id text PRIMARY KEY DEFAULT 'default',
  is_connected boolean NOT NULL DEFAULT false,
  last_checked_at timestamptz,
  last_error text,
  last_endpoint text,
  last_latency_ms integer,
  access_token_expiry timestamptz,
  refresh_token_expiry timestamptz,
  api_calls_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cj_connection_state TO authenticated;
GRANT ALL ON public.cj_connection_state TO service_role;
ALTER TABLE public.cj_connection_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read CJ connection state"
  ON public.cj_connection_state FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_cj_auth_tokens_updated_at BEFORE UPDATE ON public.cj_auth_tokens
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_cj_connection_state_updated_at BEFORE UPDATE ON public.cj_connection_state
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.cj_connection_state (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;