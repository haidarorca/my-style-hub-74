DROP POLICY IF EXISTS profiles_public_shop_read ON public.profiles;

CREATE POLICY profiles_public_shop_read ON public.profiles
FOR SELECT
TO public
USING (
  is_verified = true
  AND vendor_status = 'active'::vendor_account_status
  AND (access_ends_at IS NULL OR access_ends_at > now())
  AND public.has_role(id, 'vendeur'::app_role)
);