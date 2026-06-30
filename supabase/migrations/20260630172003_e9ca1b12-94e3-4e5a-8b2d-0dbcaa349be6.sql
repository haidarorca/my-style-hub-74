
-- Atomic RPC: open a return/cancellation case for a single order_item.
CREATE OR REPLACE FUNCTION public.open_return_case_for_item(
  _order_id uuid,
  _order_item_id uuid,
  _kind return_case_kind,
  _quantity integer,
  _unit_price_xof numeric,
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
  _oi_order_id uuid;
BEGIN
  -- Authorization: caller must be admin or super admin
  IF NOT (public.has_role(_uid, 'admin') OR public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Validate order_item belongs to the order
  SELECT order_id INTO _oi_order_id FROM public.order_items WHERE id = _order_item_id;
  IF _oi_order_id IS NULL OR _oi_order_id <> _order_id THEN
    RAISE EXCEPTION 'Article introuvable pour cette commande';
  END IF;

  IF _quantity IS NULL OR _quantity <= 0 THEN
    RAISE EXCEPTION 'Quantité invalide';
  END IF;

  _code := public.next_return_case_code(_kind);

  INSERT INTO public.return_cases (code, kind, order_id, opened_by, reason_code, reason_note)
  VALUES (_code, _kind, _order_id, _uid, _reason_code, _reason_note)
  RETURNING id INTO _case_id;

  INSERT INTO public.return_case_items (case_id, order_item_id, quantity, unit_price_xof)
  VALUES (_case_id, _order_item_id, _quantity, _unit_price_xof);

  RETURN _case_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_return_case_for_item(uuid, uuid, return_case_kind, integer, numeric, text, text) TO authenticated;
