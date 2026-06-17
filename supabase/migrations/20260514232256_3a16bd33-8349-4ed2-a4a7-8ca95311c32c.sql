
ALTER TABLE public.orders
  ADD COLUMN customer_name text,
  ADD COLUMN customer_phone text,
  ADD COLUMN address text,
  ADD COLUMN city text,
  ADD COLUMN note text;

ALTER TABLE public.orders ALTER COLUMN status SET DEFAULT 'new';
UPDATE public.orders SET status = 'new' WHERE status = 'pending';

-- Allow a vendor to update status of orders they have items in
CREATE POLICY orders_vendor_read ON public.orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      WHERE oi.order_id = orders.id AND oi.vendor_id = auth.uid()
    )
  );

CREATE POLICY orders_vendor_update_status ON public.orders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      WHERE oi.order_id = orders.id AND oi.vendor_id = auth.uid()
    )
  );
