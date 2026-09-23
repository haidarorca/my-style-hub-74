-- ═══════════════════════════════════════════════════════════════
-- Intégration commandes CJ — socle de données (idempotent)
-- ═══════════════════════════════════════════════════════════════

-- 1. Référence de commande stable -------------------------------
CREATE SEQUENCE IF NOT EXISTS public.order_reference_seq;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reference text;

CREATE OR REPLACE FUNCTION public.next_order_reference()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'KW-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.order_reference_seq')::text, 6, '0');
$$;

-- Backfill des commandes existantes, dans l'ordre chronologique.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.orders WHERE reference IS NULL ORDER BY created_at ASC LOOP
    UPDATE public.orders SET reference = public.next_order_reference() WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS orders_reference_key ON public.orders (reference);

CREATE OR REPLACE FUNCTION public.tg_orders_set_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.reference IS NULL THEN
      NEW.reference := public.next_order_reference();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- La référence ne change JAMAIS après création.
    IF OLD.reference IS NOT NULL AND NEW.reference IS DISTINCT FROM OLD.reference THEN
      NEW.reference := OLD.reference;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_set_reference ON public.orders;
CREATE TRIGGER trg_orders_set_reference
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_orders_set_reference();

-- 2. État CJ sur la commande ------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cj_order_id text,
  ADD COLUMN IF NOT EXISTS cj_order_number text,
  ADD COLUMN IF NOT EXISTS cj_shipment_order_id text,
  ADD COLUMN IF NOT EXISTS cj_order_status text,
  ADD COLUMN IF NOT EXISTS cj_payment_status text,
  ADD COLUMN IF NOT EXISTS cj_logistic_name text,
  ADD COLUMN IF NOT EXISTS cj_tracking_number text,
  ADD COLUMN IF NOT EXISTS cj_tracking_provider text,
  ADD COLUMN IF NOT EXISTS cj_tracking_url text,
  ADD COLUMN IF NOT EXISTS cj_order_amount numeric(14,4),
  ADD COLUMN IF NOT EXISTS cj_is_sandbox boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cj_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS cj_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS cj_shipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS cj_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS cj_last_error text;

CREATE INDEX IF NOT EXISTS orders_cj_order_id_idx ON public.orders (cj_order_id) WHERE cj_order_id IS NOT NULL;

-- 3. Identifiants CJ figés sur la ligne de commande --------------
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS cj_product_id text,
  ADD COLUMN IF NOT EXISTS cj_variant_id text,
  ADD COLUMN IF NOT EXISTS cj_variant_sku text;

CREATE OR REPLACE FUNCTION public.tg_order_items_stamp_cj_ids()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.cj_product_id IS NULL AND NEW.product_id IS NOT NULL THEN
    SELECT cp.cj_product_id INTO NEW.cj_product_id
    FROM public.cj_products cp WHERE cp.product_id = NEW.product_id LIMIT 1;
  END IF;
  IF NEW.variant_id IS NOT NULL THEN
    IF NEW.cj_variant_id IS NULL THEN
      SELECT v.external_variant_id INTO NEW.cj_variant_id
      FROM public.product_variants v WHERE v.id = NEW.variant_id;
    END IF;
    IF NEW.cj_variant_sku IS NULL THEN
      SELECT v.supplier_sku INTO NEW.cj_variant_sku
      FROM public.product_variants v WHERE v.id = NEW.variant_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_order_items_stamp_cj_ids ON public.order_items;
CREATE TRIGGER trg_order_items_stamp_cj_ids
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_order_items_stamp_cj_ids();

-- Backfill des lignes existantes (données réelles uniquement).
UPDATE public.order_items oi
SET cj_product_id = cp.cj_product_id
FROM public.cj_products cp
WHERE cp.product_id = oi.product_id AND oi.cj_product_id IS NULL;

UPDATE public.order_items oi
SET cj_variant_id = v.external_variant_id,
    cj_variant_sku = COALESCE(oi.cj_variant_sku, v.supplier_sku)
FROM public.product_variants v
WHERE v.id = oi.variant_id AND oi.cj_variant_id IS NULL;

-- 4. Adresse de réception CJ (notre entrepôt en Chine) ----------
CREATE TABLE IF NOT EXISTS public.cj_warehouse_address (
  id text PRIMARY KEY DEFAULT 'default',
  label text NOT NULL DEFAULT 'Entrepôt Chine',
  contact_name text,
  phone text,
  country_code text NOT NULL DEFAULT 'CN',
  country_name text NOT NULL DEFAULT 'China',
  province text,
  city text,
  county text,
  address text,
  address2 text,
  zip text,
  email text,
  notes text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cj_warehouse_address TO authenticated;
GRANT ALL ON public.cj_warehouse_address TO service_role;

ALTER TABLE public.cj_warehouse_address ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cj_warehouse_address_admin_all" ON public.cj_warehouse_address;
CREATE POLICY "cj_warehouse_address_admin_all"
  ON public.cj_warehouse_address FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_cj_warehouse_address_updated ON public.cj_warehouse_address;
CREATE TRIGGER trg_cj_warehouse_address_updated
  BEFORE UPDATE ON public.cj_warehouse_address
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

INSERT INTO public.cj_warehouse_address (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- 5. Journal des appels de commande CJ --------------------------
CREATE TABLE IF NOT EXISTS public.cj_order_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  action text NOT NULL,
  endpoint text,
  http_status integer,
  cj_code integer,
  cj_message text,
  success boolean NOT NULL DEFAULT false,
  request_payload jsonb,
  response_payload jsonb,
  latency_ms integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cj_order_log_order_idx ON public.cj_order_log (order_id, created_at DESC);

GRANT SELECT ON public.cj_order_log TO authenticated;
GRANT ALL ON public.cj_order_log TO service_role;

ALTER TABLE public.cj_order_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cj_order_log_admin_read" ON public.cj_order_log;
CREATE POLICY "cj_order_log_admin_read"
  ON public.cj_order_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));