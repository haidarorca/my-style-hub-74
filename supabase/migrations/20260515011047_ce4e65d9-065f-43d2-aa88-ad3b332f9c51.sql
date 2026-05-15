-- Allow guest orders
ALTER TABLE public.orders ALTER COLUMN buyer_id DROP NOT NULL;
ALTER TABLE public.order_items ALTER COLUMN buyer_id DROP NOT NULL;

-- Drop old buyer-only insert policies (they required auth.uid() = buyer_id)
DROP POLICY IF EXISTS orders_buyer_insert ON public.orders;
DROP POLICY IF EXISTS oi_buyer_insert ON public.order_items;

-- New insert policy: authenticated user inserting their own order, OR guest order (buyer_id IS NULL with required customer info)
CREATE POLICY "orders_insert_buyer_or_guest" ON public.orders
  FOR INSERT
  WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = buyer_id)
    OR (
      buyer_id IS NULL
      AND customer_name IS NOT NULL
      AND customer_phone IS NOT NULL
      AND address IS NOT NULL
    )
  );

CREATE POLICY "oi_insert_buyer_or_guest" ON public.order_items
  FOR INSERT
  WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = buyer_id)
    OR (
      buyer_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_items.order_id AND o.buyer_id IS NULL
      )
    )
  );