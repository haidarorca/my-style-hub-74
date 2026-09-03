
-- 1) brands: only vendors/admins may insert
DROP POLICY IF EXISTS "Authenticated users can create brands" ON public.brands;
CREATE POLICY "Vendors and admins can create brands"
ON public.brands FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'vendeur'::app_role)
);

-- 2) orders: vendors restricted to an explicit column allow-list
CREATE OR REPLACE FUNCTION public.guard_orders_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cur_role text := current_setting('role', true);
  sess_role text := current_user;
  is_service boolean := (cur_role = 'service_role' OR sess_role = 'service_role' OR auth.uid() IS NULL);
  is_admin boolean := (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::app_role));
  is_buyer boolean := (auth.uid() IS NOT NULL AND auth.uid() = OLD.buyer_id);
  is_vendor boolean := EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = OLD.id AND oi.vendor_id = auth.uid()
  );
  old_j jsonb;
  new_j jsonb;
  k text;
BEGIN
  IF is_service OR is_admin OR is_buyer THEN
    RETURN NEW;
  END IF;

  IF is_vendor THEN
    old_j := to_jsonb(OLD);
    new_j := to_jsonb(NEW);
    FOR k IN SELECT jsonb_object_keys(new_j) LOOP
      IF k NOT IN ('status', 'updated_at', 'closed_at')
         AND (new_j -> k) IS DISTINCT FROM (old_j -> k) THEN
        RAISE EXCEPTION 'Vendors may only update the order status (blocked column: %)', k;
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not allowed to update this order';
END;
$function$;

-- 3) products: no self-approval (policy hardening + trigger already in place)
DROP POLICY IF EXISTS "products_vendor_update" ON public.products;
CREATE POLICY "products_vendor_update"
ON public.products FOR UPDATE TO authenticated
USING (vendor_id = auth.uid())
WITH CHECK (
  vendor_id = auth.uid()
  AND status <> 'approved'::product_status
);

-- 4) profiles: block additional privileged columns
CREATE OR REPLACE FUNCTION public.guard_profiles_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_admin boolean := public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid());
BEGIN
  IF auth.uid() IS NULL OR is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.vendor_status IS DISTINCT FROM OLD.vendor_status
     OR NEW.vendor_mode IS DISTINCT FROM OLD.vendor_mode
     OR NEW.access_starts_at IS DISTINCT FROM OLD.access_starts_at
     OR NEW.access_ends_at IS DISTINCT FROM OLD.access_ends_at
     OR NEW.blocked_at IS DISTINCT FROM OLD.blocked_at
     OR NEW.managed_by_admin_id IS DISTINCT FROM OLD.managed_by_admin_id
     OR NEW.is_admin_shop IS DISTINCT FROM OLD.is_admin_shop THEN
    RAISE EXCEPTION 'Cannot self-update privilege columns';
  END IF;

  RETURN NEW;
END;
$function$;

-- 5) reviews: strict immutability + vendor response-only (trigger enforced)
CREATE OR REPLACE FUNCTION public.guard_product_reviews_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_admin boolean := (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::app_role));
  is_owner boolean := (auth.uid() = OLD.user_id);
  is_vendor boolean := EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = OLD.product_id AND p.vendor_id = auth.uid()
  );
  old_j jsonb;
  new_j jsonb;
  k text;
BEGIN
  IF auth.uid() IS NULL OR is_admin THEN
    RETURN NEW;
  END IF;

  -- Identity columns are immutable for everyone but admins
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Cannot reassign product_id, order_id or user_id on a review';
  END IF;

  IF is_vendor AND NOT is_owner THEN
    old_j := to_jsonb(OLD);
    new_j := to_jsonb(NEW);
    FOR k IN SELECT jsonb_object_keys(new_j) LOOP
      IF k NOT IN ('vendor_response', 'vendor_response_at', 'updated_at')
         AND (new_j -> k) IS DISTINCT FROM (old_j -> k) THEN
        RAISE EXCEPTION 'Vendors may only update vendor_response fields (blocked column: %)', k;
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  IF is_owner THEN
    IF NEW.vendor_response IS DISTINCT FROM OLD.vendor_response
       OR NEW.vendor_response_at IS DISTINCT FROM OLD.vendor_response_at THEN
      RAISE EXCEPTION 'Only the vendor may write a vendor response';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not allowed to update this review';
END;
$function$;

-- 6) search_path hardening on remaining functions
ALTER FUNCTION public.tg_set_updated_at() SET search_path = public;
ALTER FUNCTION public.tg_order_article_states_bump() SET search_path = public;
ALTER FUNCTION public.update_addresses_updated_at() SET search_path = public;
ALTER FUNCTION public.sync_hide_contact_on_mode() SET search_path = public;
ALTER FUNCTION public.migrate_customer_addresses() SET search_path = public;
ALTER FUNCTION public.tg_auto_expire_vendor() SET search_path = public;

-- 7) revoke EXECUTE on privileged SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.apply_currency_recompute(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.preview_currency_recompute(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_currency(text, text, text, integer, integer, numeric, numeric, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_currency_rate(text, numeric, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_stock_delta(uuid, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_admin_action(text, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_vendor_product_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_sav_counts(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.purge_old_read_notifications() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kawscan_next_internal_code(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.taobao_session_load(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.taobao_session_clear() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.taobao_session_mark_expired() FROM anon, authenticated;
