
-- ════════════════════════════════════════════════════════════════════
-- SAV unifié — Fondation
-- ════════════════════════════════════════════════════════════════════

-- ─── ENUMS ───────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.sav_case_type AS ENUM (
    'cancellation','return','exchange','warranty','dispute',
    'refund','credit_note','admin_exception','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sav_scope AS ENUM ('item','order');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sav_resolution AS ENUM (
    'refund','exchange','repair','credit','replacement','partial_refund','none'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sav_party AS ENUM ('client','vendor','admin','system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sav_vendor_recommendation AS ENUM (
    'accept','refuse','propose_refund','propose_exchange','propose_other','none'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sav_admin_decision AS ENUM (
    'pending','accepted','refused','partially_accepted','escalated','overridden'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sav_rule_scope AS ENUM ('global','country','category','shop','product');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sav_rule_key AS ENUM (
    'returns_enabled','exchanges_enabled','warranty_enabled',
    'return_window_days','warranty_months','requires_evidence',
    'auto_accept_under_amount','refund_method_default','shipping_cost_attribution',
    'restocking_fee_percent','return_address_id'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sav_refund_method AS ENUM (
    'wave','orange_money','cash','bank_transfer','credit_note','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sav_refund_direction AS ENUM ('to_client','from_vendor','from_kawzone');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sav_refund_status AS ENUM ('pending','issued','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sav_exchange_status AS ENUM ('proposed','accepted','shipped','delivered','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sav_action_type AS ENUM (
    'open','client_response','vendor_recommend','admin_decide','admin_override',
    'escalate','close','reopen','refund_issued','exchange_proposed','exchange_shipped',
    'attachment_added','message_added','sla_breached','rule_applied','assignment_changed','status_changed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Étendre sav_status (sans utiliser les valeurs dans la même tx)
DO $$ BEGIN ALTER TYPE public.sav_status ADD VALUE IF NOT EXISTS 'draft'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE public.sav_status ADD VALUE IF NOT EXISTS 'in_review'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE public.sav_status ADD VALUE IF NOT EXISTS 'vendor_responded'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE public.sav_status ADD VALUE IF NOT EXISTS 'in_arbitration'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE public.sav_status ADD VALUE IF NOT EXISTS 'accepted'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE public.sav_status ADD VALUE IF NOT EXISTS 'refused'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE public.sav_status ADD VALUE IF NOT EXISTS 'partially_accepted'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE public.sav_status ADD VALUE IF NOT EXISTS 'in_execution'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE public.sav_status ADD VALUE IF NOT EXISTS 'waiting_client'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE public.sav_status ADD VALUE IF NOT EXISTS 'waiting_vendor'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE public.sav_status ADD VALUE IF NOT EXISTS 'escalated'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE public.sav_status ADD VALUE IF NOT EXISTS 'reopened'; EXCEPTION WHEN others THEN NULL; END $$;

-- ─── EXTENSION sav_cases ─────────────────────────────────────────────
ALTER TABLE public.sav_cases
  ADD COLUMN IF NOT EXISTS case_type public.sav_case_type NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS scope public.sav_scope NOT NULL DEFAULT 'item',
  ADD COLUMN IF NOT EXISTS requested_resolution public.sav_resolution NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS decided_resolution public.sav_resolution,
  ADD COLUMN IF NOT EXISTS requested_by_party public.sav_party NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS vendor_recommendation public.sav_vendor_recommendation NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS vendor_recommendation_note text,
  ADD COLUMN IF NOT EXISTS vendor_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_decision public.sav_admin_decision NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS admin_decision_reason text,
  ADD COLUMN IF NOT EXISTS admin_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_decided_by uuid,
  ADD COLUMN IF NOT EXISTS sla_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS evidence_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rules_snapshot jsonb;

-- ─── sav_attachments ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sav_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.sav_cases(id) ON DELETE CASCADE,
  uploader_id uuid,
  uploader_role public.sav_party NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sav_attachments TO authenticated;
GRANT ALL ON public.sav_attachments TO service_role;
ALTER TABLE public.sav_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sav_attachments admin all" ON public.sav_attachments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE POLICY "sav_attachments client own" ON public.sav_attachments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sav_cases c JOIN public.orders o ON o.id=c.order_id
    WHERE c.id=sav_attachments.case_id AND o.buyer_id=auth.uid() AND c.client_visible=true
  ));

CREATE POLICY "sav_attachments vendor own shop" ON public.sav_attachments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sav_cases c WHERE c.id=sav_attachments.case_id AND c.vendor_id=auth.uid()
  ));

CREATE POLICY "sav_attachments insert own" ON public.sav_attachments
  FOR INSERT TO authenticated
  WITH CHECK (uploader_id = auth.uid());

-- ─── sav_messages ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sav_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.sav_cases(id) ON DELETE CASCADE,
  sender_id uuid,
  sender_role public.sav_party NOT NULL,
  body text NOT NULL,
  is_internal_note boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sav_messages TO authenticated;
GRANT ALL ON public.sav_messages TO service_role;
ALTER TABLE public.sav_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sav_messages admin all" ON public.sav_messages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE POLICY "sav_messages client own" ON public.sav_messages
  FOR SELECT TO authenticated
  USING (is_internal_note = false AND EXISTS (
    SELECT 1 FROM public.sav_cases c JOIN public.orders o ON o.id=c.order_id
    WHERE c.id=sav_messages.case_id AND o.buyer_id=auth.uid() AND c.client_visible=true
  ));

CREATE POLICY "sav_messages vendor own shop" ON public.sav_messages
  FOR SELECT TO authenticated
  USING (is_internal_note = false AND EXISTS (
    SELECT 1 FROM public.sav_cases c WHERE c.id=sav_messages.case_id AND c.vendor_id=auth.uid()
  ));

CREATE POLICY "sav_messages insert own" ON public.sav_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND (is_internal_note = false OR public.has_role(auth.uid(),'admin'::app_role)));

-- ─── sav_actions (append-only) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sav_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.sav_cases(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_role public.sav_party NOT NULL,
  action_type public.sav_action_type NOT NULL,
  from_state jsonb,
  to_state jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sav_actions TO authenticated;
GRANT ALL ON public.sav_actions TO service_role;
ALTER TABLE public.sav_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sav_actions admin select" ON public.sav_actions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE POLICY "sav_actions vendor select own shop" ON public.sav_actions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sav_cases c WHERE c.id=sav_actions.case_id AND c.vendor_id=auth.uid()
  ));

