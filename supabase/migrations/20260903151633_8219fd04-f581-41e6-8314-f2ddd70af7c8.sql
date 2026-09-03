-- 1) geo_regions / geo_cities: allow public read
DROP POLICY IF EXISTS "Authenticated users can read cities" ON public.geo_cities;
DROP POLICY IF EXISTS "Authenticated users can read regions" ON public.geo_regions;
CREATE POLICY "Anyone can read cities" ON public.geo_cities FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can read regions" ON public.geo_regions FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.geo_cities TO anon;
GRANT SELECT ON public.geo_regions TO anon;

-- 2) order_shipment_assessments: strict whitelist for buyers
CREATE OR REPLACE FUNCTION public.protect_shipment_assessment_client_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  k text;
BEGIN
  IF v_uid IS NULL OR public.has_role(v_uid, 'admin'::app_role) OR public.is_super_admin(v_uid) THEN
    RETURN NEW;
  END IF;

  -- Le client (acheteur) ne peut modifier QUE ces colonnes
  FOR k IN
    SELECT key FROM jsonb_each(to_jsonb(NEW))
    WHERE to_jsonb(NEW)->key IS DISTINCT FROM to_jsonb(OLD)->key
  LOOP
    IF k NOT IN ('status','client_response_note','client_validated_at','client_rejected_at','updated_at') THEN
      RAISE EXCEPTION 'Les clients ne peuvent modifier que leur validation/refus.';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS osa_buyer_validate ON public.order_shipment_assessments;
CREATE POLICY osa_buyer_validate ON public.order_shipment_assessments
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM orders o WHERE o.id = order_shipment_assessments.order_id AND o.buyer_id = auth.uid())
  AND status = 'awaiting_client_validation'::shipment_assessment_status
)
WITH CHECK (
  EXISTS (SELECT 1 FROM orders o WHERE o.id = order_shipment_assessments.order_id AND o.buyer_id = auth.uid())
  AND status = ANY (ARRAY['validated'::shipment_assessment_status, 'rejected'::shipment_assessment_status])
);

-- 3) orders: vendor may only touch status (trigger enforces, policy simplified)
CREATE OR REPLACE FUNCTION public.guard_orders_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  k text;
BEGIN
  IF v_uid IS NULL OR public.has_role(v_uid, 'admin'::app_role) OR public.is_super_admin(v_uid) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = OLD.id AND oi.vendor_id = v_uid) THEN
    FOR k IN
      SELECT key FROM jsonb_each(to_jsonb(NEW))
      WHERE to_jsonb(NEW)->key IS DISTINCT FROM to_jsonb(OLD)->key
    LOOP
      IF k NOT IN ('status','updated_at','closed_at') THEN
        RAISE EXCEPTION 'Un vendeur ne peut modifier que le statut de la commande (champ interdit: %).', k;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS orders_vendor_update_status ON public.orders;
CREATE POLICY orders_vendor_update_status ON public.orders
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = orders.id AND oi.vendor_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = orders.id AND oi.vendor_id = auth.uid()));

-- 4) products: vendor cannot self-approve nor touch moderation fields
CREATE OR REPLACE FUNCTION public.guard_products_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'approved'::product_status THEN
      RAISE EXCEPTION 'Un vendeur ne peut pas approuver son propre produit.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS products_vendor_update ON public.products;
CREATE POLICY products_vendor_update ON public.products
FOR UPDATE TO authenticated
USING (vendor_id = auth.uid())
WITH CHECK (vendor_id = auth.uid() AND status <> 'approved'::product_status);

-- 5) profiles: sensitive columns immutable by owner (trigger is the guarantee)
CREATE OR REPLACE FUNCTION public.guard_profiles_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR public.has_role(v_uid, 'admin'::app_role) OR public.is_super_admin(v_uid) THEN
    RETURN NEW;
  END IF;

  IF OLD.id = v_uid THEN
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
       OR NEW.vendor_status IS DISTINCT FROM OLD.vendor_status
       OR NEW.vendor_mode IS DISTINCT FROM OLD.vendor_mode
       OR NEW.access_starts_at IS DISTINCT FROM OLD.access_starts_at
       OR NEW.access_ends_at IS DISTINCT FROM OLD.access_ends_at
       OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
       OR NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason
       OR NEW.blocked_at IS DISTINCT FROM OLD.blocked_at
       OR NEW.blocked_reason IS DISTINCT FROM OLD.blocked_reason
       OR NEW.managed_by_admin_id IS DISTINCT FROM OLD.managed_by_admin_id
       OR NEW.is_admin_shop IS DISTINCT FROM OLD.is_admin_shop THEN
      RAISE EXCEPTION 'Ces champs ne peuvent être modifiés que par un administrateur.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 6) product_reviews: identity immutable; vendor may only write its response
