
CREATE TABLE IF NOT EXISTS public.countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  flag_emoji text,
  is_enabled boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

CREATE POLICY countries_public_read ON public.countries FOR SELECT USING (true);
CREATE POLICY countries_admin_write ON public.countries
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER countries_set_updated_at
  BEFORE UPDATE ON public.countries
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.countries (code, name, name_i18n, flag_emoji, position) VALUES
  ('SN', 'Sénégal', '{"fr":"Sénégal","en":"Senegal","ar":"السنغال"}'::jsonb, '🇸🇳', 1),
  ('FR', 'France', '{"fr":"France","en":"France","ar":"فرنسا"}'::jsonb, '🇫🇷', 2),
  ('LB', 'Liban', '{"fr":"Liban","en":"Lebanon","ar":"لبنان"}'::jsonb, '🇱🇧', 3),
  ('CN', 'Chine', '{"fr":"Chine","en":"China","ar":"الصين"}'::jsonb, '🇨🇳', 4),
  ('MR', 'Mauritanie', '{"fr":"Mauritanie","en":"Mauritania","ar":"موريتانيا"}'::jsonb, '🇲🇷', 5),
  ('CI', 'Côte d''Ivoire', '{"fr":"Côte d''Ivoire","en":"Ivory Coast","ar":"ساحل العاج"}'::jsonb, '🇨🇮', 6),
  ('MA', 'Maroc', '{"fr":"Maroc","en":"Morocco","ar":"المغرب"}'::jsonb, '🇲🇦', 7),
  ('TR', 'Turquie', '{"fr":"Turquie","en":"Turkey","ar":"تركيا"}'::jsonb, '🇹🇷', 8),
  ('AE', 'Émirats arabes unis', '{"fr":"Émirats arabes unis","en":"UAE","ar":"الإمارات"}'::jsonb, '🇦🇪', 9),
  ('US', 'États-Unis', '{"fr":"États-Unis","en":"United States","ar":"الولايات المتحدة"}'::jsonb, '🇺🇸', 10)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS source_country_id uuid REFERENCES public.countries(id) ON DELETE SET NULL;
ALTER TABLE public.customer_addresses
  ADD COLUMN IF NOT EXISTS destination_country_id uuid REFERENCES public.countries(id) ON DELETE SET NULL;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS destination_country_id uuid REFERENCES public.countries(id) ON DELETE SET NULL;
