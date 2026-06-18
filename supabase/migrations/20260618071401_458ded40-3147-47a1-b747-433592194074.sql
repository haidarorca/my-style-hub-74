CREATE OR REPLACE FUNCTION public.guard_products_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_admin boolean;
BEGIN
  -- Service role (server functions using supabaseAdmin) has no auth.uid().
  -- Treat that as a trusted backend caller and skip the guard.
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  is_admin := public.has_role(uid, 'admin'::app_role) OR public.is_super_admin(uid);
  IF is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'approved'::product_status THEN
    RAISE EXCEPTION 'Vendors cannot self-approve products';
  END IF;

  RETURN NEW;
END;
$$;