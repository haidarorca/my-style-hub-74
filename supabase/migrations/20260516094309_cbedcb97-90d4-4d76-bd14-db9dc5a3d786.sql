CREATE TABLE IF NOT EXISTS public.password_reset_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prc_email_created ON public.password_reset_codes (email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prc_expires ON public.password_reset_codes (expires_at);

ALTER TABLE public.password_reset_codes ENABLE ROW LEVEL SECURITY;
-- No policies: only service role (server) can read/write.
