-- ============ KAWSCAN : prix en magasin ============

CREATE TABLE public.kawscan_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  currency_code text NOT NULL DEFAULT 'XOF',
  display_name text,
  logo_url text,
  show_home_button boolean NOT NULL DEFAULT false,
  show_back_button boolean NOT NULL DEFAULT true,
  show_kawzone_link boolean NOT NULL DEFAULT false,
  show_kawzone_logo boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.kawscan_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL UNIQUE REFERENCES public.kawscan_stores(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'suspended',
  starts_at timestamptz,
  ends_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.kawscan_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.kawscan_stores(id) ON DELETE CASCADE,
  code text NOT NULL,
  code_kind text NOT NULL DEFAULT 'barcode',
  is_internal_code boolean NOT NULL DEFAULT false,
  name text,
  unit text NOT NULL DEFAULT 'piece',
  price numeric NOT NULL DEFAULT 0,
  currency_code text,
  promo_price numeric,
  promo_active boolean NOT NULL DEFAULT false,
  promo_starts_at timestamptz,
  promo_ends_at timestamptz,
  show_name_on_label boolean NOT NULL DEFAULT false,
  show_price_on_label boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, code)
);

CREATE TABLE public.kawscan_price_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.kawscan_products(id) ON DELETE CASCADE,
  label text NOT NULL,
  price numeric NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.kawscan_store_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.kawscan_stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'employee',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, user_id)
);

CREATE INDEX idx_kawscan_stores_owner ON public.kawscan_stores(owner_id);
CREATE INDEX idx_kawscan_products_store ON public.kawscan_products(store_id);
CREATE INDEX idx_kawscan_tiers_product ON public.kawscan_price_tiers(product_id);
CREATE INDEX idx_kawscan_store_users_user ON public.kawscan_store_users(user_id);

-- ---------- GRANTS ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kawscan_stores TO authenticated;
GRANT ALL ON public.kawscan_stores TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kawscan_subscriptions TO authenticated;
GRANT ALL ON public.kawscan_subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kawscan_products TO authenticated;
GRANT ALL ON public.kawscan_products TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kawscan_price_tiers TO authenticated;
GRANT ALL ON public.kawscan_price_tiers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kawscan_store_users TO authenticated;
GRANT ALL ON public.kawscan_store_users TO service_role;

-- ---------- HELPERS ----------
CREATE OR REPLACE FUNCTION public.kawscan_is_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (public.has_role(_uid, 'admin'::app_role) OR public.is_super_admin(_uid))
$$;

CREATE OR REPLACE FUNCTION public.kawscan_is_owner(_store_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.kawscan_stores s WHERE s.id = _store_id AND s.owner_id = _uid)
$$;

CREATE OR REPLACE FUNCTION public.kawscan_can_manage(_store_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.kawscan_is_admin(_uid)
      OR public.kawscan_is_owner(_store_id, _uid)
      OR EXISTS (SELECT 1 FROM public.kawscan_store_users su WHERE su.store_id = _store_id AND su.user_id = _uid)
$$;

-- ---------- RLS ----------
ALTER TABLE public.kawscan_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kawscan_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kawscan_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kawscan_price_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kawscan_store_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kawscan_stores_select" ON public.kawscan_stores FOR SELECT TO authenticated
  USING (public.kawscan_can_manage(id, auth.uid()));
CREATE POLICY "kawscan_stores_insert" ON public.kawscan_stores FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() OR public.kawscan_is_admin(auth.uid()));
CREATE POLICY "kawscan_stores_update" ON public.kawscan_stores FOR UPDATE TO authenticated
  USING (public.kawscan_can_manage(id, auth.uid()))
  WITH CHECK (public.kawscan_can_manage(id, auth.uid()));
CREATE POLICY "kawscan_stores_delete" ON public.kawscan_stores FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.kawscan_is_admin(auth.uid()));

CREATE POLICY "kawscan_subs_select" ON public.kawscan_subscriptions FOR SELECT TO authenticated
  USING (public.kawscan_can_manage(store_id, auth.uid()));
CREATE POLICY "kawscan_subs_admin_all" ON public.kawscan_subscriptions FOR ALL TO authenticated
  USING (public.kawscan_is_admin(auth.uid()))
  WITH CHECK (public.kawscan_is_admin(auth.uid()));

CREATE POLICY "kawscan_products_all" ON public.kawscan_products FOR ALL TO authenticated
  USING (public.kawscan_can_manage(store_id, auth.uid()))
  WITH CHECK (public.kawscan_can_manage(store_id, auth.uid()));

