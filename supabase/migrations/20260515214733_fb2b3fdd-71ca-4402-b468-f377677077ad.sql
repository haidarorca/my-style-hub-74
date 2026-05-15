CREATE OR REPLACE FUNCTION public.resolve_commission(_product_id uuid, _destination_country_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(rate numeric, rule_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_vendor_id uuid;
  v_category_id uuid;
  v_source_country_id uuid;
  v_mode public.vendor_mode;
  v_rule_id uuid;
  v_rate numeric;
  cur_cat uuid;
BEGIN
  SELECT p.vendor_id, p.category_id
  INTO v_vendor_id, v_category_id
  FROM public.products p
  WHERE p.id = _product_id;

  IF v_vendor_id IS NULL THEN
    RETURN QUERY SELECT 0::numeric, NULL::uuid;
    RETURN;
  END IF;

  SELECT pr.vendor_mode, pr.source_country_id
  INTO v_mode, v_source_country_id
  FROM public.profiles pr
  WHERE pr.id = v_vendor_id;

  IF v_mode IS DISTINCT FROM 'commission'::public.vendor_mode THEN
    RETURN QUERY SELECT 0::numeric, NULL::uuid;
    RETURN;
  END IF;

  -- 1) Règle produit : uniquement si le pays source/destination correspond ou est générique.
  SELECT cr.id, cr.rate_percent
  INTO v_rule_id, v_rate
  FROM public.commission_rules cr
  WHERE cr.scope = 'product'
    AND cr.product_id = _product_id
    AND cr.is_enabled
    AND (cr.vendor_id = v_vendor_id OR cr.vendor_id IS NULL)
    AND (cr.source_country_id IS NULL OR (v_source_country_id IS NOT NULL AND cr.source_country_id = v_source_country_id))
    AND (cr.destination_country_id IS NULL OR (_destination_country_id IS NOT NULL AND cr.destination_country_id = _destination_country_id))
  ORDER BY
    (cr.vendor_id = v_vendor_id) DESC,
    (cr.source_country_id IS NOT NULL AND cr.destination_country_id IS NOT NULL) DESC,
    (cr.destination_country_id IS NOT NULL) DESC,
    (cr.source_country_id IS NOT NULL) DESC,
    cr.updated_at DESC,
    cr.created_at DESC,
    cr.id DESC
  LIMIT 1;
  IF v_rule_id IS NOT NULL THEN
    RETURN QUERY SELECT v_rate, v_rule_id;
    RETURN;
  END IF;

  -- 2) Règle catégorie : catégorie directe d’abord, puis parents. Dans chaque niveau, pays les plus précis d’abord.
  cur_cat := v_category_id;
  WHILE cur_cat IS NOT NULL LOOP
    SELECT cr.id, cr.rate_percent
    INTO v_rule_id, v_rate
    FROM public.commission_rules cr
    WHERE cr.scope = 'category'
      AND cr.category_id = cur_cat
      AND cr.is_enabled
      AND (cr.vendor_id = v_vendor_id OR cr.vendor_id IS NULL)
      AND (cr.source_country_id IS NULL OR (v_source_country_id IS NOT NULL AND cr.source_country_id = v_source_country_id))
      AND (cr.destination_country_id IS NULL OR (_destination_country_id IS NOT NULL AND cr.destination_country_id = _destination_country_id))
    ORDER BY
      (cr.vendor_id = v_vendor_id) DESC,
      (cr.source_country_id IS NOT NULL AND cr.destination_country_id IS NOT NULL) DESC,
      (cr.destination_country_id IS NOT NULL) DESC,
      (cr.source_country_id IS NOT NULL) DESC,
      cr.updated_at DESC,
      cr.created_at DESC,
      cr.id DESC
    LIMIT 1;
    IF v_rule_id IS NOT NULL THEN
      RETURN QUERY SELECT v_rate, v_rule_id;
      RETURN;
    END IF;

    SELECT c.parent_id INTO cur_cat
    FROM public.categories c
    WHERE c.id = cur_cat;
  END LOOP;

  -- 3) Règle vendeur.
  SELECT cr.id, cr.rate_percent
  INTO v_rule_id, v_rate
  FROM public.commission_rules cr
  WHERE cr.scope = 'vendor'
    AND cr.vendor_id = v_vendor_id
    AND cr.is_enabled
    AND cr.category_id IS NULL
    AND cr.product_id IS NULL
    AND (cr.source_country_id IS NULL OR (v_source_country_id IS NOT NULL AND cr.source_country_id = v_source_country_id))
    AND (cr.destination_country_id IS NULL OR (_destination_country_id IS NOT NULL AND cr.destination_country_id = _destination_country_id))
  ORDER BY
    (cr.source_country_id IS NOT NULL AND cr.destination_country_id IS NOT NULL) DESC,
    (cr.destination_country_id IS NOT NULL) DESC,
    (cr.source_country_id IS NOT NULL) DESC,
    cr.updated_at DESC,
    cr.created_at DESC,
    cr.id DESC
  LIMIT 1;
  IF v_rule_id IS NOT NULL THEN
    RETURN QUERY SELECT v_rate, v_rule_id;
    RETURN;
  END IF;

  -- 4) Règle pays source → destination, avec fallback destination seule, source seule, puis paire générique.
  SELECT cr.id, cr.rate_percent
  INTO v_rule_id, v_rate
  FROM public.commission_rules cr
  WHERE cr.scope = 'country_pair'
    AND cr.is_enabled
    AND cr.vendor_id IS NULL
    AND cr.category_id IS NULL
    AND cr.product_id IS NULL
    AND (cr.source_country_id IS NULL OR (v_source_country_id IS NOT NULL AND cr.source_country_id = v_source_country_id))
    AND (cr.destination_country_id IS NULL OR (_destination_country_id IS NOT NULL AND cr.destination_country_id = _destination_country_id))
  ORDER BY
    (cr.source_country_id IS NOT NULL AND cr.destination_country_id IS NOT NULL) DESC,
    (cr.destination_country_id IS NOT NULL) DESC,
    (cr.source_country_id IS NOT NULL) DESC,
    cr.updated_at DESC,
    cr.created_at DESC,
    cr.id DESC
  LIMIT 1;
  IF v_rule_id IS NOT NULL THEN
    RETURN QUERY SELECT v_rate, v_rule_id;
    RETURN;
  END IF;

  -- 5) Global.
  SELECT cr.id, cr.rate_percent
  INTO v_rule_id, v_rate
  FROM public.commission_rules cr
  WHERE cr.scope = 'global'
    AND cr.is_enabled
    AND cr.vendor_id IS NULL
    AND cr.category_id IS NULL
    AND cr.product_id IS NULL
    AND cr.source_country_id IS NULL
    AND cr.destination_country_id IS NULL
  ORDER BY cr.updated_at DESC, cr.created_at DESC, cr.id DESC
  LIMIT 1;
  IF v_rule_id IS NOT NULL THEN
    RETURN QUERY SELECT v_rate, v_rule_id;
    RETURN;
  END IF;

  RETURN QUERY SELECT 0::numeric, NULL::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_commission(_product_id uuid)
