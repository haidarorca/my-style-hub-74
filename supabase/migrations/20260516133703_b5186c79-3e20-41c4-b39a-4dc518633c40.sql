
-- ============================================================
-- 1) INDEXES (idempotent via IF NOT EXISTS)
-- ============================================================

-- products
CREATE INDEX IF NOT EXISTS idx_products_status_vendor ON public.products (status, vendor_id);
CREATE INDEX IF NOT EXISTS idx_products_category_approved ON public.products (category_id) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_products_created_at ON public.products (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_vendor_created ON public.products (vendor_id, created_at DESC);

-- orders
CREATE INDEX IF NOT EXISTS idx_orders_buyer_created ON public.orders (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON public.orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_destination ON public.orders (destination_country_id);
CREATE INDEX IF NOT EXISTS idx_orders_commission ON public.orders (created_at DESC) WHERE is_commission = true;

-- order_items
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_vendor_created ON public.order_items (vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_buyer ON public.order_items (buyer_id);

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_vendor_active ON public.profiles (vendor_status) WHERE vendor_status = 'active'::public.vendor_account_status AND is_verified = true;
CREATE INDEX IF NOT EXISTS idx_profiles_source_country ON public.profiles (source_country_id);

-- user_roles
CREATE INDEX IF NOT EXISTS idx_user_roles_role_active ON public.user_roles (role) WHERE is_suspended = false;
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role ON public.user_roles (user_id, role);

-- customer_addresses
CREATE INDEX IF NOT EXISTS idx_addresses_user_default ON public.customer_addresses (user_id, is_default DESC);

-- notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id, is_read, created_at DESC);

-- product_reviews
CREATE INDEX IF NOT EXISTS idx_reviews_product_created ON public.product_reviews (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON public.product_reviews (user_id);

-- categories (parent navigation)
CREATE INDEX IF NOT EXISTS idx_categories_parent ON public.categories (parent_id);

-- ============================================================
-- 2) TRANSLATION HASH COLUMNS
-- ============================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS translated_hash text;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS translated_hash text;

ALTER TABLE public.countries
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS translated_hash text;

-- Helper: compute hash of source text fields
CREATE OR REPLACE FUNCTION public.compute_product_content_hash(_name text, _designation text, _description text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT md5(coalesce(_name,'') || '|' || coalesce(_designation,'') || '|' || coalesce(_description,''))
$$;

CREATE OR REPLACE FUNCTION public.compute_text_hash(_t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT md5(coalesce(_t,''))
$$;

-- Triggers to keep content_hash fresh
CREATE OR REPLACE FUNCTION public.tg_products_content_hash()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.content_hash := public.compute_product_content_hash(NEW.name, NEW.designation, NEW.description);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_products_content_hash ON public.products;
CREATE TRIGGER trg_products_content_hash
BEFORE INSERT OR UPDATE OF name, designation, description ON public.products
FOR EACH ROW EXECUTE FUNCTION public.tg_products_content_hash();

CREATE OR REPLACE FUNCTION public.tg_categories_content_hash()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.content_hash := public.compute_text_hash(NEW.name);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_categories_content_hash ON public.categories;
CREATE TRIGGER trg_categories_content_hash
BEFORE INSERT OR UPDATE OF name ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.tg_categories_content_hash();

CREATE OR REPLACE FUNCTION public.tg_countries_content_hash()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.content_hash := public.compute_text_hash(NEW.name);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_countries_content_hash ON public.countries;
CREATE TRIGGER trg_countries_content_hash
BEFORE INSERT OR UPDATE OF name ON public.countries
FOR EACH ROW EXECUTE FUNCTION public.tg_countries_content_hash();

-- Backfill existing rows
UPDATE public.products SET content_hash = public.compute_product_content_hash(name, designation, description) WHERE content_hash IS NULL;
UPDATE public.categories SET content_hash = public.compute_text_hash(name) WHERE content_hash IS NULL;
UPDATE public.countries SET content_hash = public.compute_text_hash(name) WHERE content_hash IS NULL;

-- Partial indexes: only rows needing translation
CREATE INDEX IF NOT EXISTS idx_products_translation_pending
  ON public.products (updated_at DESC)
  WHERE translated_hash IS NULL OR translated_hash IS DISTINCT FROM content_hash;

CREATE INDEX IF NOT EXISTS idx_categories_translation_pending
  ON public.categories (id)
  WHERE translated_hash IS NULL OR translated_hash IS DISTINCT FROM content_hash;

CREATE INDEX IF NOT EXISTS idx_countries_translation_pending
  ON public.countries (id)
  WHERE translated_hash IS NULL OR translated_hash IS DISTINCT FROM content_hash;

-- ============================================================
-- 3) ADMIN STATS CACHE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_stats_cache (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_stats_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_stats_cache_read ON public.admin_stats_cache;
CREATE POLICY admin_stats_cache_read ON public.admin_stats_cache
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS admin_stats_cache_write ON public.admin_stats_cache;
CREATE POLICY admin_stats_cache_write ON public.admin_stats_cache
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
