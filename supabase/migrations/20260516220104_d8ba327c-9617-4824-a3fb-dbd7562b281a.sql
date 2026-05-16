-- 1) Make protect_product_moderation_fields tolerant when called by service role
--    (e.g. admin server functions or supabase-js with service role key) where
--    auth.uid() is NULL but the operation is fully trusted.
CREATE OR REPLACE FUNCTION public.protect_product_moderation_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := current_setting('role', true);
BEGIN
  -- Trust service role / superuser contexts (admin server functions, migrations)
  IF v_uid IS NULL OR v_role IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF public.has_role(v_uid, 'admin'::app_role) OR public.is_super_admin(v_uid) THEN
    RETURN NEW;
  END IF;

  -- Vendor cannot change ownership or code
  IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     OR NEW.code IS DISTINCT FROM OLD.code
     OR NEW.pending_category_request_id IS DISTINCT FROM OLD.pending_category_request_id THEN
    RAISE EXCEPTION 'Vendors cannot modify ownership or code fields.';
  END IF;

  -- Status: vendor can only re-submit (approved->pending or rejected->pending after edit)
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'approved'::product_status AND NEW.status = 'pending'::product_status)
      OR (OLD.status = 'rejected'::product_status AND NEW.status = 'pending'::product_status)
    ) THEN
      RAISE EXCEPTION 'Vendors cannot change product moderation status.';
    END IF;
  END IF;

  IF NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason AND NEW.rejection_reason IS NOT NULL THEN
    RAISE EXCEPTION 'Vendors cannot set rejection reason.';
  END IF;

  RETURN NEW;
END;
$$;

-- Apply same tolerance to the profile and order triggers
CREATE OR REPLACE FUNCTION public.protect_profile_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := current_setting('role', true);
BEGIN
  IF v_uid IS NULL OR v_role IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF public.has_role(v_uid, 'admin'::app_role) OR public.is_super_admin(v_uid) THEN
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

CREATE OR REPLACE FUNCTION public.protect_order_vendor_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := current_setting('role', true);
BEGIN
  IF v_uid IS NULL OR v_role IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF public.has_role(v_uid, 'admin'::app_role) OR public.is_super_admin(v_uid) THEN
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

-- 2) Auto-grant 'vendeur' role when a profile becomes a vendor shop
CREATE OR REPLACE FUNCTION public.ensure_vendor_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.shop_name IS NOT NULL AND length(trim(NEW.shop_name)) > 0 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'vendeur'::app_role)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_vendor_role ON public.profiles;
CREATE TRIGGER trg_ensure_vendor_role
AFTER INSERT OR UPDATE OF shop_name ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.ensure_vendor_role();

-- 3) Backfill: any existing profile with a shop_name should have the vendeur role
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'vendeur'::app_role
FROM public.profiles p
WHERE p.shop_name IS NOT NULL
  AND length(trim(p.shop_name)) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role = 'vendeur'::app_role
  );