
CREATE OR REPLACE FUNCTION public.mark_order_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mode text;
BEGIN
  SELECT vendor_mode INTO v_mode FROM public.profiles WHERE id = NEW.vendor_id;
  IF COALESCE(NEW.commission_amount, 0) > 0 OR v_mode = 'commission' THEN
    UPDATE public.orders SET is_commission = true
    WHERE id = NEW.order_id AND is_commission = false;
  END IF;
  RETURN NEW;
END;
$function$;

-- Backfill: any order with at least one item from a commission-mode vendor
UPDATE public.orders o
SET is_commission = true
WHERE is_commission = false
  AND EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.profiles p ON p.id = oi.vendor_id
    WHERE oi.order_id = o.id
      AND (COALESCE(oi.commission_amount, 0) > 0 OR p.vendor_mode = 'commission')
  );
