
-- ===== 1. password_change_log =====
CREATE TABLE public.password_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  method text NOT NULL CHECK (method IN ('self','reset','admin')),
  ip text,
  user_agent text,
  success boolean NOT NULL DEFAULT true,
  error_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pcl_user_created ON public.password_change_log(user_id, created_at DESC);
CREATE INDEX idx_pcl_created ON public.password_change_log(created_at DESC);

GRANT SELECT ON public.password_change_log TO authenticated;
GRANT ALL ON public.password_change_log TO service_role;

ALTER TABLE public.password_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pcl_self_select" ON public.password_change_log
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

-- Append-only guard
CREATE TRIGGER pcl_append_only_update
  BEFORE UPDATE ON public.password_change_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_append_only_guard();
CREATE TRIGGER pcl_append_only_delete
  BEFORE DELETE ON public.password_change_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_append_only_guard();

-- ===== 2. user_security_settings (2FA fondations) =====
CREATE TABLE public.user_security_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  totp_enabled boolean NOT NULL DEFAULT false,
  totp_secret text,
  totp_confirmed_at timestamptz,
  recovery_codes_hash text[] NOT NULL DEFAULT '{}',
  recovery_codes_generated_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_security_settings TO authenticated;
GRANT ALL ON public.user_security_settings TO service_role;

ALTER TABLE public.user_security_settings ENABLE ROW LEVEL SECURITY;

-- Users can READ their own row (secret column is filtered server-side)
CREATE POLICY "uss_self_select" ON public.user_security_settings
  FOR SELECT USING (auth.uid() = user_id);

-- Writes ONLY through server functions (service role bypasses RLS)
-- No INSERT/UPDATE/DELETE policy for authenticated → blocked

CREATE TRIGGER uss_updated_at
  BEFORE UPDATE ON public.user_security_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ===== 3. auth_rate_limits =====
CREATE TABLE public.auth_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,            -- "reset:email@x.com" or "reset:ip:1.2.3.4"
  action text NOT NULL,         -- 'reset_send', 'reset_verify', 'change_pw'
  attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  first_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key, action)
);
CREATE INDEX idx_arl_locked ON public.auth_rate_limits(locked_until) WHERE locked_until IS NOT NULL;

GRANT ALL ON public.auth_rate_limits TO service_role;
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policy: only service_role can access

-- ===== 4. password_reset_codes augmenté =====
ALTER TABLE public.password_reset_codes
  ADD COLUMN IF NOT EXISTS ip text,
  ADD COLUMN IF NOT EXISTS user_agent text;

-- ===== 5. Nettoyage index notifications dupliqué =====
DROP INDEX IF EXISTS public.idx_notif_user_unread;
-- Keep idx_notifications_user_unread (already exists)
-- Add index for paginated full lists (lists with mixed read/unread sorted by created_at)
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);
