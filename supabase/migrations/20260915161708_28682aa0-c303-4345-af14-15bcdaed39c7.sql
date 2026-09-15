CREATE OR REPLACE FUNCTION public.guard_products_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR public.has_role(v_uid, 'admin'::app_role) OR public.is_super_admin(v_uid) THEN
    RETURN NEW;
  END IF;

  IF OLD.vendor_id = v_uid THEN
    IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id THEN
      RAISE EXCEPTION 'Le propriétaire du produit ne peut pas être modifié.';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status NOT IN ('draft'::product_status, 'pending'::product_status) THEN
      RAISE EXCEPTION 'Un vendeur ne peut pas définir ce statut de produit (%).', NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.has_admin_permission(uuid, admin_permission) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_can(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_has_role_key(uuid, text) FROM anon;