-- ════════════════════════════════════════════════════════════
-- 1) LOGISTIQUE PAR VARIANTE
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS weight_kg          numeric(10,3),
  ADD COLUMN IF NOT EXISTS length_cm          numeric(10,2),
  ADD COLUMN IF NOT EXISTS width_cm           numeric(10,2),
  ADD COLUMN IF NOT EXISTS height_cm          numeric(10,2),
  ADD COLUMN IF NOT EXISTS cost_price         numeric(14,4),
  ADD COLUMN IF NOT EXISTS cost_currency_code text,
  ADD COLUMN IF NOT EXISTS supplier_ref       text,
  ADD COLUMN IF NOT EXISTS supplier_sku       text,
  ADD COLUMN IF NOT EXISTS external_variant_id text;

-- CBM calculé automatiquement : cm x cm x cm / 1 000 000 = m3
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS volume_cbm numeric(14,6)
  GENERATED ALWAYS AS (
    CASE
      WHEN length_cm IS NOT NULL AND width_cm IS NOT NULL AND height_cm IS NOT NULL
           AND length_cm > 0 AND width_cm > 0 AND height_cm > 0
      THEN ROUND((length_cm * width_cm * height_cm) / 1000000.0, 6)
      ELSE NULL
    END
  ) STORED;

ALTER TABLE public.product_variants
  DROP CONSTRAINT IF EXISTS product_variants_dims_positive_chk;
ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_dims_positive_chk CHECK (
    (weight_kg IS NULL OR weight_kg >= 0) AND
    (length_cm IS NULL OR length_cm >= 0) AND
    (width_cm  IS NULL OR width_cm  >= 0) AND
    (height_cm IS NULL OR height_cm >= 0) AND
    (cost_price IS NULL OR cost_price >= 0)
  );

-- ════════════════════════════════════════════════════════════
-- 2) PRODUIT : volume calculé + coût d'achat + référence fournisseur
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price         numeric(14,4),
  ADD COLUMN IF NOT EXISTS cost_currency_code text,
  ADD COLUMN IF NOT EXISTS supplier_ref       text,
  ADD COLUMN IF NOT EXISTS external_product_id text;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS volume_cbm numeric(14,6)
  GENERATED ALWAYS AS (
    CASE
      WHEN length_cm IS NOT NULL AND width_cm IS NOT NULL AND height_cm IS NOT NULL
           AND length_cm > 0 AND width_cm > 0 AND height_cm > 0
      THEN ROUND((length_cm::numeric * width_cm::numeric * height_cm::numeric) / 1000000.0, 6)
      ELSE NULL
    END
  ) STORED;

-- ════════════════════════════════════════════════════════════
-- 3) SOCIÉTÉS DE TRANSPORT
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.logistics_companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  country_id  uuid REFERENCES public.countries(id) ON DELETE SET NULL,
  contact     text,
  note        text,
  is_enabled  boolean NOT NULL DEFAULT true,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.logistics_companies TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.logistics_companies TO authenticated;
GRANT ALL ON public.logistics_companies TO service_role;

ALTER TABLE public.logistics_companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "logistics_companies_public_read" ON public.logistics_companies;
CREATE POLICY "logistics_companies_public_read"
  ON public.logistics_companies FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "logistics_companies_admin_write" ON public.logistics_companies;
CREATE POLICY "logistics_companies_admin_write"
  ON public.logistics_companies FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_logistics_companies_updated_at ON public.logistics_companies;
