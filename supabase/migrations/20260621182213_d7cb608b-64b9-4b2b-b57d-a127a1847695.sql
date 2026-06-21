CREATE OR REPLACE FUNCTION public.guard_orders_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cur_role text := current_setting('role', true);
  sess_role text := current_user;
  is_service boolean := (cur_role = 'service_role' OR sess_role = 'service_role' OR auth.uid() IS NULL);
  is_admin boolean := (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::app_role));
  is_buyer boolean := (auth.uid() IS NOT NULL AND auth.uid() = OLD.buyer_id);
  is_vendor boolean := EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = OLD.id AND oi.vendor_id = auth.uid()
  );
BEGIN
  -- Les serveurs internes (server functions Lovable) opèrent via service_role
  -- et passent par requireSupabaseAuth pour autoriser l'appelant côté app.
  IF is_service OR is_admin OR is_buyer THEN
    RETURN NEW;
  END IF;

  IF is_vendor THEN
    IF NEW.total IS DISTINCT FROM OLD.total
       OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
       OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
       OR NEW.customer_phone IS DISTINCT FROM OLD.customer_phone
       OR NEW.address IS DISTINCT FROM OLD.address THEN
      RAISE EXCEPTION 'Vendors may only update order status, not sensitive fields';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not allowed to update this order';
END;
$function$;