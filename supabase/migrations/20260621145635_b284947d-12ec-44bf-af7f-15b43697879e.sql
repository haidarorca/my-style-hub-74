
-- 1) create_currency : crée une devise + premier taux historique
CREATE OR REPLACE FUNCTION public.create_currency(
  _code text,
  _name text,
  _symbol text,
  _decimals integer DEFAULT 0,
  _display_order integer DEFAULT 100,
  _rate numeric DEFAULT NULL,
  _margin numeric DEFAULT 0,
  _is_active boolean DEFAULT true
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_code text;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF _code IS NULL OR length(trim(_code)) <> 3 THEN
    RAISE EXCEPTION 'Code ISO invalide (3 lettres requis)';
  END IF;
  v_code := upper(trim(_code));
  IF v_code <> 'XOF' AND (_rate IS NULL OR _rate <= 0) THEN
    RAISE EXCEPTION 'Taux requis et > 0';
  END IF;

  INSERT INTO public.currencies(code, name, symbol, decimals, display_order, is_active, is_base)
  VALUES (v_code, _name, _symbol, COALESCE(_decimals, 0), COALESCE(_display_order, 100), COALESCE(_is_active, true), v_code = 'XOF')
  ON CONFLICT (code) DO NOTHING;

  IF v_code <> 'XOF' THEN
    INSERT INTO public.currency_rates(currency_code, rate_to_base, safety_margin_pct, created_by, note)
    VALUES (v_code, _rate, COALESCE(_margin, 0), auth.uid(), 'Création devise');
  END IF;
  RETURN v_code;
END;
$$;

-- 2) update_currency : édite les méta d'une devise (pas le code, pas is_base)
CREATE OR REPLACE FUNCTION public.update_currency(
  _code text,
  _name text DEFAULT NULL,
  _symbol text DEFAULT NULL,
  _decimals integer DEFAULT NULL,
  _display_order integer DEFAULT NULL,
  _is_active boolean DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE public.currencies SET
    name = COALESCE(_name, name),
    symbol = COALESCE(_symbol, symbol),
    decimals = COALESCE(_decimals, decimals),
    display_order = COALESCE(_display_order, display_order),
    is_active = COALESCE(_is_active, is_active)
  WHERE code = upper(_code);
END;
$$;

-- 3) preview_currency_recompute : pas de mutation, juste un diff
CREATE OR REPLACE FUNCTION public.preview_currency_recompute(_code text)
RETURNS TABLE(product_id uuid, name text, code text, origin_price numeric, old_price numeric, new_price numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rate numeric;
  v_margin numeric;
  v_code text := upper(_code);
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT rate, margin INTO v_rate, v_margin FROM public.current_currency_rate(v_code);
  IF v_rate IS NULL THEN
    RAISE EXCEPTION 'Aucun taux configuré pour %', v_code;
  END IF;

  RETURN QUERY
  SELECT p.id, p.name, p.code, p.origin_price, p.price::numeric,
         ROUND(p.origin_price * v_rate * (1 + COALESCE(v_margin,0)/100), 0)::numeric
  FROM public.products p
  WHERE p.origin_currency_code = v_code
    AND p.origin_price IS NOT NULL
    AND p.deleted_at IS NULL
  ORDER BY p.name NULLS LAST;
END;
$$;

-- 4) apply_currency_recompute : touche UNIQUEMENT products, jamais order_items
CREATE OR REPLACE FUNCTION public.apply_currency_recompute(_code text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
  v_code text := upper(_code);
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  -- Le trigger recompute_product_price_xof se déclenche sur UPDATE
  -- et met à jour price, origin_rate_snapshot, origin_margin_snapshot.
  UPDATE public.products
  SET origin_price = origin_price  -- self-write pour déclencher le trigger
  WHERE origin_currency_code = v_code
    AND origin_price IS NOT NULL
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_currency(text, text, text, integer, integer, numeric, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_currency(text, text, text, integer, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_currency_recompute(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_currency_recompute(text) TO authenticated;
