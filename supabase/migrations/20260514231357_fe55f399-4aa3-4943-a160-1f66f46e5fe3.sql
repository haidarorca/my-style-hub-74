
-- Orders
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_buyer_read ON public.orders
  FOR SELECT USING (auth.uid() = buyer_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY orders_buyer_insert ON public.orders
  FOR INSERT WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY orders_admin_all ON public.orders
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Order items (snapshots)
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  variant_id uuid,
  vendor_id uuid NOT NULL,
  buyer_id uuid NOT NULL,
  product_name text NOT NULL,
  product_code text NOT NULL,
  product_image_url text,
  size text,
  color text,
  unit_price numeric NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  customization jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_items_vendor_idx ON public.order_items(vendor_id, created_at DESC);
CREATE INDEX order_items_buyer_idx ON public.order_items(buyer_id, created_at DESC);
CREATE INDEX order_items_order_idx ON public.order_items(order_id);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY oi_read ON public.order_items
  FOR SELECT USING (
    auth.uid() = buyer_id
    OR auth.uid() = vendor_id
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY oi_buyer_insert ON public.order_items
  FOR INSERT WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY oi_admin_all ON public.order_items
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
