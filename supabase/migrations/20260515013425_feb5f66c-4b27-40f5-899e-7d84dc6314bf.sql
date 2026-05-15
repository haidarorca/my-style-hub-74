CREATE OR REPLACE FUNCTION public.can_insert_order_item(_order_id uuid, _buyer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN auth.uid() IS NOT NULL THEN
        _buyer_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.id = _order_id
            AND o.buyer_id = auth.uid()
        )
      ELSE
        _buyer_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.id = _order_id
            AND o.buyer_id IS NULL
            AND o.customer_name IS NOT NULL
            AND o.customer_phone IS NOT NULL
            AND o.address IS NOT NULL
        )
    END;
$$;

DROP POLICY IF EXISTS oi_insert_buyer_or_guest ON public.order_items;

CREATE POLICY oi_insert_buyer_or_guest
ON public.order_items
FOR INSERT
TO anon, authenticated
WITH CHECK (public.can_insert_order_item(order_id, buyer_id));