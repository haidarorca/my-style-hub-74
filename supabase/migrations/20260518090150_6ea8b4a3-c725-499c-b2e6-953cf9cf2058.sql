
-- ============================================================
-- 1) ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.shop_contact_mode AS ENUM ('direct','internal_only','admin_only','blocked','after_order_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.product_contact_override AS ENUM ('inherit','allowed','blocked','support_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.support_conv_type AS ENUM ('client_support','client_vendor','vendor_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.support_conv_status AS ENUM ('new','open','answered','closed','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.support_priority AS ENUM ('low','normal','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.support_sender_role AS ENUM ('client','vendor','admin','system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2) CONTACT SETTINGS (singleton 'main')
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contact_settings (
  id text PRIMARY KEY DEFAULT 'main',
  support_enabled boolean NOT NULL DEFAULT true,
  whatsapp_enabled boolean NOT NULL DEFAULT true,
  internal_messaging_enabled boolean NOT NULL DEFAULT true,
  vendor_contact_enabled boolean NOT NULL DEFAULT true,
  commission_hides_vendor_contact boolean NOT NULL DEFAULT true,
  whatsapp_support_numbers jsonb NOT NULL DEFAULT '[]'::jsonb,
  support_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  telegram_url text,
  messenger_url text,
  support_hours_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  auto_reply_message_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_assigned_admin_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.contact_settings (id) VALUES ('main') ON CONFLICT DO NOTHING;

ALTER TABLE public.contact_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_settings_public_read ON public.contact_settings;
CREATE POLICY contact_settings_public_read ON public.contact_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS contact_settings_admin_write ON public.contact_settings;
CREATE POLICY contact_settings_admin_write ON public.contact_settings FOR ALL
  USING (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS tg_contact_settings_updated_at ON public.contact_settings;
CREATE TRIGGER tg_contact_settings_updated_at BEFORE UPDATE ON public.contact_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- 3) PROFILES (shop contact policy)
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_mode public.shop_contact_mode NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS show_whatsapp boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_phone boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_address boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS assigned_support_admin_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- Lock down contact visibility when commission is enabled (default)
UPDATE public.profiles
SET show_whatsapp = false, show_email = false, show_phone = false, show_address = false,
    contact_mode = 'admin_only'
WHERE vendor_mode = 'commission'::public.vendor_mode
  AND contact_mode = 'direct';

-- ============================================================
-- 4) PRODUCTS
-- ============================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS contact_override public.product_contact_override NOT NULL DEFAULT 'inherit';

-- ============================================================
-- 5) SECURITY DEFINER FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION public.vendor_contacts_visible(_vendor_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode public.vendor_mode;
  v_contact_mode public.shop_contact_mode;
  v_commission_hides boolean;
  v_global_enabled boolean;
BEGIN
  SELECT vendor_mode, contact_mode INTO v_mode, v_contact_mode
  FROM public.profiles WHERE id = _vendor_id;

  IF v_mode IS NULL THEN RETURN false; END IF;

  SELECT vendor_contact_enabled, commission_hides_vendor_contact
  INTO v_global_enabled, v_commission_hides
  FROM public.contact_settings WHERE id = 'main';

  IF NOT COALESCE(v_global_enabled, true) THEN RETURN false; END IF;
  IF v_contact_mode IN ('blocked','admin_only','internal_only') THEN RETURN false; END IF;
  IF v_mode = 'commission'::public.vendor_mode AND COALESCE(v_commission_hides, true) THEN
    RETURN false;
  END IF;

  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.resolve_contact_policy(_vendor_id uuid, _product_id uuid DEFAULT NULL)
RETURNS TABLE(
  can_contact_vendor boolean,
  can_use_internal_messaging boolean,
  can_use_support boolean,
  show_whatsapp boolean,
  show_email boolean,
  show_phone boolean,
  show_address boolean,
  contact_mode public.shop_contact_mode,
  is_commission boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.contact_settings;
  v_profile public.profiles;
  v_override public.product_contact_override := 'inherit';
  v_is_commission boolean;
  v_contacts_visible boolean;
  v_can_vendor boolean;
BEGIN
  SELECT * INTO v_settings FROM public.contact_settings WHERE id='main';
  SELECT * INTO v_profile FROM public.profiles WHERE id = _vendor_id;

  IF _product_id IS NOT NULL THEN
    SELECT contact_override INTO v_override FROM public.products WHERE id = _product_id;
  END IF;

  v_is_commission := v_profile.vendor_mode = 'commission'::public.vendor_mode;
  v_contacts_visible := public.vendor_contacts_visible(_vendor_id);

  -- Resolve can_contact_vendor
  v_can_vendor := COALESCE(v_settings.vendor_contact_enabled, true)
              AND v_contacts_visible
              AND v_profile.contact_mode = 'direct';

  IF v_override = 'blocked' OR v_override = 'support_only' THEN v_can_vendor := false; END IF;
  IF v_override = 'allowed' AND COALESCE(v_settings.vendor_contact_enabled, true) THEN
    -- override forces allowed only if global allows
    v_can_vendor := v_can_vendor;
  END IF;

  RETURN QUERY SELECT
    v_can_vendor,
    COALESCE(v_settings.internal_messaging_enabled, true) AND v_profile.contact_mode IN ('direct','internal_only','after_order_only'),
    COALESCE(v_settings.support_enabled, true),
    v_can_vendor AND COALESCE(v_profile.show_whatsapp, false),
    v_can_vendor AND COALESCE(v_profile.show_email, false),
    v_can_vendor AND COALESCE(v_profile.show_phone, false),
    v_can_vendor AND COALESCE(v_profile.show_address, false),
    v_profile.contact_mode,
    v_is_commission;
END $$;

-- ============================================================
-- 6) PUBLIC VENDOR CONTACTS VIEW
-- ============================================================
CREATE OR REPLACE VIEW public.public_vendor_contacts
WITH (security_invoker = false) AS
SELECT
  p.id AS vendor_id,
  p.shop_name,
  p.shop_logo_url,
  p.shop_banner_url,
  p.shop_description,
  p.shop_description_i18n,
  p.shop_hours,
  p.shop_hours_i18n,
  p.shop_hours_schedule,
  CASE WHEN public.vendor_contacts_visible(p.id) AND p.show_whatsapp THEN p.shop_whatsapp ELSE NULL END AS shop_whatsapp,
  CASE WHEN public.vendor_contacts_visible(p.id) AND p.show_phone THEN p.phone ELSE NULL END AS phone,
  CASE WHEN public.vendor_contacts_visible(p.id) AND p.show_email THEN p.email ELSE NULL END AS email,
  CASE WHEN public.vendor_contacts_visible(p.id) AND p.show_address THEN p.address ELSE NULL END AS address,
  CASE WHEN public.vendor_contacts_visible(p.id) AND p.show_address THEN p.latitude ELSE NULL END AS latitude,
  CASE WHEN public.vendor_contacts_visible(p.id) AND p.show_address THEN p.longitude ELSE NULL END AS longitude,
  p.contact_mode,
  p.vendor_mode
FROM public.profiles p
WHERE public.vendor_publicly_visible(p.id);

GRANT SELECT ON public.public_vendor_contacts TO anon, authenticated;

-- ============================================================
-- 7) SUPPORT CONVERSATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL DEFAULT 'Nouvelle demande',
  type public.support_conv_type NOT NULL,
  status public.support_conv_status NOT NULL DEFAULT 'new',
  priority public.support_priority NOT NULL DEFAULT 'normal',
  client_id uuid,
  client_email text,
  client_name text,
  vendor_id uuid,
  product_id uuid,
  order_id uuid,
  assigned_admin_id uuid,
  is_commission_protected boolean NOT NULL DEFAULT false,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_preview text,
  unread_count_client int NOT NULL DEFAULT 0,
  unread_count_vendor int NOT NULL DEFAULT 0,
  unread_count_admin int NOT NULL DEFAULT 0,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_client ON public.support_conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_conv_vendor ON public.support_conversations(vendor_id);
CREATE INDEX IF NOT EXISTS idx_conv_assigned ON public.support_conversations(assigned_admin_id);
CREATE INDEX IF NOT EXISTS idx_conv_status ON public.support_conversations(status);

ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conv_admin_all ON public.support_conversations;
CREATE POLICY conv_admin_all ON public.support_conversations FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS conv_client_read ON public.support_conversations;
CREATE POLICY conv_client_read ON public.support_conversations FOR SELECT
  USING (auth.uid() = client_id);

DROP POLICY IF EXISTS conv_vendor_read ON public.support_conversations;
CREATE POLICY conv_vendor_read ON public.support_conversations FOR SELECT
  USING (
    auth.uid() = vendor_id
    AND NOT is_commission_protected
    AND type <> 'client_support'
  );

DROP POLICY IF EXISTS conv_client_insert ON public.support_conversations;
CREATE POLICY conv_client_insert ON public.support_conversations FOR INSERT
  WITH CHECK (auth.uid() = client_id);

DROP POLICY IF EXISTS conv_client_update ON public.support_conversations;
CREATE POLICY conv_client_update ON public.support_conversations FOR UPDATE
  USING (auth.uid() = client_id);

DROP TRIGGER IF EXISTS tg_conv_updated ON public.support_conversations;
CREATE TRIGGER tg_conv_updated BEFORE UPDATE ON public.support_conversations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- 8) SUPPORT MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  sender_id uuid,
  sender_role public.support_sender_role NOT NULL,
  body text NOT NULL,
  is_internal_note boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msg_conv ON public.support_messages(conversation_id, created_at);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS msg_admin_all ON public.support_messages;
