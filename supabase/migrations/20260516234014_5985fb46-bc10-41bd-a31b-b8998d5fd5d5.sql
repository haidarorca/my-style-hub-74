CREATE OR REPLACE FUNCTION public.vendor_publicly_visible(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _user_id
      AND p.is_verified = true
      AND p.vendor_status = 'active'::public.vendor_account_status
      AND (p.access_ends_at IS NULL OR p.access_ends_at > now())
      AND public.has_role(p.id, 'vendeur'::public.app_role)
  )
$$;

GRANT EXECUTE ON FUNCTION public.vendor_publicly_visible(uuid) TO anon, authenticated;

ALTER VIEW public.public_vendor_profiles SET (security_invoker = false);
GRANT SELECT ON public.public_vendor_profiles TO anon, authenticated;

DROP POLICY IF EXISTS products_public_read_approved ON public.products;
CREATE POLICY products_public_read_approved
ON public.products
FOR SELECT
TO public
USING (
  (
    status = 'approved'::public.product_status
    AND public.vendor_publicly_visible(vendor_id)
  )
  OR vendor_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS pi_read ON public.product_images;
CREATE POLICY pi_read
ON public.product_images
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = product_images.product_id
      AND (
        (
          p.status = 'approved'::public.product_status
          AND public.vendor_publicly_visible(p.vendor_id)
        )
        OR p.vendor_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.is_super_admin(auth.uid())
      )
  )
);

DROP POLICY IF EXISTS pv_read ON public.product_variants;
CREATE POLICY pv_read
ON public.product_variants
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = product_variants.product_id
      AND (
        (
          p.status = 'approved'::public.product_status
          AND public.vendor_publicly_visible(p.vendor_id)
        )
        OR p.vendor_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.is_super_admin(auth.uid())
      )
  )
);