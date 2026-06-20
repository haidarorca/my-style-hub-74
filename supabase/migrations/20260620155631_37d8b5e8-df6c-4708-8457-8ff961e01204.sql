
-- ============================================================
-- 1) APP_ROLES
-- ============================================================
CREATE TABLE public.app_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_roles TO authenticated;
GRANT ALL ON public.app_roles TO service_role;
ALTER TABLE public.app_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_roles read for admins"
  ON public.app_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE POLICY "app_roles write for super_admin"
  ON public.app_roles FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============================================================
-- 2) ROLE_PERMISSIONS
-- ============================================================
CREATE TABLE public.role_permissions (
  role_id uuid NOT NULL REFERENCES public.app_roles(id) ON DELETE CASCADE,
  resource text NOT NULL,
  action text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, resource, action)
);
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_permissions read for admins"
  ON public.role_permissions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE POLICY "role_permissions write for super_admin"
  ON public.role_permissions FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============================================================
-- 3) USER_ROLE_ASSIGNMENTS
-- ============================================================
CREATE TABLE public.user_role_assignments (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.app_roles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);
GRANT SELECT ON public.user_role_assignments TO authenticated;
GRANT ALL ON public.user_role_assignments TO service_role;
ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_role_assignments read for admins or self"
  ON public.user_role_assignments FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "user_role_assignments write for super_admin"
  ON public.user_role_assignments FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE INDEX ON public.user_role_assignments (role_id);

-- ============================================================
-- 4) TASKS
-- ============================================================
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  task_type text NOT NULL,
  title text,
  description text,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  assignee_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assignee_role_key text,
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('open','in_progress','done','cancelled')),
  CHECK (priority IN ('low','normal','high','urgent'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.tasks (assignee_user_id, status);
CREATE INDEX ON public.tasks (assignee_role_key, status);
CREATE INDEX ON public.tasks (order_id);
CREATE INDEX ON public.tasks (status, due_at);

-- Helper : user has a given role-key assignment (via app_roles)
CREATE OR REPLACE FUNCTION public.user_has_role_key(_user_id uuid, _role_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    JOIN public.app_roles r ON r.id = ura.role_id
    WHERE ura.user_id = _user_id AND r.key = _role_key
  )
$$;

CREATE POLICY "tasks read"
  ON public.tasks FOR SELECT TO authenticated
  USING (
    assignee_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_super_admin(auth.uid())
    OR (assignee_role_key IS NOT NULL AND public.user_has_role_key(auth.uid(), assignee_role_key))
  );

CREATE POLICY "tasks insert admin"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "tasks update by assignee or admin"
  ON public.tasks FOR UPDATE TO authenticated
  USING (
    assignee_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_super_admin(auth.uid())
    OR (assignee_role_key IS NOT NULL AND public.user_has_role_key(auth.uid(), assignee_role_key))
  )
  WITH CHECK (
    assignee_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_super_admin(auth.uid())
    OR (assignee_role_key IS NOT NULL AND public.user_has_role_key(auth.uid(), assignee_role_key))
  );

CREATE POLICY "tasks delete super_admin"
  ON public.tasks FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER trg_app_roles_updated_at
  BEFORE UPDATE ON public.app_roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- 5) ADMIN_ACTION_LOG EXTENSION
-- ============================================================
ALTER TABLE public.admin_action_log
  ADD COLUMN IF NOT EXISTS from_page text,
  ADD COLUMN IF NOT EXISTS actor_role_keys text[];

-- ============================================================
-- 6) user_can(uid, resource, action)
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_can(_user_id uuid, _resource text, _action text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_role_assignments ura
      JOIN public.role_permissions rp ON rp.role_id = ura.role_id
      WHERE ura.user_id = _user_id
        AND rp.resource = _resource
        AND rp.action = _action
        AND rp.allowed = true
    )
$$;

CREATE OR REPLACE FUNCTION public.current_user_can(_resource text, _action text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.user_can(auth.uid(), _resource, _action) $$;

-- ============================================================
-- 7) SEED des rôles système et matrice de permissions par défaut
-- ============================================================
INSERT INTO public.app_roles (key, label, description, is_system) VALUES
  ('super_admin',     'Super Administrateur', 'Accès total au système', true),
  ('agent_commandes', 'Agent Commandes',      'Reçoit les commandes, contacte les clients, vérifie les paiements', true),
  ('agent_import',    'Agent Import',         'Gère l''import (Chine, Turquie, Liban), pesée, calcul fret', true),
  ('livreur',         'Livreur',              'Effectue les livraisons sur le terrain', true),
  ('admin_legacy',    'Administrateur (legacy)', 'Compatibilité avec les administrateurs historiques', true)
ON CONFLICT (key) DO NOTHING;

-- Matrice de permissions par défaut
WITH r AS (SELECT id, key FROM public.app_roles WHERE key IN ('agent_commandes','agent_import','livreur','admin_legacy'))
INSERT INTO public.role_permissions (role_id, resource, action, allowed)
SELECT r.id, perm.resource, perm.action, true
FROM r
JOIN LATERAL (
  VALUES
    -- agent_commandes
    ('agent_commandes','orders','view'),
    ('agent_commandes','orders','update'),
    ('agent_commandes','orders','confirm'),
    ('agent_commandes','payments','view'),
    ('agent_commandes','payments','verify'),
    ('agent_commandes','customers','view'),
    ('agent_commandes','customers','contact'),
    ('agent_commandes','tasks','view'),
    ('agent_commandes','tasks','complete'),
    -- agent_import
    ('agent_import','orders','view'),
    ('agent_import','orders','update_import'),
    ('agent_import','import','weigh'),
    ('agent_import','import','compute_freight'),
    ('agent_import','import','request_freight_payment'),
    ('agent_import','suppliers','view'),
    ('agent_import','suppliers','contact'),
    ('agent_import','tasks','view'),
    ('agent_import','tasks','complete'),
    -- livreur
    ('livreur','deliveries','view'),
    ('livreur','deliveries','update_status'),
    ('livreur','tasks','view'),
    ('livreur','tasks','complete'),
    -- admin_legacy : équivalent admin global
    ('admin_legacy','orders','view'),
    ('admin_legacy','orders','update'),
    ('admin_legacy','orders','delete'),
    ('admin_legacy','products','view'),
    ('admin_legacy','products','update'),
    ('admin_legacy','payments','view'),
    ('admin_legacy','payments','verify'),
    ('admin_legacy','customers','view'),
    ('admin_legacy','vendors','view'),
    ('admin_legacy','support','view'),
    ('admin_legacy','tasks','view'),
    ('admin_legacy','tasks','complete')
) AS perm(role_key, resource, action) ON perm.role_key = r.key
ON CONFLICT (role_id, resource, action) DO NOTHING;
