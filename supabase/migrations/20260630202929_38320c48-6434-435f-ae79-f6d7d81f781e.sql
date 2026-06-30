
CREATE OR REPLACE FUNCTION public.open_return_case_for_items(
  _order_id uuid,
  _kind return_case_kind,
  _items jsonb,
  _reason_note text DEFAULT NULL,
  _reason_code text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _case_id uuid;
  _code text;
  _uid uuid := auth.uid();
  _item jsonb;
  _oi_id uuid;
  _qty integer;
  _price numeric;
  _oi_order_id uuid;
  _exists uuid;
BEGIN
  IF NOT (public.has_role(_uid, 'admin') OR public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Aucun article fourni';
  END IF;

  -- Validate every item up front (atomic check)
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _oi_id := (_item->>'order_item_id')::uuid;
    _qty   := COALESCE((_item->>'quantity')::int, 0);

    SELECT order_id INTO _oi_order_id FROM public.order_items WHERE id = _oi_id;
    IF _oi_order_id IS NULL OR _oi_order_id <> _order_id THEN
      RAISE EXCEPTION 'Article % introuvable pour cette commande', _oi_id;
    END IF;

    IF _qty <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour l''article %', _oi_id;
    END IF;

    -- Reject if this order_item is already attached to a non-closed case
    SELECT rc.id INTO _exists
    FROM public.return_case_items rci
    JOIN public.return_cases rc ON rc.id = rci.case_id
    WHERE rci.order_item_id = _oi_id
      AND rc.status IN ('open','decided');
    IF _exists IS NOT NULL THEN
      RAISE EXCEPTION 'Article % déjà présent dans un dossier ouvert', _oi_id;
    END IF;
  END LOOP;

  _code := public.next_return_case_code(_kind);

  INSERT INTO public.return_cases (code, kind, order_id, opened_by, reason_code, reason_note)
  VALUES (_code, _kind, _order_id, _uid, _reason_code, _reason_note)
  RETURNING id INTO _case_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _oi_id := (_item->>'order_item_id')::uuid;
    _qty   := (_item->>'quantity')::int;
    _price := COALESCE((_item->>'unit_price_xof')::numeric, 0);

    INSERT INTO public.return_case_items (case_id, order_item_id, quantity, unit_price_xof)
    VALUES (_case_id, _oi_id, _qty, _price);
  END LOOP;

  RETURN _case_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_return_case_for_items(uuid, return_case_kind, jsonb, text, text) TO authenticated;
