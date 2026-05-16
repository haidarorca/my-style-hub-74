
-- Fix 1: Restrict product_images and product_variants public reads to approved products
DROP POLICY IF EXISTS pi_read ON public.product_images;
CREATE POLICY pi_read ON public.product_images FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_images.product_id
      AND (
        (p.status = 'approved'::product_status AND EXISTS (
          SELECT 1 FROM public.profiles pr
          WHERE pr.id = p.vendor_id
            AND pr.is_verified = true
            AND pr.vendor_status = 'active'::vendor_account_status
            AND (pr.access_ends_at IS NULL OR pr.access_ends_at > now())
        ))
        OR p.vendor_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
  )
);

DROP POLICY IF EXISTS pv_read ON public.product_variants;
CREATE POLICY pv_read ON public.product_variants FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND (
        (p.status = 'approved'::product_status AND EXISTS (
          SELECT 1 FROM public.profiles pr
          WHERE pr.id = p.vendor_id
            AND pr.is_verified = true
            AND pr.vendor_status = 'active'::vendor_account_status
            AND (pr.access_ends_at IS NULL OR pr.access_ends_at > now())
        ))
        OR p.vendor_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
  )
);

-- Fix 2: Public-safe view of reviews excluding user_id and order_id
CREATE OR REPLACE VIEW public.public_product_reviews
WITH (security_invoker = false, security_barrier = true) AS
SELECT
  id,
  product_id,
  rating,
  comment,
  photos,
  vendor_response,
  vendor_response_at,
  created_at,
  updated_at
FROM public.product_reviews;

REVOKE ALL ON public.public_product_reviews FROM PUBLIC;
GRANT SELECT ON public.public_product_reviews TO anon, authenticated;
