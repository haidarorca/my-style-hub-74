
CREATE OR REPLACE FUNCTION public.protect_product_moderation_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Vendor cannot change ownership or code
  IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     OR NEW.code IS DISTINCT FROM OLD.code
     OR NEW.pending_category_request_id IS DISTINCT FROM OLD.pending_category_request_id THEN
    RAISE EXCEPTION 'Vendors cannot modify ownership or code fields.';
  END IF;

  -- Status: only allowed transition for vendor is approved -> pending (re-validation after edit)
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'approved'::product_status AND NEW.status = 'pending'::product_status) THEN
      RAISE EXCEPTION 'Vendors cannot change product moderation status.';
    END IF;
  END IF;

  -- Vendor can only clear rejection_reason (set to NULL), not set arbitrary text
  IF NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason AND NEW.rejection_reason IS NOT NULL THEN
    RAISE EXCEPTION 'Vendors cannot set rejection reason.';
  END IF;

  RETURN NEW;
END;
$$;
