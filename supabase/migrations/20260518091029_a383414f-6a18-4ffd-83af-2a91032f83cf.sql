
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vendor_contact_force_visible boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.vendor_contacts_visible(_vendor_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mode public.vendor_mode;
  v_contact_mode public.shop_contact_mode;
  v_force boolean;
  v_commission_hides boolean;
  v_global_enabled boolean;
BEGIN
  SELECT vendor_mode, contact_mode, vendor_contact_force_visible
    INTO v_mode, v_contact_mode, v_force
  FROM public.profiles WHERE id = _vendor_id;

  IF v_mode IS NULL THEN RETURN false; END IF;

  SELECT vendor_contact_enabled, commission_hides_vendor_contact
    INTO v_global_enabled, v_commission_hides
  FROM public.contact_settings WHERE id = 'main';

  -- shop-level override can re-enable contact even if global disabled it
  IF v_contact_mode IN ('blocked','admin_only','internal_only') THEN RETURN false; END IF;

  IF COALESCE(v_force, false) THEN RETURN true; END IF;

  IF NOT COALESCE(v_global_enabled, true) THEN RETURN false; END IF;

  IF v_mode = 'commission'::public.vendor_mode AND COALESCE(v_commission_hides, true) THEN
    RETURN false;
  END IF;

  RETURN true;
END $$;
