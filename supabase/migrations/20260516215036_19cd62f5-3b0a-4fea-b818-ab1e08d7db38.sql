
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
  updated_at,
  (order_id IS NOT NULL) AS is_verified
FROM public.product_reviews;

REVOKE ALL ON public.public_product_reviews FROM PUBLIC;
GRANT SELECT ON public.public_product_reviews TO anon, authenticated;