CREATE POLICY "sav_actions client select own" ON public.sav_actions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sav_cases c JOIN public.orders o ON o.id=c.order_id
    WHERE c.id=sav_actions.case_id AND o.buyer_id=auth.uid() AND c.client_visible=true
  ));

CREATE POLICY "sav_actions insert authenticated" ON public.sav_actions
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER sav_actions_append_only_upd
  BEFORE UPDATE ON public.sav_actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_append_only_guard();
CREATE TRIGGER sav_actions_append_only_del
  BEFORE DELETE ON public.sav_actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_append_only_guard();

-- ─── sav_rules ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sav_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope public.sav_rule_scope NOT NULL,
  scope_id uuid,
  rule_key public.sav_rule_key NOT NULL,
  value jsonb NOT NULL,
  priority int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sav_rules_unique_scope_key
  ON public.sav_rules(scope, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), rule_key)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS sav_rules_lookup ON public.sav_rules(scope, scope_id, rule_key) WHERE is_active=true;

GRANT SELECT ON public.sav_rules TO authenticated;
GRANT ALL ON public.sav_rules TO service_role;
ALTER TABLE public.sav_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sav_rules read all auth" ON public.sav_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sav_rules admin write" ON public.sav_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER sav_rules_set_updated_at BEFORE UPDATE ON public.sav_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ─── sav_refunds ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sav_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.sav_cases(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'XOF',
  method public.sav_refund_method NOT NULL,
  direction public.sav_refund_direction NOT NULL,
  status public.sav_refund_status NOT NULL DEFAULT 'pending',
  reference text,
  linked_movement_id uuid REFERENCES public.financial_movements(id),
  issued_by uuid,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sav_refunds TO authenticated;
GRANT ALL ON public.sav_refunds TO service_role;
ALTER TABLE public.sav_refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sav_refunds admin all" ON public.sav_refunds
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE POLICY "sav_refunds client read own" ON public.sav_refunds
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sav_cases c JOIN public.orders o ON o.id=c.order_id
    WHERE c.id=sav_refunds.case_id AND o.buyer_id=auth.uid() AND c.client_visible=true
  ));

