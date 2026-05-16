-- 1) Mark all current vendors as verified so the site keeps working
UPDATE public.profiles p
SET is_verified = true
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = p.id AND ur.role = 'vendeur'::app_role
)
AND is_verified = false;

-- 2) Replace public shop read policy: require is_verified
DROP POLICY IF EXISTS profiles_public_shop_read ON public.profiles;
CREATE POLICY profiles_public_shop_read ON public.profiles
FOR SELECT
USING (
  is_verified = true
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = profiles.id AND ur.role = 'vendeur'::app_role
  )
);

-- 3) Restrict public products read: vendor must also be verified
DROP POLICY IF EXISTS products_public_read_approved ON public.products;
CREATE POLICY products_public_read_approved ON public.products
FOR SELECT
USING (
  (
    status = 'approved'::product_status
    AND EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = products.vendor_id AND pr.is_verified = true
    )
  )
  OR vendor_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 4) Notify admins when a new vendor is created (role granted)
CREATE OR REPLACE FUNCTION public.notify_admins_on_new_vendor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_user record;
  v_email text;
  v_shop text;
BEGIN
  IF NEW.role = 'vendeur'::app_role THEN
    SELECT email, shop_name INTO v_email, v_shop FROM public.profiles WHERE id = NEW.user_id;
    FOR admin_user IN
      SELECT DISTINCT user_id FROM public.user_roles
      WHERE role IN ('admin'::app_role, 'super_admin'::app_role) AND is_suspended = false
    LOOP
      INSERT INTO public.notifications (user_id, title, message, link)
      VALUES (
        admin_user.user_id,
        '🛍️ Nouveau vendeur à valider',
        COALESCE(v_shop, v_email, 'Vendeur') || ' attend votre validation',
        '/admin/vendors'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_new_vendor ON public.user_roles;
CREATE TRIGGER trg_notify_admins_new_vendor
AFTER INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_new_vendor();