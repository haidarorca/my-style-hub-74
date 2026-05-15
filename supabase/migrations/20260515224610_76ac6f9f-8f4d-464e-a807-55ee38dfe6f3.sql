CREATE OR REPLACE FUNCTION public.set_order_item_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.protect_order_item_commission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.commission_rate IS DISTINCT FROM OLD.commission_rate
     OR NEW.commission_amount IS DISTINCT FROM OLD.commission_amount
     OR NEW.commission_rule_id IS DISTINCT FROM OLD.commission_rule_id THEN
    IF NOT public.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Commission fields are immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_items_set_commission_trg ON public.order_items;
CREATE TRIGGER order_items_set_commission_trg
BEFORE INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.set_order_item_commission();

DROP TRIGGER IF EXISTS order_items_protect_commission_trg ON public.order_items;
CREATE TRIGGER order_items_protect_commission_trg
BEFORE UPDATE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.protect_order_item_commission();

DROP TRIGGER IF EXISTS commission_rules_history_trg ON public.commission_rules;
CREATE TRIGGER commission_rules_history_trg
AFTER INSERT OR UPDATE OR DELETE ON public.commission_rules
FOR EACH ROW EXECUTE FUNCTION public.log_commission_rule_change();