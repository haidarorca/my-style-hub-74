CREATE OR REPLACE FUNCTION public.mark_order_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mode text;
BEGIN
  SELECT vendor_mode::text INTO v_mode FROM public.profiles WHERE id = NEW.vendor_id;

  IF COALESCE(NEW.commission_amount, 0) > 0 OR v_mode = 'commission' THEN
    RAISE LOG '[checkout] mark_order_commission order_id=% vendor_id=% buyer_id=% commission_amount=% vendor_mode=% auth_uid=%',
      NEW.order_id,
      NEW.vendor_id,
      NEW.buyer_id,
      COALESCE(NEW.commission_amount, 0),
      v_mode,
      auth.uid();

    PERFORM set_config('app.internal_order_commission_update', '1', true);

    UPDATE public.orders
    SET is_commission = true
    WHERE id = NEW.order_id
      AND is_commission = false;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protect_order_vendor_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := current_setting('role', true);
  v_internal_commission_update boolean := current_setting('app.internal_order_commission_update', true) = '1';
BEGIN
  IF v_uid IS NULL OR v_role IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF public.has_role(v_uid, 'admin'::app_role) OR public.is_super_admin(v_uid) THEN
    RETURN NEW;
  END IF;

  IF v_internal_commission_update
     AND NEW.is_commission = true
     AND OLD.is_commission = false
     AND NEW.buyer_id IS NOT DISTINCT FROM OLD.buyer_id
     AND NEW.total IS NOT DISTINCT FROM OLD.total
     AND NEW.customer_name IS NOT DISTINCT FROM OLD.customer_name
     AND NEW.customer_phone IS NOT DISTINCT FROM OLD.customer_phone
     AND NEW.address IS NOT DISTINCT FROM OLD.address
     AND NEW.city IS NOT DISTINCT FROM OLD.city
     AND NEW.note IS NOT DISTINCT FROM OLD.note
     AND NEW.destination_country_id IS NOT DISTINCT FROM OLD.destination_country_id
     AND NEW.forwarded_to_vendor_at IS NOT DISTINCT FROM OLD.forwarded_to_vendor_at
     AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
     OR NEW.customer_phone IS DISTINCT FROM OLD.customer_phone
     OR NEW.address IS DISTINCT FROM OLD.address
     OR NEW.city IS DISTINCT FROM OLD.city
     OR NEW.note IS DISTINCT FROM OLD.note
     OR NEW.destination_country_id IS DISTINCT FROM OLD.destination_country_id
     OR NEW.is_commission IS DISTINCT FROM OLD.is_commission
     OR NEW.forwarded_to_vendor_at IS DISTINCT FROM OLD.forwarded_to_vendor_at THEN
    RAISE LOG '[checkout] protect_order_vendor_update blocked order_id=% auth_uid=% role=% old_is_commission=% new_is_commission=% internal_flag=%',
      NEW.id,
      v_uid,
      v_role,
      OLD.is_commission,
      NEW.is_commission,
      v_internal_commission_update;
    RAISE EXCEPTION 'Vendors can only update order status.';
  END IF;

  RETURN NEW;
END;
$function$;