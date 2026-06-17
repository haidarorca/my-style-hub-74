CREATE OR REPLACE FUNCTION public.upsert_commission_rule(
  _scope text,
  _rate_percent numeric,
  _is_enabled boolean DEFAULT true,
  _vendor_id uuid DEFAULT NULL,
  _category_id uuid DEFAULT NULL,
  _product_id uuid DEFAULT NULL,
  _source_country_id uuid DEFAULT NULL,
  _destination_country_id uuid DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS public.commission_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule public.commission_rules;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF _rate_percent IS NULL OR _rate_percent < 0 OR _rate_percent > 100 THEN
    RAISE EXCEPTION 'Taux commission invalide';
  END IF;

  IF _scope NOT IN ('global', 'vendor', 'category', 'product', 'country_pair') THEN
    RAISE EXCEPTION 'Scope commission invalide';
  END IF;

  IF _scope = 'global' THEN
    _vendor_id := NULL;
    _category_id := NULL;
    _product_id := NULL;
    _source_country_id := NULL;
    _destination_country_id := NULL;
  ELSIF _scope = 'country_pair' THEN
    _vendor_id := NULL;
    _category_id := NULL;
    _product_id := NULL;
  ELSIF _scope = 'category' THEN
    IF _category_id IS NULL THEN
      RAISE EXCEPTION 'Catégorie requise';
    END IF;
    _product_id := NULL;
  ELSIF _scope = 'product' THEN
    IF _product_id IS NULL THEN
      RAISE EXCEPTION 'Produit requis';
    END IF;
    _category_id := NULL;
  ELSIF _scope = 'vendor' THEN
    IF _vendor_id IS NULL THEN
      RAISE EXCEPTION 'Vendeur requis';
    END IF;
    _category_id := NULL;
    _product_id := NULL;
  END IF;

  SELECT * INTO v_rule
  FROM public.commission_rules cr
  WHERE cr.scope = _scope
    AND cr.vendor_id IS NOT DISTINCT FROM _vendor_id
    AND cr.category_id IS NOT DISTINCT FROM _category_id
    AND cr.product_id IS NOT DISTINCT FROM _product_id
    AND cr.source_country_id IS NOT DISTINCT FROM _source_country_id
    AND cr.destination_country_id IS NOT DISTINCT FROM _destination_country_id
  ORDER BY cr.updated_at DESC, cr.created_at DESC, cr.id DESC
  LIMIT 1;

  IF v_rule.id IS NULL THEN
    INSERT INTO public.commission_rules (
      scope,
      vendor_id,
      category_id,
      product_id,
      source_country_id,
      destination_country_id,
      rate_percent,
      is_enabled,
      note,
      created_by
    ) VALUES (
      _scope,
      _vendor_id,
      _category_id,
      _product_id,
      _source_country_id,
      _destination_country_id,
      _rate_percent,
      COALESCE(_is_enabled, true),
      _note,
      auth.uid()
    )
    RETURNING * INTO v_rule;
  ELSE
    UPDATE public.commission_rules
    SET
      rate_percent = _rate_percent,
      is_enabled = COALESCE(_is_enabled, true),
      note = COALESCE(_note, note),
      updated_at = now()
    WHERE id = v_rule.id
    RETURNING * INTO v_rule;
  END IF;

  RETURN v_rule;
EXCEPTION WHEN unique_violation THEN
  UPDATE public.commission_rules cr
  SET
    rate_percent = _rate_percent,
    is_enabled = COALESCE(_is_enabled, true),
    note = COALESCE(_note, cr.note),
    updated_at = now()
  WHERE cr.scope = _scope
    AND cr.vendor_id IS NOT DISTINCT FROM _vendor_id
    AND cr.category_id IS NOT DISTINCT FROM _category_id
    AND cr.product_id IS NOT DISTINCT FROM _product_id
    AND cr.source_country_id IS NOT DISTINCT FROM _source_country_id
    AND cr.destination_country_id IS NOT DISTINCT FROM _destination_country_id
  RETURNING * INTO v_rule;

  IF v_rule.id IS NULL THEN
    RAISE;
  END IF;

  RETURN v_rule;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_commission_rule(text, numeric, boolean, uuid, uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_commission_rule(text, numeric, boolean, uuid, uuid, uuid, uuid, uuid, text) TO authenticated;