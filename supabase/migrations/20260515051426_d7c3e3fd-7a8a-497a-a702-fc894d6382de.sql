
UPDATE public.profiles SET vendor_mode = 'no_commission'::vendor_mode
WHERE vendor_mode::text IN ('autonomous', 'partially_managed');

DROP TRIGGER IF EXISTS profiles_sync_hide_contact_trg ON public.profiles;

ALTER TYPE public.vendor_mode RENAME TO vendor_mode_old;
CREATE TYPE public.vendor_mode AS ENUM ('no_commission', 'commission');

ALTER TABLE public.profiles
  ALTER COLUMN vendor_mode DROP DEFAULT,
  ALTER COLUMN vendor_mode TYPE public.vendor_mode USING vendor_mode::text::public.vendor_mode,
  ALTER COLUMN vendor_mode SET DEFAULT 'no_commission'::public.vendor_mode;

DROP FUNCTION IF EXISTS public.sync_hide_contact_on_mode() CASCADE;

CREATE OR REPLACE FUNCTION public.sync_hide_contact_on_mode()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.vendor_mode = 'commission'::public.vendor_mode THEN
    NEW.hide_contact_publicly := true;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER profiles_sync_hide_contact_trg
  BEFORE INSERT OR UPDATE OF vendor_mode ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_hide_contact_on_mode();

-- resolve_commission references vendor_mode; recreate to use new enum
CREATE OR REPLACE FUNCTION public.resolve_commission(_product_id uuid)
 RETURNS TABLE(rate numeric, rule_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT id, rate_percent INTO v_rule_id, v_rate
  FROM public.commission_rules
  WHERE scope='product' AND product_id = _product_id AND is_enabled
  LIMIT 1;
  IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;

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

  SELECT id, rate_percent INTO v_rule_id, v_rate
  FROM public.commission_rules
  WHERE scope='vendor' AND vendor_id = v_vendor_id AND category_id IS NULL AND product_id IS NULL AND is_enabled
  LIMIT 1;
  IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;

  SELECT id, rate_percent INTO v_rule_id, v_rate
  FROM public.commission_rules
  WHERE scope='global' AND is_enabled
  LIMIT 1;
  IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;

  RETURN QUERY SELECT 0::numeric, NULL::uuid;
END $function$;

DROP TYPE public.vendor_mode_old;
