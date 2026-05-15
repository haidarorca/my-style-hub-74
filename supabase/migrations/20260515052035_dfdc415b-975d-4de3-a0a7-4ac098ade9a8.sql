
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

  -- 1. product-specific (vendor exception preferred over global product rule)
  SELECT id, rate_percent INTO v_rule_id, v_rate
  FROM public.commission_rules
  WHERE scope='product' AND product_id = _product_id AND is_enabled
    AND (vendor_id = v_vendor_id OR vendor_id IS NULL)
  ORDER BY (vendor_id = v_vendor_id) DESC
  LIMIT 1;
  IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;

  -- 2. category tree (deepest first, vendor exception preferred at each level)
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
END $function$;