CREATE OR REPLACE FUNCTION public.guard_product_reviews_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  is_owner boolean;
  is_vendor boolean;
  k text;
BEGIN
  IF v_uid IS NULL OR public.has_role(v_uid, 'admin'::app_role) OR public.is_super_admin(v_uid) THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'L''identité d''un avis (produit, commande, auteur) est immuable.';
  END IF;

  is_owner := (OLD.user_id = v_uid);
  is_vendor := EXISTS (SELECT 1 FROM products p WHERE p.id = OLD.product_id AND p.vendor_id = v_uid);

  IF is_vendor AND NOT is_owner THEN
    FOR k IN
      SELECT key FROM jsonb_each(to_jsonb(NEW))
      WHERE to_jsonb(NEW)->key IS DISTINCT FROM to_jsonb(OLD)->key
    LOOP
      IF k NOT IN ('vendor_response','vendor_response_at','updated_at') THEN
        RAISE EXCEPTION 'Un vendeur ne peut modifier que sa réponse (champ interdit: %).', k;
      END IF;
    END LOOP;
  ELSIF is_owner THEN
    IF NEW.vendor_response IS DISTINCT FROM OLD.vendor_response
       OR NEW.vendor_response_at IS DISTINCT FROM OLD.vendor_response_at THEN
      RAISE EXCEPTION 'La réponse du vendeur ne peut pas être modifiée par le client.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS reviews_self_update ON public.product_reviews;
CREATE POLICY reviews_self_update ON public.product_reviews
FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS reviews_vendor_reply ON public.product_reviews;
CREATE POLICY reviews_vendor_reply ON public.product_reviews
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM products p WHERE p.id = product_reviews.product_id AND p.vendor_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM products p WHERE p.id = product_reviews.product_id AND p.vendor_id = auth.uid()));

-- 7) SECURITY DEFINER functions: revoke blanket EXECUTE, re-grant only where needed
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- 7a) helpers used inside RLS policies / public reads: anon + authenticated
GRANT EXECUTE ON FUNCTION
  public.has_role(uuid, app_role),
  public.is_super_admin(uuid),
  public.has_admin_permission(uuid, admin_permission),
  public.can_insert_order_item(uuid, uuid),
  public.user_can(uuid, text, text),
  public.user_has_role_key(uuid, text),
  public.vendor_publicly_visible(uuid),
  public.vendor_is_active(uuid),
  public.vendor_contacts_visible(uuid),
  public.resolve_contact_policy(uuid, uuid),
  public.resolve_commission(uuid),
  public.resolve_commission(uuid, uuid),
  public.convert_amount(numeric, text, text),
  public.current_currency_rate(text),
  public.get_category_product_counts(),
  public.get_deliverable_vendor_ids(uuid),
  public.get_display_prices(uuid[], uuid),
  public.get_display_price_lines_batch(jsonb, uuid),
  public.get_product_display_price(uuid, uuid, uuid),
  public.get_shop_product_stats(uuid),
  public.increment_product_view(uuid),
  public.kawscan_lookup(text, text),
  public.kawscan_public_store(text)
TO anon, authenticated;

-- 7b) signed-in only operations (each checks permissions internally)
GRANT EXECUTE ON FUNCTION
  public.current_user_can(text, text),
  public.current_user_has_permission(admin_permission),
  public.current_user_has_role(app_role),
  public.apply_stock_delta(uuid, integer, text),
  public.create_imported_product_atomic(uuid, text, text, text, text, text, text, numeric, uuid, jsonb, jsonb),
  public.product_code_exists_in_shop(uuid, text, uuid),
  public.get_admin_vendor_product_stats(),
  public.get_sav_counts(text),
  public.log_admin_action(text, text, text, jsonb),
  public.log_return_case_action(uuid, text, jsonb),
  public.next_return_case_code(return_case_kind),
  public.open_return_case_for_item(uuid, uuid, return_case_kind, integer, numeric, text, text),
  public.open_return_case_for_items(uuid, return_case_kind, jsonb, text, text),
  public.recalc_return_case_suggested(uuid),
  public.kawscan_is_admin(uuid),
  public.kawscan_is_owner(uuid, uuid),
  public.kawscan_can_manage(uuid, uuid),
  public.kawscan_next_internal_code(uuid),
  public.apply_currency_recompute(text),
  public.preview_currency_recompute(text),
  public.create_currency(text, text, text, integer, integer, numeric, numeric, boolean),
  public.update_currency(text, text, text, integer, integer, boolean),
  public.set_currency_rate(text, numeric, numeric, text)
TO authenticated;