CREATE OR REPLACE FUNCTION public.get_product_display_price(_product_id uuid, _variant_id uuid DEFAULT NULL::uuid, _destination_country_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(product_id uuid, variant_id uuid, base_price numeric, final_price numeric, commission_rate numeric, commission_amount numeric, commission_rule_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_base numeric := 0;
  v_cost numeric;
  v_cost_ccy text;
  v_rate numeric;
  v_margin numeric;
  r record;
BEGIN
  SELECT COALESCE(pv.price_override, 0), pv.cost_price, pv.cost_currency_code, p.price
  INTO v_base, v_cost, v_cost_ccy, v_base
  FROM public.products p
  LEFT JOIN public.product_variants pv
    ON pv.id = _variant_id
   AND pv.product_id = p.id
  WHERE p.id = _product_id;

  -- Variante explicitement sélectionnée : son prix propre d'abord.
  IF _variant_id IS NOT NULL AND COALESCE(v_base, 0) <= 0 THEN
    IF COALESCE(v_cost, 0) > 0 AND v_cost_ccy IS NOT NULL THEN
      IF v_cost_ccy = 'XOF' THEN
        v_base := v_cost;
      ELSE
        SELECT cr.rate, cr.margin INTO v_rate, v_margin
        FROM public.current_currency_rate(v_cost_ccy) cr;
        IF v_rate IS NOT NULL THEN
          v_base := ROUND(v_cost * v_rate * (1 + COALESCE(v_margin, 0) / 100), 0);
        END IF;
      END IF;
    END IF;
  END IF;

  -- Repli : prix du produit.
  IF COALESCE(v_base, 0) <= 0 THEN
    SELECT p.price INTO v_base FROM public.products p WHERE p.id = _product_id;
  END IF;

  -- Repli : aucun prix sur le produit -> prix valide le moins cher des variantes.
  IF COALESCE(v_base, 0) <= 0 THEN
    SELECT MIN(pv.price_override)
    INTO v_base
    FROM public.product_variants pv
    WHERE pv.product_id = _product_id
      AND pv.price_override IS NOT NULL
      AND pv.price_override > 0;
  END IF;

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
$function$;