RETURNS TABLE(rate numeric, rule_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT rate, rule_id FROM public.resolve_commission(_product_id, NULL::uuid);
$$;

CREATE OR REPLACE FUNCTION public.get_product_display_price(
  _product_id uuid,
  _variant_id uuid DEFAULT NULL::uuid,
  _destination_country_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  product_id uuid,
  variant_id uuid,
  base_price numeric,
  final_price numeric,
  commission_rate numeric,
  commission_amount numeric,
  commission_rule_id uuid
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_base numeric := 0;
  r record;
BEGIN
  SELECT COALESCE(pv.price_override, p.price, 0)
  INTO v_base
  FROM public.products p
  LEFT JOIN public.product_variants pv
    ON pv.id = _variant_id
   AND pv.product_id = p.id
  WHERE p.id = _product_id;

  IF v_base IS NULL THEN
    v_base := 0;
  END IF;

  SELECT * INTO r
  FROM public.resolve_commission(_product_id, _destination_country_id);

  RETURN QUERY SELECT
    _product_id,
    _variant_id,
    v_base,
    v_base + ROUND(v_base * COALESCE(r.rate, 0) / 100, 2),
    COALESCE(r.rate, 0),
    ROUND(v_base * COALESCE(r.rate, 0) / 100, 2),
    r.rule_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_display_prices(
  _product_ids uuid[],
  _destination_country_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  product_id uuid,
  base_price numeric,
  final_price numeric,
  commission_rate numeric,
  commission_amount numeric,
  commission_rule_id uuid
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.product_id, p.base_price, p.final_price, p.commission_rate, p.commission_amount, p.commission_rule_id
  FROM unnest(_product_ids) AS ids(product_id)
  CROSS JOIN LATERAL public.get_product_display_price(ids.product_id, NULL::uuid, _destination_country_id) p;
$$;

CREATE OR REPLACE FUNCTION public.set_order_item_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_dest uuid;
BEGIN
  SELECT destination_country_id INTO v_dest
  FROM public.orders
  WHERE id = NEW.order_id;

  SELECT * INTO r
  FROM public.get_product_display_price(NEW.product_id, NEW.variant_id, v_dest);

  NEW.commission_rate := COALESCE(r.commission_rate, 0);
  NEW.commission_amount := ROUND(COALESCE(r.commission_amount, 0) * COALESCE(NEW.quantity, 1), 2);
  NEW.commission_rule_id := r.commission_rule_id;
  NEW.unit_price := COALESCE(r.final_price, NEW.unit_price, 0);

  RETURN NEW;
END;
$$;