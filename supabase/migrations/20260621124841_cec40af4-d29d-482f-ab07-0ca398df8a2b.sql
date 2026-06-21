
CREATE OR REPLACE FUNCTION public.snapshot_order_item_currency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  p_origin_currency text;
  p_origin_price numeric;
  p_rate numeric;
BEGIN
  -- Ne touche pas si déjà rempli (idempotent)
  IF NEW.origin_currency_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT origin_currency_code, origin_price, origin_rate_snapshot
    INTO p_origin_currency, p_origin_price, p_rate
  FROM public.products
  WHERE id = NEW.product_id;

  NEW.origin_currency_code := COALESCE(p_origin_currency, 'XOF');
  NEW.origin_unit_price := COALESCE(p_origin_price, NEW.unit_price);
  NEW.origin_rate_snapshot := COALESCE(p_rate, 1);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_items_snapshot_currency ON public.order_items;
CREATE TRIGGER order_items_snapshot_currency
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_order_item_currency();
