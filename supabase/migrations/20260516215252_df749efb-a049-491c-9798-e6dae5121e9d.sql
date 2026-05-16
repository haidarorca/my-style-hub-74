
-- =========================================================
-- 1) profiles: block self-update of admin-only fields
-- =========================================================
CREATE OR REPLACE FUNCTION public.protect_profile_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.vendor_status IS DISTINCT FROM OLD.vendor_status
     OR NEW.vendor_mode IS DISTINCT FROM OLD.vendor_mode
     OR NEW.access_starts_at IS DISTINCT FROM OLD.access_starts_at
     OR NEW.access_ends_at IS DISTINCT FROM OLD.access_ends_at
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason
     OR NEW.blocked_at IS DISTINCT FROM OLD.blocked_at
     OR NEW.blocked_reason IS DISTINCT FROM OLD.blocked_reason
     OR NEW.allowed_destination_country_ids IS DISTINCT FROM OLD.allowed_destination_country_ids
     OR NEW.source_country_id IS DISTINCT FROM OLD.source_country_id THEN
    RAISE EXCEPTION 'Only administrators can modify vendor moderation fields.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_admin_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_admin_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_admin_fields();

-- =========================================================
-- 2) orders: vendors may only update status (and forwarded_to_vendor_at)
-- =========================================================
DROP POLICY IF EXISTS orders_vendor_update_status ON public.orders;
CREATE POLICY orders_vendor_update_status ON public.orders
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.order_items oi
  WHERE oi.order_id = orders.id AND oi.vendor_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.order_items oi
  WHERE oi.order_id = orders.id AND oi.vendor_id = auth.uid()
));

CREATE OR REPLACE FUNCTION public.protect_order_vendor_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
     OR NEW.customer_phone IS DISTINCT FROM OLD.customer_phone
     OR NEW.address IS DISTINCT FROM OLD.address
     OR NEW.city IS DISTINCT FROM OLD.city
     OR NEW.note IS DISTINCT FROM OLD.note
     OR NEW.destination_country_id IS DISTINCT FROM OLD.destination_country_id
     OR NEW.is_commission IS DISTINCT FROM OLD.is_commission
     OR NEW.forwarded_to_vendor_at IS DISTINCT FROM OLD.forwarded_to_vendor_at THEN
    RAISE EXCEPTION 'Vendors can only update order status.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_order_vendor_update ON public.orders;
CREATE TRIGGER trg_protect_order_vendor_update
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.protect_order_vendor_update();

-- =========================================================
-- 3) products: keep RLS but ensure WITH CHECK forbids ownership change;
--    the existing trigger protect_product_moderation_fields already
--    blocks vendor self-approval. Re-affirm and ensure trigger is wired.
-- =========================================================
DROP TRIGGER IF EXISTS trg_protect_product_moderation_fields ON public.products;
CREATE TRIGGER trg_protect_product_moderation_fields
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.protect_product_moderation_fields();

-- =========================================================
-- 4) storage: tighten product-images INSERT to active vendors in own folder
-- =========================================================
DROP POLICY IF EXISTS prod_img_auth_write ON storage.objects;
CREATE POLICY prod_img_auth_write ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND (
    public.has_role(auth.uid(), 'vendeur'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_super_admin(auth.uid())
  )
);

-- =========================================================
-- 5) Convert previously created public views to SECURITY INVOKER
-- =========================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='public_product_reviews') THEN
    EXECUTE 'ALTER VIEW public.public_product_reviews SET (security_invoker = true)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='public_vendor_profiles') THEN
    EXECUTE 'ALTER VIEW public.public_vendor_profiles SET (security_invoker = true)';
  END IF;
END $$;
