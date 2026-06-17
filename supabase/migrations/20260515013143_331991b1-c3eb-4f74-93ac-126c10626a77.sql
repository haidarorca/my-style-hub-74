DROP POLICY IF EXISTS oi_insert_buyer_or_guest ON public.order_items;

CREATE POLICY oi_insert_buyer_or_guest
ON public.order_items
FOR INSERT
TO anon, authenticated
WITH CHECK (
  (
    auth.uid() IS NOT NULL
    AND buyer_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.buyer_id = auth.uid()
    )
  )
  OR
  (
    auth.role() = 'anon'
    AND buyer_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.buyer_id IS NULL
        AND o.customer_name IS NOT NULL
        AND o.customer_phone IS NOT NULL
        AND o.address IS NOT NULL
    )
  )
);