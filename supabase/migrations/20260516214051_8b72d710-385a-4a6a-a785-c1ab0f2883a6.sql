
-- Tighten vendor update policy with WITH CHECK that forbids changing moderation fields
DROP POLICY IF EXISTS products_vendor_update ON public.products;

CREATE POLICY products_vendor_update ON public.products
FOR UPDATE
TO authenticated
USING (vendor_id = auth.uid())
WITH CHECK (vendor_id = auth.uid());

-- Defense-in-depth trigger: block moderation field changes from non-admins
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

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.is_edit IS DISTINCT FROM OLD.is_edit
     OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     OR NEW.code IS DISTINCT FROM OLD.code
     OR NEW.pending_category_request_id IS DISTINCT FROM OLD.pending_category_request_id THEN
    RAISE EXCEPTION 'Vendors cannot modify moderation fields (status, rejection_reason, is_edit, vendor_id, code).';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_product_moderation_fields ON public.products;
CREATE TRIGGER trg_protect_product_moderation_fields
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.protect_product_moderation_fields();