ALTER TABLE public.commission_rules
  ADD COLUMN IF NOT EXISTS source_country_id uuid REFERENCES public.countries(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS destination_country_id uuid REFERENCES public.countries(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_commission_rules_countries
  ON public.commission_rules (destination_country_id, source_country_id, scope);
CREATE INDEX IF NOT EXISTS idx_commission_rules_scope ON public.commission_rules (scope);
CREATE INDEX IF NOT EXISTS idx_profiles_source_country ON public.profiles (source_country_id);
CREATE INDEX IF NOT EXISTS idx_orders_destination_country ON public.orders (destination_country_id);

CREATE OR REPLACE FUNCTION public.resolve_commission(
  _product_id uuid,
  _destination_country_id uuid DEFAULT NULL
)
RETURNS TABLE(rate numeric, rule_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_vendor_id uuid;
  v_category_id uuid;
  v_source_country_id uuid;
  v_mode public.vendor_mode;
  v_rule_id uuid;
  v_rate numeric;
  cur_cat uuid;
BEGIN
  SELECT p.vendor_id, p.category_id INTO v_vendor_id, v_category_id
  FROM public.products p WHERE p.id = _product_id;
  IF v_vendor_id IS NULL THEN RETURN QUERY SELECT 0::numeric, NULL::uuid; RETURN; END IF;

  SELECT pr.vendor_mode, pr.source_country_id INTO v_mode, v_source_country_id
  FROM public.profiles pr WHERE pr.id = v_vendor_id;

  IF v_mode = 'no_commission' OR v_mode IS NULL THEN
    RETURN QUERY SELECT 0::numeric, NULL::uuid; RETURN;
  END IF;

  SELECT id, rate_percent INTO v_rule_id, v_rate
  FROM public.commission_rules
  WHERE scope='product' AND product_id = _product_id AND is_enabled
    AND (vendor_id = v_vendor_id OR vendor_id IS NULL)
  ORDER BY (vendor_id = v_vendor_id) DESC
  LIMIT 1;
  IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;

  cur_cat := v_category_id;
  WHILE cur_cat IS NOT NULL LOOP
    SELECT id, rate_percent INTO v_rule_id, v_rate
    FROM public.commission_rules
    WHERE scope='category' AND category_id = cur_cat AND is_enabled
      AND source_country_id = v_source_country_id
      AND destination_country_id = _destination_country_id
      AND (vendor_id = v_vendor_id OR vendor_id IS NULL)
    ORDER BY (vendor_id = v_vendor_id) DESC LIMIT 1;
    IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;

    SELECT id, rate_percent INTO v_rule_id, v_rate
    FROM public.commission_rules
    WHERE scope='category' AND category_id = cur_cat AND is_enabled
      AND source_country_id IS NULL
      AND destination_country_id = _destination_country_id
      AND (vendor_id = v_vendor_id OR vendor_id IS NULL)
    ORDER BY (vendor_id = v_vendor_id) DESC LIMIT 1;
    IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;

    SELECT id, rate_percent INTO v_rule_id, v_rate
    FROM public.commission_rules
    WHERE scope='category' AND category_id = cur_cat AND is_enabled
      AND source_country_id = v_source_country_id
      AND destination_country_id IS NULL
      AND (vendor_id = v_vendor_id OR vendor_id IS NULL)
    ORDER BY (vendor_id = v_vendor_id) DESC LIMIT 1;
    IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;

    SELECT id, rate_percent INTO v_rule_id, v_rate
    FROM public.commission_rules
    WHERE scope='category' AND category_id = cur_cat AND is_enabled
      AND source_country_id IS NULL
      AND destination_country_id IS NULL
      AND (vendor_id = v_vendor_id OR vendor_id IS NULL)
    ORDER BY (vendor_id = v_vendor_id) DESC LIMIT 1;
    IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;

    SELECT parent_id INTO cur_cat FROM public.categories WHERE id = cur_cat;
  END LOOP;

  SELECT id, rate_percent INTO v_rule_id, v_rate
  FROM public.commission_rules
  WHERE scope='vendor' AND vendor_id = v_vendor_id
    AND category_id IS NULL AND product_id IS NULL AND is_enabled
  LIMIT 1;
  IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;

  IF v_source_country_id IS NOT NULL AND _destination_country_id IS NOT NULL THEN
    SELECT id, rate_percent INTO v_rule_id, v_rate
    FROM public.commission_rules
    WHERE scope='country_pair' AND is_enabled
      AND source_country_id = v_source_country_id
      AND destination_country_id = _destination_country_id
    LIMIT 1;
    IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;
  END IF;

  IF _destination_country_id IS NOT NULL THEN
    SELECT id, rate_percent INTO v_rule_id, v_rate
    FROM public.commission_rules
    WHERE scope='country_pair' AND is_enabled
      AND source_country_id IS NULL
      AND destination_country_id = _destination_country_id
    LIMIT 1;
    IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;
  END IF;

  IF v_source_country_id IS NOT NULL THEN
    SELECT id, rate_percent INTO v_rule_id, v_rate
    FROM public.commission_rules
    WHERE scope='country_pair' AND is_enabled
      AND source_country_id = v_source_country_id
      AND destination_country_id IS NULL
    LIMIT 1;
    IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;
  END IF;

  SELECT id, rate_percent INTO v_rule_id, v_rate
  FROM public.commission_rules WHERE scope='global' AND is_enabled LIMIT 1;
  IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;

  RETURN QUERY SELECT 0::numeric, NULL::uuid;
END $function$;

CREATE OR REPLACE FUNCTION public.resolve_commission(_product_id uuid)
RETURNS TABLE(rate numeric, rule_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT rate, rule_id FROM public.resolve_commission(_product_id, NULL::uuid);
$$;

CREATE OR REPLACE FUNCTION public.set_order_item_commission()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_dest uuid;
BEGIN
  SELECT destination_country_id INTO v_dest FROM public.orders WHERE id = NEW.order_id;
  SELECT * INTO r FROM public.resolve_commission(NEW.product_id, v_dest);
  NEW.commission_rate := COALESCE(r.rate, 0);
  NEW.commission_amount := ROUND(COALESCE(NEW.unit_price,0) * NEW.quantity * COALESCE(r.rate,0) / 100, 2);
  NEW.commission_rule_id := r.rule_id;
  RETURN NEW;
END $function$;