CREATE POLICY "sav_refunds vendor read own shop" ON public.sav_refunds
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sav_cases c WHERE c.id=sav_refunds.case_id AND c.vendor_id=auth.uid()
  ));

CREATE TRIGGER sav_refunds_set_updated_at BEFORE UPDATE ON public.sav_refunds
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ─── sav_exchanges ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sav_exchanges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.sav_cases(id) ON DELETE CASCADE,
  original_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  replacement_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  replacement_variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  replacement_quantity int NOT NULL DEFAULT 1 CHECK (replacement_quantity > 0),
  delta_amount numeric NOT NULL DEFAULT 0,
  delta_currency text NOT NULL DEFAULT 'XOF',
  replacement_order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  status public.sav_exchange_status NOT NULL DEFAULT 'proposed',
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sav_exchanges TO authenticated;
GRANT ALL ON public.sav_exchanges TO service_role;
ALTER TABLE public.sav_exchanges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sav_exchanges admin all" ON public.sav_exchanges
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE POLICY "sav_exchanges client read own" ON public.sav_exchanges
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sav_cases c JOIN public.orders o ON o.id=c.order_id
    WHERE c.id=sav_exchanges.case_id AND o.buyer_id=auth.uid() AND c.client_visible=true
  ));

CREATE POLICY "sav_exchanges vendor read own shop" ON public.sav_exchanges
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sav_cases c WHERE c.id=sav_exchanges.case_id AND c.vendor_id=auth.uid()
  ));

CREATE TRIGGER sav_exchanges_set_updated_at BEFORE UPDATE ON public.sav_exchanges
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ─── Index utiles sur sav_cases ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS sav_cases_case_type_idx ON public.sav_cases(case_type);
CREATE INDEX IF NOT EXISTS sav_cases_admin_decision_idx ON public.sav_cases(admin_decision);
CREATE INDEX IF NOT EXISTS sav_cases_sla_idx ON public.sav_cases(sla_deadline_at);

