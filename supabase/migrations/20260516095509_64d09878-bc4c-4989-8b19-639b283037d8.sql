CREATE TABLE IF NOT EXISTS public.email_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evc_email_created ON public.email_verification_codes(email, created_at DESC);
ALTER TABLE public.email_verification_codes ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (admin client in server functions) can access it.