CREATE POLICY msg_admin_all ON public.support_messages FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS msg_participants_read ON public.support_messages;
CREATE POLICY msg_participants_read ON public.support_messages FOR SELECT
  USING (
    NOT is_internal_note AND EXISTS (
      SELECT 1 FROM public.support_conversations c
      WHERE c.id = conversation_id
        AND (
          c.client_id = auth.uid()
          OR (c.vendor_id = auth.uid() AND NOT c.is_commission_protected AND c.type <> 'client_support')
        )
    )
  );

DROP POLICY IF EXISTS msg_participants_insert ON public.support_messages;
CREATE POLICY msg_participants_insert ON public.support_messages FOR INSERT
  WITH CHECK (
    NOT is_internal_note
    AND sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_conversations c
      WHERE c.id = conversation_id
        AND (
          c.client_id = auth.uid()
          OR (c.vendor_id = auth.uid() AND NOT c.is_commission_protected AND c.type <> 'client_support')
        )
    )
  );

-- ============================================================
-- 9) TRIGGERS: update conversation on new message + notifications
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_support_message_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.support_conversations;
  admin_user record;
BEGIN
  SELECT * INTO c FROM public.support_conversations WHERE id = NEW.conversation_id;

  UPDATE public.support_conversations
  SET last_message_at = NEW.created_at,
      last_message_preview = LEFT(NEW.body, 200),
      status = CASE
        WHEN NEW.sender_role = 'client' THEN 'new'::support_conv_status
        WHEN NEW.sender_role IN ('admin','vendor') THEN 'answered'::support_conv_status
        ELSE status
      END,
      unread_count_client = CASE WHEN NEW.sender_role IN ('admin','vendor','system') THEN unread_count_client + 1 ELSE unread_count_client END,
      unread_count_vendor = CASE WHEN NEW.sender_role IN ('admin','client','system') AND vendor_id IS NOT NULL AND NOT is_commission_protected THEN unread_count_vendor + 1 ELSE unread_count_vendor END,
      unread_count_admin  = CASE WHEN NEW.sender_role IN ('client','vendor') THEN unread_count_admin + 1 ELSE unread_count_admin END
  WHERE id = NEW.conversation_id;

  IF NOT NEW.is_internal_note THEN
    -- Notify client
    IF NEW.sender_role IN ('admin','vendor') AND c.client_id IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, title, message, link)
      VALUES (c.client_id, '💬 Nouvelle réponse', LEFT(NEW.body, 140), '/messages/' || c.id);
    END IF;

    -- Notify vendor
    IF NEW.sender_role IN ('admin','client') AND c.vendor_id IS NOT NULL AND NOT c.is_commission_protected AND c.type <> 'client_support' THEN
      INSERT INTO public.notifications(user_id, title, message, link)
      VALUES (c.vendor_id, '💬 Nouveau message client', LEFT(NEW.body, 140), '/vendor/messages');
    END IF;

    -- Notify admins
    IF NEW.sender_role IN ('client','vendor') THEN
      FOR admin_user IN
        SELECT DISTINCT user_id FROM public.user_roles
        WHERE role IN ('admin'::app_role, 'super_admin'::app_role) AND is_suspended = false
      LOOP
        INSERT INTO public.notifications(user_id, title, message, link)
        VALUES (admin_user.user_id, '💬 Nouveau ticket support', LEFT(NEW.body, 140), '/admin/support/' || c.id);
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_support_message_ai ON public.support_messages;
CREATE TRIGGER tg_support_message_ai AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_support_message_after_insert();