-- ─── Fonction resolve_sav_rules ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_sav_rules(
  _product_id uuid DEFAULT NULL,
  _destination_country_id uuid DEFAULT NULL,
  _shop_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_id uuid;
  v_source_country_id uuid;
  v_cat_ids uuid[] := ARRAY[]::uuid[];
  cur_cat uuid;
  v_result jsonb := '{}'::jsonb;
  v_key public.sav_rule_key;
  v_value jsonb;
  v_defaults jsonb := jsonb_build_object(
    'returns_enabled', 'true'::jsonb,
    'exchanges_enabled', 'true'::jsonb,
    'warranty_enabled', 'false'::jsonb,
    'return_window_days', '7'::jsonb,
    'warranty_months', '0'::jsonb,
    'requires_evidence', 'true'::jsonb,
    'auto_accept_under_amount', '0'::jsonb,
    'shipping_cost_attribution', '"client"'::jsonb,
    'refund_method_default', '"wave"'::jsonb,
    'restocking_fee_percent', '0'::jsonb
  );
BEGIN
  IF _product_id IS NOT NULL THEN
    SELECT category_id, vendor_id INTO v_category_id, _shop_id
    FROM public.products WHERE id = _product_id;
  END IF;

  cur_cat := v_category_id;
  WHILE cur_cat IS NOT NULL LOOP
    v_cat_ids := v_cat_ids || cur_cat;
    SELECT parent_id INTO cur_cat FROM public.categories WHERE id = cur_cat;
  END LOOP;

  IF _shop_id IS NOT NULL THEN
    SELECT source_country_id INTO v_source_country_id
    FROM public.profiles WHERE id = _shop_id;
  END IF;

  FOR v_key IN SELECT unnest(enum_range(NULL::public.sav_rule_key)) LOOP
    v_value := NULL;

    IF _product_id IS NOT NULL THEN
      SELECT value INTO v_value FROM public.sav_rules
      WHERE is_active AND rule_key=v_key AND scope='product' AND scope_id=_product_id
      ORDER BY priority DESC, updated_at DESC LIMIT 1;
    END IF;

    IF v_value IS NULL AND array_length(v_cat_ids,1) > 0 THEN
      SELECT r.value INTO v_value
      FROM public.sav_rules r
      JOIN unnest(v_cat_ids) WITH ORDINALITY u(cat_id, depth) ON u.cat_id = r.scope_id
      WHERE r.is_active AND r.rule_key=v_key AND r.scope='category'
      ORDER BY u.depth ASC, r.priority DESC, r.updated_at DESC LIMIT 1;
    END IF;

    IF v_value IS NULL AND _shop_id IS NOT NULL THEN
      SELECT value INTO v_value FROM public.sav_rules
      WHERE is_active AND rule_key=v_key AND scope='shop' AND scope_id=_shop_id
      ORDER BY priority DESC, updated_at DESC LIMIT 1;
    END IF;

    IF v_value IS NULL AND _destination_country_id IS NOT NULL THEN
      SELECT value INTO v_value FROM public.sav_rules
      WHERE is_active AND rule_key=v_key AND scope='country' AND scope_id=_destination_country_id
      ORDER BY priority DESC, updated_at DESC LIMIT 1;
    END IF;
    IF v_value IS NULL AND v_source_country_id IS NOT NULL THEN
      SELECT value INTO v_value FROM public.sav_rules
      WHERE is_active AND rule_key=v_key AND scope='country' AND scope_id=v_source_country_id
      ORDER BY priority DESC, updated_at DESC LIMIT 1;
    END IF;

    IF v_value IS NULL THEN
      SELECT value INTO v_value FROM public.sav_rules
      WHERE is_active AND rule_key=v_key AND scope='global'
      ORDER BY priority DESC, updated_at DESC LIMIT 1;
    END IF;

    IF v_value IS NULL THEN
      v_value := v_defaults->(v_key::text);
    END IF;

    IF v_value IS NOT NULL THEN
      v_result := v_result || jsonb_build_object(v_key::text, v_value);
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

-- ─── Triggers compteurs / activity ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_sav_refresh_evidence_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    UPDATE public.sav_cases SET evidence_count = evidence_count + 1, last_activity_at = now()
      WHERE id = NEW.case_id;
    RETURN NEW;
  ELSIF TG_OP='DELETE' THEN
    UPDATE public.sav_cases SET evidence_count = GREATEST(evidence_count - 1, 0)
      WHERE id = OLD.case_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER sav_attachments_refresh_count
  AFTER INSERT OR DELETE ON public.sav_attachments
  FOR EACH ROW EXECUTE FUNCTION public.tg_sav_refresh_evidence_count();

CREATE OR REPLACE FUNCTION public.tg_sav_bump_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.sav_cases SET last_activity_at = now() WHERE id = NEW.case_id;
  RETURN NEW;
END $$;
CREATE TRIGGER sav_messages_bump_activity AFTER INSERT ON public.sav_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_sav_bump_activity();
CREATE TRIGGER sav_actions_bump_activity AFTER INSERT ON public.sav_actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_sav_bump_activity();

-- ─── Seed des règles globales par défaut ─────────────────────────────
INSERT INTO public.sav_rules(scope, scope_id, rule_key, value, priority, is_active, note)
VALUES
  ('global', NULL, 'returns_enabled',          'true'::jsonb,   0, true, 'Défaut global'),
  ('global', NULL, 'exchanges_enabled',        'true'::jsonb,   0, true, 'Défaut global'),
  ('global', NULL, 'warranty_enabled',         'false'::jsonb,  0, true, 'Défaut global'),
  ('global', NULL, 'return_window_days',       '7'::jsonb,      0, true, 'Fenêtre retour par défaut'),
  ('global', NULL, 'warranty_months',          '0'::jsonb,      0, true, 'Garantie par défaut'),
  ('global', NULL, 'requires_evidence',        'true'::jsonb,   0, true, 'Photo obligatoire'),
  ('global', NULL, 'auto_accept_under_amount', '0'::jsonb,      0, true, 'Auto-accept désactivé par défaut'),
  ('global', NULL, 'shipping_cost_attribution','"client"'::jsonb,0, true, 'Frais retour à la charge du client par défaut'),
  ('global', NULL, 'refund_method_default',    '"wave"'::jsonb, 0, true, 'Mode remboursement par défaut'),
  ('global', NULL, 'restocking_fee_percent',   '0'::jsonb,      0, true, 'Pas de frais de réassort par défaut')
ON CONFLICT DO NOTHING;
