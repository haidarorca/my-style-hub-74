
-- 1. Archive flag on orders (additive, nullable)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS shipping_service_id uuid NULL,
  ADD COLUMN IF NOT EXISTS shipping_estimate_note text NULL;

CREATE INDEX IF NOT EXISTS idx_orders_active_not_archived
  ON public.orders (created_at DESC)
  WHERE archived_at IS NULL;

-- 2. Product flag (additive, default false → no impact on existing products)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS requires_international_shipping boolean NOT NULL DEFAULT false;

-- 3. Shipment assessments additions
ALTER TABLE public.order_shipment_assessments
  ADD COLUMN IF NOT EXISTS shipping_service_id uuid NULL,
  ADD COLUMN IF NOT EXISTS price_per_kg_snapshot numeric NULL;

-- 4. New shipping_services table
CREATE TABLE IF NOT EXISTS public.shipping_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  source_country_id uuid NULL,
  destination_country_id uuid NULL,
  price_per_kg numeric NOT NULL DEFAULT 0,
  pricing_unit text NOT NULL DEFAULT 'kg',
  delay_min_days integer NULL,
  delay_max_days integer NULL,
  description text NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shipping_services_pricing_unit_chk CHECK (pricing_unit IN ('kg','m3'))
);

ALTER TABLE public.shipping_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shipping_services_public_read ON public.shipping_services;
CREATE POLICY shipping_services_public_read
  ON public.shipping_services FOR SELECT
  USING (true);

DROP POLICY IF EXISTS shipping_services_admin_write ON public.shipping_services;
CREATE POLICY shipping_services_admin_write
  ON public.shipping_services FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_shipping_services_updated_at ON public.shipping_services;
CREATE TRIGGER trg_shipping_services_updated_at
  BEFORE UPDATE ON public.shipping_services
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_shipping_services_route
  ON public.shipping_services (source_country_id, destination_country_id)
  WHERE is_enabled = true;