CREATE POLICY "kawscan_tiers_all" ON public.kawscan_price_tiers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.kawscan_products p WHERE p.id = product_id AND public.kawscan_can_manage(p.store_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.kawscan_products p WHERE p.id = product_id AND public.kawscan_can_manage(p.store_id, auth.uid())));

CREATE POLICY "kawscan_store_users_select" ON public.kawscan_store_users FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.kawscan_is_owner(store_id, auth.uid()) OR public.kawscan_is_admin(auth.uid()));
CREATE POLICY "kawscan_store_users_manage" ON public.kawscan_store_users FOR ALL TO authenticated
  USING (public.kawscan_is_owner(store_id, auth.uid()) OR public.kawscan_is_admin(auth.uid()))
  WITH CHECK (public.kawscan_is_owner(store_id, auth.uid()) OR public.kawscan_is_admin(auth.uid()));

-- ---------- TRIGGERS updated_at ----------
CREATE TRIGGER trg_kawscan_stores_updated BEFORE UPDATE ON public.kawscan_stores
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER trg_kawscan_subs_updated BEFORE UPDATE ON public.kawscan_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER trg_kawscan_products_updated BEFORE UPDATE ON public.kawscan_products
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER trg_kawscan_tiers_updated BEFORE UPDATE ON public.kawscan_price_tiers
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER trg_kawscan_store_users_updated BEFORE UPDATE ON public.kawscan_store_users
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ---------- LECTURE PUBLIQUE (client scanner, sans compte) ----------
CREATE OR REPLACE FUNCTION public.kawscan_public_store(_slug text)
RETURNS TABLE(
  id uuid, name text, display_name text, logo_url text, currency_code text,
  show_home_button boolean, show_back_button boolean,
  show_kawzone_link boolean, show_kawzone_logo boolean,
  access_state text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; sub record; state text;
BEGIN
  SELECT * INTO s FROM public.kawscan_stores WHERE slug = _slug;
  IF s.id IS NULL THEN RETURN; END IF;
  SELECT * INTO sub FROM public.kawscan_subscriptions WHERE store_id = s.id;

  IF NOT s.is_active THEN
    state := 'disabled';
  ELSIF sub.id IS NULL OR sub.status = 'suspended' THEN
    state := 'suspended';
  ELSIF sub.status <> 'active' THEN
    state := 'disabled';
  ELSIF sub.starts_at IS NOT NULL AND sub.starts_at > now() THEN
    state := 'not_started';
  ELSIF sub.ends_at IS NOT NULL AND sub.ends_at < now() THEN
    state := 'expired';
  ELSE
    state := 'ok';
  END IF;

  RETURN QUERY SELECT s.id, s.name, s.display_name, s.logo_url, s.currency_code,
    s.show_home_button, s.show_back_button, s.show_kawzone_link, s.show_kawzone_logo, state;
END;
$$;

CREATE OR REPLACE FUNCTION public.kawscan_lookup(_slug text, _code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE st record; p record; tiers jsonb; eff numeric; promo boolean := false;
BEGIN
  SELECT * INTO st FROM public.kawscan_public_store(_slug);
  IF st.id IS NULL THEN RETURN jsonb_build_object('error','store_not_found'); END IF;
  IF st.access_state <> 'ok' THEN RETURN jsonb_build_object('error', st.access_state); END IF;

  SELECT * INTO p FROM public.kawscan_products
   WHERE store_id = st.id AND lower(btrim(code)) = lower(btrim(_code)) AND is_active = true;
  IF p.id IS NULL THEN RETURN jsonb_build_object('error','code_not_found','code',_code); END IF;

  IF p.promo_active AND p.promo_price IS NOT NULL
     AND (p.promo_starts_at IS NULL OR p.promo_starts_at <= now())
     AND (p.promo_ends_at IS NULL OR p.promo_ends_at >= now()) THEN
    promo := true;
  END IF;
  eff := CASE WHEN promo THEN p.promo_price ELSE p.price END;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('label', t.label, 'price', t.price) ORDER BY t.position, t.label), '[]'::jsonb)
    INTO tiers FROM public.kawscan_price_tiers t WHERE t.product_id = p.id;

  RETURN jsonb_build_object(
    'code', p.code,
    'name', p.name,
    'unit', p.unit,
    'price', p.price,
    'promo', promo,
    'promo_price', p.promo_price,
    'effective_price', eff,
    'currency', COALESCE(p.currency_code, st.currency_code),
    'tiers', tiers
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.kawscan_public_store(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kawscan_lookup(text, text) TO anon, authenticated;