CREATE TRIGGER trg_logistics_companies_updated_at
  BEFORE UPDATE ON public.logistics_companies
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ════════════════════════════════════════════════════════════
-- 4) RÈGLES TARIFAIRES PAR MODE DE TRANSPORT
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.shipping_services
  ADD COLUMN IF NOT EXISTS mode                text NOT NULL DEFAULT 'air',
  ADD COLUMN IF NOT EXISTS company_id          uuid REFERENCES public.logistics_companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price_per_cbm       numeric(14,2),
  ADD COLUMN IF NOT EXISTS min_billable_qty    numeric(10,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS volumetric_divisor  integer NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS use_volumetric      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS fixed_fee           numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.shipping_services
  DROP CONSTRAINT IF EXISTS shipping_services_mode_chk;
ALTER TABLE public.shipping_services
  ADD CONSTRAINT shipping_services_mode_chk
  CHECK (mode IN ('air','sea','road','express','other'));

ALTER TABLE public.shipping_services
  DROP CONSTRAINT IF EXISTS shipping_services_divisor_chk;
ALTER TABLE public.shipping_services
  ADD CONSTRAINT shipping_services_divisor_chk
  CHECK (volumetric_divisor > 0 AND min_billable_qty >= 0 AND fixed_fee >= 0);

-- Aligne les services existants : pricing_unit 'm3' => mode maritime, kg => aérien.
UPDATE public.shipping_services
   SET mode = CASE WHEN pricing_unit = 'm3' THEN 'sea' ELSE 'air' END
 WHERE mode = 'air' AND pricing_unit = 'm3';

-- Un service facturé au m3 doit porter son tarif au m3 : on reprend price_per_kg
-- si price_per_cbm n'a jamais été renseigné (aucune donnée perdue).
UPDATE public.shipping_services
   SET price_per_cbm = price_per_kg
 WHERE pricing_unit = 'm3' AND price_per_cbm IS NULL;

-- Le maritime n'utilise pas le poids volumétrique.
UPDATE public.shipping_services
   SET use_volumetric = false
 WHERE pricing_unit = 'm3';

-- ════════════════════════════════════════════════════════════
-- 5) SNAPSHOTS IMMUABLES SUR LES LIGNES DE COMMANDE
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS sku_snapshot            text,
  ADD COLUMN IF NOT EXISTS variant_label_snapshot  text,
  ADD COLUMN IF NOT EXISTS unit_weight_kg          numeric(10,3),
  ADD COLUMN IF NOT EXISTS total_weight_kg         numeric(12,3),
  ADD COLUMN IF NOT EXISTS length_cm_snapshot      numeric(10,2),
  ADD COLUMN IF NOT EXISTS width_cm_snapshot       numeric(10,2),
  ADD COLUMN IF NOT EXISTS height_cm_snapshot      numeric(10,2),
  ADD COLUMN IF NOT EXISTS unit_cbm                numeric(14,6),
  ADD COLUMN IF NOT EXISTS total_cbm               numeric(14,6),
  ADD COLUMN IF NOT EXISTS volumetric_weight_kg    numeric(12,3),
  ADD COLUMN IF NOT EXISTS billable_qty            numeric(14,3),
  ADD COLUMN IF NOT EXISTS billing_unit            text,
  ADD COLUMN IF NOT EXISTS shipping_mode           text,
  ADD COLUMN IF NOT EXISTS shipping_service_id     uuid REFERENCES public.shipping_services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shipping_rate_snapshot  numeric(14,2),
  ADD COLUMN IF NOT EXISTS volumetric_divisor_snapshot integer,
  ADD COLUMN IF NOT EXISTS min_billable_qty_snapshot   numeric(10,3),
  ADD COLUMN IF NOT EXISTS freight_cost            numeric(14,2),
  ADD COLUMN IF NOT EXISTS logistics_data_missing  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cost_price_snapshot     numeric(14,4),
  ADD COLUMN IF NOT EXISTS cost_currency_snapshot  text,
  ADD COLUMN IF NOT EXISTS cost_rate_snapshot      numeric(18,8),
  ADD COLUMN IF NOT EXISTS purchase_cost_total     numeric(14,2),
  ADD COLUMN IF NOT EXISTS other_costs             numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_total              numeric(14,2);

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_billing_unit_chk;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_billing_unit_chk
  CHECK (billing_unit IS NULL OR billing_unit IN ('kg','m3'));

-- ════════════════════════════════════════════════════════════
-- 6) TOTAUX SÉPARÉS SUR LA COMMANDE
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS products_total       numeric(14,2),
  ADD COLUMN IF NOT EXISTS shipping_total       numeric(14,2),
  ADD COLUMN IF NOT EXISTS other_fees_total     numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_cost_total  numeric(14,2),
  ADD COLUMN IF NOT EXISTS logistics_cost_total numeric(14,2),
  ADD COLUMN IF NOT EXISTS other_costs_total    numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margin_total         numeric(14,2);

-- ════════════════════════════════════════════════════════════
-- 7) PROTECTION DES SNAPSHOTS : une ancienne commande ne change plus
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.protect_order_item_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Les snapshots ne peuvent être écrits qu'une seule fois (NULL -> valeur).
  NEW.unit_price                  := OLD.unit_price;
  NEW.quantity                    := OLD.quantity;
  NEW.sku_snapshot                := COALESCE(OLD.sku_snapshot, NEW.sku_snapshot);
  NEW.variant_label_snapshot      := COALESCE(OLD.variant_label_snapshot, NEW.variant_label_snapshot);
  NEW.unit_weight_kg              := COALESCE(OLD.unit_weight_kg, NEW.unit_weight_kg);
  NEW.total_weight_kg             := COALESCE(OLD.total_weight_kg, NEW.total_weight_kg);
  NEW.length_cm_snapshot          := COALESCE(OLD.length_cm_snapshot, NEW.length_cm_snapshot);
  NEW.width_cm_snapshot           := COALESCE(OLD.width_cm_snapshot, NEW.width_cm_snapshot);
  NEW.height_cm_snapshot          := COALESCE(OLD.height_cm_snapshot, NEW.height_cm_snapshot);
  NEW.unit_cbm                    := COALESCE(OLD.unit_cbm, NEW.unit_cbm);
  NEW.total_cbm                   := COALESCE(OLD.total_cbm, NEW.total_cbm);
  NEW.volumetric_weight_kg        := COALESCE(OLD.volumetric_weight_kg, NEW.volumetric_weight_kg);
  NEW.volumetric_divisor_snapshot := COALESCE(OLD.volumetric_divisor_snapshot, NEW.volumetric_divisor_snapshot);
  NEW.min_billable_qty_snapshot   := COALESCE(OLD.min_billable_qty_snapshot, NEW.min_billable_qty_snapshot);
  NEW.cost_price_snapshot         := COALESCE(OLD.cost_price_snapshot, NEW.cost_price_snapshot);
  NEW.cost_currency_snapshot      := COALESCE(OLD.cost_currency_snapshot, NEW.cost_currency_snapshot);
  NEW.cost_rate_snapshot          := COALESCE(OLD.cost_rate_snapshot, NEW.cost_rate_snapshot);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_order_item_snapshots ON public.order_items;
CREATE TRIGGER trg_protect_order_item_snapshots
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.protect_order_item_snapshots();

CREATE INDEX IF NOT EXISTS idx_order_items_shipping_service
  ON public.order_items(shipping_service_id);
CREATE INDEX IF NOT EXISTS idx_shipping_services_mode
  ON public.shipping_services(mode) WHERE is_enabled;