CREATE OR REPLACE FUNCTION public.resolve_commission(_product_id uuid, _destination_country_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(rate numeric, rule_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vendor_id uuid;
  v_category_id uuid;
  v_source_country_id uuid;
  v_mode public.vendor_mode;
  v_rule_id uuid;
  v_rate numeric;
  v_cat_ids uuid[];
  cur_cat uuid;
BEGIN
  SELECT p.vendor_id, p.category_id
  INTO v_vendor_id, v_category_id
  FROM public.products p
  WHERE p.id = _product_id;

  IF v_vendor_id IS NULL THEN
    RETURN QUERY SELECT 0::numeric, NULL::uuid; RETURN;
  END IF;

  SELECT pr.vendor_mode, pr.source_country_id
  INTO v_mode, v_source_country_id
  FROM public.profiles pr
  WHERE pr.id = v_vendor_id;

  IF v_mode IS DISTINCT FROM 'commission'::public.vendor_mode THEN
    RETURN QUERY SELECT 0::numeric, NULL::uuid; RETURN;
  END IF;

  -- 1) Produit
  SELECT cr.id, cr.rate_percent INTO v_rule_id, v_rate
  FROM public.commission_rules cr
  WHERE cr.scope = 'product' AND cr.product_id = _product_id AND cr.is_enabled
    AND (cr.vendor_id = v_vendor_id OR cr.vendor_id IS NULL)
    AND (cr.source_country_id IS NULL OR (v_source_country_id IS NOT NULL AND cr.source_country_id = v_source_country_id))
    AND (cr.destination_country_id IS NULL OR (_destination_country_id IS NOT NULL AND cr.destination_country_id = _destination_country_id))
  ORDER BY (cr.vendor_id = v_vendor_id) DESC,
           (cr.source_country_id IS NOT NULL AND cr.destination_country_id IS NOT NULL) DESC,
           (cr.destination_country_id IS NOT NULL) DESC,
           (cr.source_country_id IS NOT NULL) DESC,
           cr.updated_at DESC, cr.created_at DESC, cr.id DESC
  LIMIT 1;
  IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;

  -- 2) Catégorie : construire la chaîne d'ancêtres (proche -> lointain),
  --    puis choisir la règle la plus spécifique côté pays sur TOUTE la chaîne,
  --    en cas d'égalité de spécificité prendre la catégorie la plus proche.
  v_cat_ids := ARRAY[]::uuid[];
  cur_cat := v_category_id;
  WHILE cur_cat IS NOT NULL LOOP
    v_cat_ids := v_cat_ids || cur_cat;
    SELECT c.parent_id INTO cur_cat FROM public.categories c WHERE c.id = cur_cat;
  END LOOP;

  IF array_length(v_cat_ids, 1) > 0 THEN
    SELECT cr.id, cr.rate_percent INTO v_rule_id, v_rate
    FROM public.commission_rules cr
    JOIN unnest(v_cat_ids) WITH ORDINALITY AS u(cat_id, depth) ON u.cat_id = cr.category_id
    WHERE cr.scope = 'category' AND cr.is_enabled
      AND (cr.vendor_id = v_vendor_id OR cr.vendor_id IS NULL)
      AND (cr.source_country_id IS NULL OR (v_source_country_id IS NOT NULL AND cr.source_country_id = v_source_country_id))
      AND (cr.destination_country_id IS NULL OR (_destination_country_id IS NOT NULL AND cr.destination_country_id = _destination_country_id))
    ORDER BY (cr.vendor_id = v_vendor_id) DESC,
             (cr.source_country_id IS NOT NULL AND cr.destination_country_id IS NOT NULL) DESC,
             (cr.destination_country_id IS NOT NULL) DESC,
             (cr.source_country_id IS NOT NULL) DESC,
             u.depth ASC,
             cr.updated_at DESC, cr.created_at DESC, cr.id DESC
    LIMIT 1;
    IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;
  END IF;

  -- 3) Paire pays exacte
  IF v_source_country_id IS NOT NULL AND _destination_country_id IS NOT NULL THEN
    SELECT cr.id, cr.rate_percent INTO v_rule_id, v_rate
    FROM public.commission_rules cr
    WHERE cr.scope = 'country_pair' AND cr.is_enabled
      AND cr.vendor_id IS NULL AND cr.category_id IS NULL AND cr.product_id IS NULL
      AND cr.source_country_id = v_source_country_id
      AND cr.destination_country_id = _destination_country_id
    ORDER BY cr.updated_at DESC, cr.created_at DESC, cr.id DESC
    LIMIT 1;
    IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;
  END IF;

  -- 4) Règle vendeur
  SELECT cr.id, cr.rate_percent INTO v_rule_id, v_rate
  FROM public.commission_rules cr
  WHERE cr.scope = 'vendor' AND cr.vendor_id = v_vendor_id AND cr.is_enabled
    AND cr.category_id IS NULL AND cr.product_id IS NULL
    AND (cr.source_country_id IS NULL OR (v_source_country_id IS NOT NULL AND cr.source_country_id = v_source_country_id))
    AND (cr.destination_country_id IS NULL OR (_destination_country_id IS NOT NULL AND cr.destination_country_id = _destination_country_id))
  ORDER BY (cr.source_country_id IS NOT NULL AND cr.destination_country_id IS NOT NULL) DESC,
           (cr.destination_country_id IS NOT NULL) DESC,
           (cr.source_country_id IS NOT NULL) DESC,
           cr.updated_at DESC, cr.created_at DESC, cr.id DESC
  LIMIT 1;
  IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;

  -- 5) Paire pays partielle
  SELECT cr.id, cr.rate_percent INTO v_rule_id, v_rate
  FROM public.commission_rules cr
  WHERE cr.scope = 'country_pair' AND cr.is_enabled
    AND cr.vendor_id IS NULL AND cr.category_id IS NULL AND cr.product_id IS NULL
    AND (cr.source_country_id IS NULL OR (v_source_country_id IS NOT NULL AND cr.source_country_id = v_source_country_id))
    AND (cr.destination_country_id IS NULL OR (_destination_country_id IS NOT NULL AND cr.destination_country_id = _destination_country_id))
  ORDER BY (cr.destination_country_id IS NOT NULL) DESC,
           (cr.source_country_id IS NOT NULL) DESC,
           cr.updated_at DESC, cr.created_at DESC, cr.id DESC
  LIMIT 1;
  IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;

  -- 6) Global
  SELECT cr.id, cr.rate_percent INTO v_rule_id, v_rate
  FROM public.commission_rules cr
  WHERE cr.scope = 'global' AND cr.is_enabled
    AND cr.vendor_id IS NULL AND cr.category_id IS NULL AND cr.product_id IS NULL
    AND cr.source_country_id IS NULL AND cr.destination_country_id IS NULL
  ORDER BY cr.updated_at DESC, cr.created_at DESC, cr.id DESC
  LIMIT 1;
  IF v_rule_id IS NOT NULL THEN RETURN QUERY SELECT v_rate, v_rule_id; RETURN; END IF;

  RETURN QUERY SELECT 0::numeric, NULL::uuid;
END;
$function$;