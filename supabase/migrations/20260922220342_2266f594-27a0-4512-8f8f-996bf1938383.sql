ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS supplier_stock integer;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS supplier_available boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.get_product_display_price(_product_id uuid, _variant_id uuid DEFAULT NULL::uuid, _destination_country_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(product_id uuid, variant_id uuid, base_price numeric, final_price numeric, commission_rate numeric, commission_amount numeric, commission_rule_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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