DROP POLICY IF EXISTS products_vendor_insert ON public.products;

CREATE POLICY products_vendor_insert ON public.products
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = vendor_id
  AND has_role(auth.uid(), 'vendeur'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.vendor_status IN ('active'::vendor_account_status, 'pending'::vendor_account_status)
      AND (p.access_ends_at IS NULL OR p.access_ends_at > now())
  )
);