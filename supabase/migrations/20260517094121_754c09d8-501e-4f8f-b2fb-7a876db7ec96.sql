-- 1) is_active + views_count on products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS views_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS products_vendor_created_idx
  ON public.products (vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS products_vendor_active_idx
  ON public.products (vendor_id, is_active);

-- 2) Refresh public-read RLS to hide inactive products from the public
DROP POLICY IF EXISTS products_public_read_approved ON public.products;
CREATE POLICY products_public_read_approved
  ON public.products
  FOR SELECT
  USING (
    (status = 'approved'::product_status
       AND is_active = true
       AND vendor_publicly_visible(vendor_id))
    OR vendor_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_super_admin(auth.uid())
  );

-- 3) Lightweight view-counter RPC (atomic increment).
CREATE OR REPLACE FUNCTION public.increment_product_view(_product_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.products
     SET views_count = views_count + 1
   WHERE id = _product_id
     AND status = 'approved'
     AND is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.increment_product_view(uuid) TO anon, authenticated;

-- 4) Private stats RPC for the shop owner (counts sales + revenue per product).
CREATE OR REPLACE FUNCTION public.get_shop_product_stats(_vendor_id uuid)
RETURNS TABLE (product_id uuid, sales_count bigint, revenue numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id AS product_id,
         COALESCE(SUM(oi.quantity), 0)::bigint AS sales_count,
         COALESCE(SUM(oi.quantity * oi.unit_price), 0)::numeric AS revenue
  FROM public.products p
  LEFT JOIN public.order_items oi ON oi.product_id = p.id
  WHERE p.vendor_id = _vendor_id
    AND (
      _vendor_id = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
      OR is_super_admin(auth.uid())
    )
  GROUP BY p.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_shop_product_stats(uuid) TO authenticated;