
-- 1) admin_permission enum
DO $$ BEGIN
  CREATE TYPE public.admin_permission AS ENUM (
    'orders',
    'products',
    'product_validation',
    'categories',
    'vendors',
    'customers',
    'support',
    'settings'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) admin_permissions table
CREATE TABLE IF NOT EXISTS public.admin_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permission public.admin_permission NOT NULL,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission)
);
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

-- 3) is_suspended on user_roles
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;

-- 4) admin_action_log
CREATE TABLE IF NOT EXISTS public.admin_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_action_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_admin_action_log_created_at ON public.admin_action_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_actor ON public.admin_action_log (actor_id);

-- 5) Functions
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'::app_role
      AND is_suspended = false
  )
$$;

CREATE OR REPLACE FUNCTION public.has_admin_permission(_user_id uuid, _perm public.admin_permission)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.admin_permissions ap
      JOIN public.user_roles ur ON ur.user_id = ap.user_id AND ur.role = 'admin'::app_role AND ur.is_suspended = false
      WHERE ap.user_id = _user_id AND ap.permission = _perm
    )
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_permission(_perm public.admin_permission)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_admin_permission(auth.uid(), _perm)
$$;

CREATE OR REPLACE FUNCTION public.protect_owner_super_admin()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  owner_id uuid;
BEGIN
  SELECT id INTO owner_id FROM auth.users WHERE email = 'haidarorca@gmail.com' LIMIT 1;
  IF owner_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.user_id = owner_id AND OLD.role = 'super_admin'::app_role THEN
      RAISE EXCEPTION 'Le super administrateur propriétaire ne peut pas être retiré.';
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.user_id = owner_id AND OLD.role = 'super_admin'::app_role AND NEW.is_suspended = true THEN
      RAISE EXCEPTION 'Le super administrateur propriétaire ne peut pas être suspendu.';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_owner_super_admin_trg ON public.user_roles;
CREATE TRIGGER protect_owner_super_admin_trg
  BEFORE UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_owner_super_admin();

CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action text,
  _target_type text DEFAULT NULL,
  _target_id text DEFAULT NULL,
  _details jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_id uuid;
  email_val text;
BEGIN
  SELECT email INTO email_val FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.admin_action_log (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), email_val, _action, _target_type, _target_id, _details)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

-- 6) RLS policies
DROP POLICY IF EXISTS admin_perms_super_all ON public.admin_permissions;
CREATE POLICY admin_perms_super_all ON public.admin_permissions
  FOR ALL TO public
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS admin_perms_self_read ON public.admin_permissions;
CREATE POLICY admin_perms_self_read ON public.admin_permissions
  FOR SELECT TO public
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS admin_log_super_read ON public.admin_action_log;
CREATE POLICY admin_log_super_read ON public.admin_action_log
  FOR SELECT TO public
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS admin_log_super_insert ON public.admin_action_log;
CREATE POLICY admin_log_super_insert ON public.admin_action_log
  FOR INSERT TO public
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS roles_admin_write ON public.user_roles;
DROP POLICY IF EXISTS roles_super_write ON public.user_roles;
CREATE POLICY roles_super_write ON public.user_roles
  FOR ALL TO public
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 7) handle_new_user: super_admin for owner
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  IF NEW.email = 'haidarorca@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin'::app_role) ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin'::app_role) ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'acheteur'::app_role) ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 8) Bootstrap owner
DO $$
DECLARE
  owner_id uuid;
BEGIN
  SELECT id INTO owner_id FROM auth.users WHERE email = 'haidarorca@gmail.com' LIMIT 1;
  IF owner_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (owner_id, 'super_admin'::app_role)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
