
-- Vendor mode enum
DO $$ BEGIN
  CREATE TYPE public.vendor_mode AS ENUM ('no_commission','commission','autonomous','partially_managed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add commissions permission to admin_permission enum
ALTER TYPE public.admin_permission ADD VALUE IF NOT EXISTS 'commissions';

-- profiles: vendor_mode + hide_contact_publicly
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vendor_mode public.vendor_mode NOT NULL DEFAULT 'no_commission',
  ADD COLUMN IF NOT EXISTS hide_contact_publicly boolean NOT NULL DEFAULT false;

-- commission_rules
CREATE TABLE IF NOT EXISTS public.commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global','vendor','category','product')),
  vendor_id uuid,
  category_id uuid,
  product_id uuid,
  rate_percent numeric(5,2) NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS commission_rules_global_uniq
  ON public.commission_rules ((1)) WHERE scope = 'global';
CREATE UNIQUE INDEX IF NOT EXISTS commission_rules_vendor_uniq
  ON public.commission_rules (vendor_id) WHERE scope = 'vendor' AND category_id IS NULL AND product_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS commission_rules_category_uniq
  ON public.commission_rules (category_id, COALESCE(vendor_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE scope = 'category';
CREATE UNIQUE INDEX IF NOT EXISTS commission_rules_product_uniq
  ON public.commission_rules (product_id) WHERE scope = 'product';

CREATE INDEX IF NOT EXISTS commission_rules_lookup_vendor ON public.commission_rules(vendor_id) WHERE is_enabled;
CREATE INDEX IF NOT EXISTS commission_rules_lookup_category ON public.commission_rules(category_id) WHERE is_enabled;
CREATE INDEX IF NOT EXISTS commission_rules_lookup_product ON public.commission_rules(product_id) WHERE is_enabled;

ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commission_rules_super_all ON public.commission_rules;
CREATE POLICY commission_rules_super_all ON public.commission_rules
  FOR ALL USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- commission_rule_history
CREATE TABLE IF NOT EXISTS public.commission_rule_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid,
  action text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  actor_id uuid,
  actor_email text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.commission_rule_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commission_history_super_read ON public.commission_rule_history;
CREATE POLICY commission_history_super_read ON public.commission_rule_history
  FOR SELECT USING (public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS commission_history_super_insert ON public.commission_rule_history;
CREATE POLICY commission_history_super_insert ON public.commission_rule_history
  FOR INSERT WITH CHECK (public.is_super_admin(auth.uid()));

-- Trigger to log changes
CREATE OR REPLACE FUNCTION public.log_commission_rule_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor_email_val text;
BEGIN
  SELECT email INTO actor_email_val FROM auth.users WHERE id = auth.uid();
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.commission_rule_history(rule_id, action, new_value, actor_id, actor_email)
    VALUES (NEW.id, 'create', to_jsonb(NEW), auth.uid(), actor_email_val);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.commission_rule_history(rule_id, action, old_value, new_value, actor_id, actor_email)
    VALUES (NEW.id, 'update', to_jsonb(OLD), to_jsonb(NEW), auth.uid(), actor_email_val);
    NEW.updated_at = now();
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.commission_rule_history(rule_id, action, old_value, actor_id, actor_email)
    VALUES (OLD.id, 'delete', to_jsonb(OLD), auth.uid(), actor_email_val);
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS commission_rules_history_trg ON public.commission_rules;
CREATE TRIGGER commission_rules_history_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.commission_rules
  FOR EACH ROW EXECUTE FUNCTION public.log_commission_rule_change();

-- order_items commission columns
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS commission_rate numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_rule_id uuid;

-- Function: resolve commission rate for a product
CREATE OR REPLACE FUNCTION public.resolve_commission(_product_id uuid)
RETURNS TABLE(rate numeric, rule_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_vendor_id uuid;
  v_category_id uuid;
  v_mode public.vendor_mode;
  v_rule_id uuid;
  v_rate numeric;
  cur_cat uuid;
BEGIN
  SELECT p.vendor_id, p.category_id INTO v_vendor_id, v_category_id
  FROM public.products p WHERE p.id = _product_id;
  IF v_vendor_id IS NULL THEN RETURN QUERY SELECT 0::numeric, NULL::uuid; RETURN; END IF;

  SELECT pr.vendor_mode INTO v_mode FROM public.profiles pr WHERE pr.id = v_vendor_id;
  IF v_mode = 'no_commission' OR v_mode IS NULL THEN
    RETURN QUERY SELECT 0::numeric, NULL::uuid; RETURN;
  END IF;

  -- 1. product-specific
  SELECT id, rate_percent INTO v_rule_id, v_rate
  FROM public.commission_rules
  WHERE scope='product' AND product_id = _product_id AND is_enabled
  LIMIT 1;
  IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;

  -- 2. category tree (deepest first), with vendor exception preferred
  cur_cat := v_category_id;
  WHILE cur_cat IS NOT NULL LOOP
    SELECT id, rate_percent INTO v_rule_id, v_rate
    FROM public.commission_rules
    WHERE scope='category' AND category_id = cur_cat AND is_enabled
      AND (vendor_id = v_vendor_id OR vendor_id IS NULL)
    ORDER BY (vendor_id = v_vendor_id) DESC
    LIMIT 1;
    IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;
    SELECT parent_id INTO cur_cat FROM public.categories WHERE id = cur_cat;
  END LOOP;

  -- 3. vendor
  SELECT id, rate_percent INTO v_rule_id, v_rate
  FROM public.commission_rules
  WHERE scope='vendor' AND vendor_id = v_vendor_id AND category_id IS NULL AND product_id IS NULL AND is_enabled
  LIMIT 1;
  IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;

  -- 4. global
  SELECT id, rate_percent INTO v_rule_id, v_rate
  FROM public.commission_rules
  WHERE scope='global' AND is_enabled
  LIMIT 1;
  IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;

  RETURN QUERY SELECT 0::numeric, NULL::uuid;
END $$;

-- Trigger on order_items insert: freeze commission
CREATE OR REPLACE FUNCTION public.set_order_item_commission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.resolve_commission(NEW.product_id);
  NEW.commission_rate := COALESCE(r.rate, 0);
  NEW.commission_amount := ROUND(COALESCE(NEW.unit_price,0) * NEW.quantity * COALESCE(r.rate,0) / 100, 2);
  NEW.commission_rule_id := r.rule_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS order_items_set_commission_trg ON public.order_items;
CREATE TRIGGER order_items_set_commission_trg
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_order_item_commission();

-- Prevent commission edits after insert
CREATE OR REPLACE FUNCTION public.protect_order_item_commission()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.commission_rate IS DISTINCT FROM OLD.commission_rate
     OR NEW.commission_amount IS DISTINCT FROM OLD.commission_amount
     OR NEW.commission_rule_id IS DISTINCT FROM OLD.commission_rule_id THEN
    IF NOT public.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Commission fields are immutable';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS order_items_protect_commission_trg ON public.order_items;
CREATE TRIGGER order_items_protect_commission_trg
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.protect_order_item_commission();

-- Auto-set hide_contact_publicly when vendor enters commission mode
CREATE OR REPLACE FUNCTION public.sync_hide_contact_on_mode()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.vendor_mode = 'commission' THEN
    NEW.hide_contact_publicly := true;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_sync_hide_contact_trg ON public.profiles;
CREATE TRIGGER profiles_sync_hide_contact_trg
  BEFORE INSERT OR UPDATE OF vendor_mode ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_hide_contact_on_mode();
