CREATE OR REPLACE FUNCTION public.kawscan_lookup(_slug text, _code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE st record; p record; tiers jsonb; eff numeric; promo boolean := false;
        c text; variants text[];
BEGIN
  SELECT * INTO st FROM public.kawscan_public_store(_slug);
  IF st.id IS NULL THEN RETURN jsonb_build_object('error','store_not_found'); END IF;
  IF st.access_state <> 'ok' THEN RETURN jsonb_build_object('error', st.access_state); END IF;

  c := lower(btrim(COALESCE(_code, '')));
  IF c = '' THEN RETURN jsonb_build_object('error','code_not_found','code',_code); END IF;

  variants := ARRAY[c];
  IF c ~ '^[0-9]+$' THEN
    -- sans zéros de tête, et variantes 12/13/14 chiffres
    variants := variants || ltrim(c, '0');
    variants := variants || lpad(ltrim(c, '0'), 12, '0');
    variants := variants || lpad(ltrim(c, '0'), 13, '0');
    variants := variants || lpad(ltrim(c, '0'), 14, '0');
    variants := variants || lpad(ltrim(c, '0'), 8, '0');
  END IF;

  SELECT * INTO p FROM public.kawscan_products
   WHERE store_id = st.id
     AND is_active = true
     AND (
       lower(btrim(code)) = ANY(variants)
       OR (lower(btrim(code)) ~ '^[0-9]+$' AND c ~ '^[0-9]+$'
           AND ltrim(lower(btrim(code)), '0') = ltrim(c, '0'))
     )
   ORDER BY (lower(btrim(code)) = c) DESC
   LIMIT 1;

  IF p.id IS NULL THEN RETURN jsonb_build_object('error','code_not_found','code',_code); END IF;

  IF p.promo_active AND p.promo_price IS NOT NULL
     AND (p.promo_starts_at IS NULL OR p.promo_starts_at <= now())
     AND (p.promo_ends_at IS NULL OR p.promo_ends_at >= now()) THEN
    promo := true;
  END IF;
  eff := CASE WHEN promo THEN p.promo_price ELSE p.price END;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('label', t.label, 'price', t.price) ORDER BY t.position, t.label), '[]'::jsonb)
    INTO tiers FROM public.kawscan_price_tiers t WHERE t.product_id = p.id;

  RETURN jsonb_build_object(
    'code', p.code,
    'name', p.name,
    'unit', p.unit,
    'price', p.price,
    'promo', promo,
    'promo_price', p.promo_price,
    'effective_price', eff,
    'currency', COALESCE(p.currency_code, st.currency_code),
    'tiers', tiers
  );
END;
$function$;