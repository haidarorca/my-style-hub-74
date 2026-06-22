
-- ═════════════════════════════════════════════════════════════════
-- VAGUE 2 — Extension structurelle SAV
-- ═════════════════════════════════════════════════════════════════

-- 1) Extension des enums existants (ALTER TYPE ADD VALUE)
ALTER TYPE public.sav_case_type ADD VALUE IF NOT EXISTS 'repair';
ALTER TYPE public.sav_party ADD VALUE IF NOT EXISTS 'carrier';
ALTER TYPE public.sav_owner_party ADD VALUE IF NOT EXISTS 'carrier';
ALTER TYPE public.sav_rule_scope ADD VALUE IF NOT EXISTS 'source_country';

-- Nouvelles rule_keys
ALTER TYPE public.sav_rule_key ADD VALUE IF NOT EXISTS 'cancellation_policy';
ALTER TYPE public.sav_rule_key ADD VALUE IF NOT EXISTS 'import_returns_policy';
ALTER TYPE public.sav_rule_key ADD VALUE IF NOT EXISTS 'import_exchanges_policy';
ALTER TYPE public.sav_rule_key ADD VALUE IF NOT EXISTS 'disposition_default';
ALTER TYPE public.sav_rule_key ADD VALUE IF NOT EXISTS 'refund_policy';
ALTER TYPE public.sav_rule_key ADD VALUE IF NOT EXISTS 'exchange_size_free';
ALTER TYPE public.sav_rule_key ADD VALUE IF NOT EXISTS 'exchange_color_free';
ALTER TYPE public.sav_rule_key ADD VALUE IF NOT EXISTS 'exchange_variant_requires_approval';
ALTER TYPE public.sav_rule_key ADD VALUE IF NOT EXISTS 'exchange_different_product_requires_approval';
ALTER TYPE public.sav_rule_key ADD VALUE IF NOT EXISTS 'warranty_vendor_months';
ALTER TYPE public.sav_rule_key ADD VALUE IF NOT EXISTS 'warranty_manufacturer_months';
ALTER TYPE public.sav_rule_key ADD VALUE IF NOT EXISTS 'repair_allowed';
ALTER TYPE public.sav_rule_key ADD VALUE IF NOT EXISTS 'repair_pays_party';
ALTER TYPE public.sav_rule_key ADD VALUE IF NOT EXISTS 'fee_shipping_outbound_payer_default';
ALTER TYPE public.sav_rule_key ADD VALUE IF NOT EXISTS 'fee_shipping_return_payer_default';
ALTER TYPE public.sav_rule_key ADD VALUE IF NOT EXISTS 'fee_packaging_payer_default';
ALTER TYPE public.sav_rule_key ADD VALUE IF NOT EXISTS 'fee_preparation_payer_default';
ALTER TYPE public.sav_rule_key ADD VALUE IF NOT EXISTS 'fee_import_logistics_payer_default';
ALTER TYPE public.sav_rule_key ADD VALUE IF NOT EXISTS 'fee_handling_payer_default';
ALTER TYPE public.sav_rule_key ADD VALUE IF NOT EXISTS 'fee_restocking_payer_default';

-- 2) Nouveaux enums
DO $$ BEGIN
  CREATE TYPE public.sav_exchange_kind AS ENUM (
    'size_only', 'color_only', 'variant', 'different_product', 'repair_replacement'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sav_warranty_scope AS ENUM (
    'none', 'vendor', 'manufacturer', 'kawzone_commercial'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sav_assisted_channel AS ENUM (
    'phone', 'whatsapp', 'in_person', 'email', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sav_fee_kind AS ENUM (
    'shipping_outbound', 'shipping_return', 'packaging',
    'preparation', 'import_logistics', 'handling', 'restocking'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Colonnes ajoutées
ALTER TABLE public.sav_cases
  ADD COLUMN IF NOT EXISTS cancellation_stage text,
  ADD COLUMN IF NOT EXISTS warranty_scope public.sav_warranty_scope,
  ADD COLUMN IF NOT EXISTS assisted_channel public.sav_assisted_channel,
  ADD COLUMN IF NOT EXISTS assisted_reason text;

ALTER TABLE public.sav_exchanges
  ADD COLUMN IF NOT EXISTS exchange_kind public.sav_exchange_kind NOT NULL DEFAULT 'variant',
  ADD COLUMN IF NOT EXISTS surcharge_amount numeric,
  ADD COLUMN IF NOT EXISTS partial_refund_amount numeric;

-- 4) Table sav_fee_charges (ventilation des frais)
CREATE TABLE IF NOT EXISTS public.sav_fee_charges (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id     uuid NOT NULL REFERENCES public.sav_cases(id) ON DELETE CASCADE,
  fee_kind    public.sav_fee_kind NOT NULL,
  payer_party public.sav_party NOT NULL,
  amount      numeric NOT NULL CHECK (amount >= 0),
  currency    text NOT NULL DEFAULT 'XOF',
  reason      text,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sav_fee_charges_case ON public.sav_fee_charges(case_id);
CREATE INDEX IF NOT EXISTS idx_sav_fee_charges_kind ON public.sav_fee_charges(fee_kind);

GRANT SELECT, INSERT ON public.sav_fee_charges TO authenticated;
GRANT ALL ON public.sav_fee_charges TO service_role;

ALTER TABLE public.sav_fee_charges ENABLE ROW LEVEL SECURITY;

-- Admin : tout (insert via security definer / service_role normalement)
CREATE POLICY "sav_fee_charges admin all"
  ON public.sav_fee_charges
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

-- Client lit ses propres frais si dossier visible
CREATE POLICY "sav_fee_charges client read own"
  ON public.sav_fee_charges
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sav_cases c
    JOIN public.orders o ON o.id = c.order_id
    WHERE c.id = sav_fee_charges.case_id
      AND o.buyer_id = auth.uid()
      AND c.client_visible = true
  ));

-- Vendeur lit ceux de ses dossiers
CREATE POLICY "sav_fee_charges vendor read own shop"
  ON public.sav_fee_charges
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sav_cases c
    WHERE c.id = sav_fee_charges.case_id
      AND c.vendor_id = auth.uid()
  ));

-- Append-only : pas d'UPDATE/DELETE sauf service_role
DROP TRIGGER IF EXISTS sav_fee_charges_no_update ON public.sav_fee_charges;
CREATE TRIGGER sav_fee_charges_no_update
  BEFORE UPDATE OR DELETE ON public.sav_fee_charges
  FOR EACH ROW EXECUTE FUNCTION public.tg_append_only_guard();

-- 5) Mise à jour de resolve_sav_rules pour intégrer source_country
-- Signature inchangée si possible; on ajoute un paramètre optionnel _source_country_id.
CREATE OR REPLACE FUNCTION public.resolve_sav_rules(
  _product_id uuid DEFAULT NULL,
  _country_id uuid DEFAULT NULL,
  _shop_id    uuid DEFAULT NULL,
  _source_country_id uuid DEFAULT NULL
)
RETURNS TABLE(rule_key public.sav_rule_key, value jsonb, scope public.sav_rule_scope, scope_id uuid, priority integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_id uuid;
BEGIN
  IF _product_id IS NOT NULL THEN
    SELECT p.category_id INTO v_category_id FROM public.products p WHERE p.id = _product_id;
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT
      r.rule_key, r.value, r.scope, r.scope_id, r.priority,
      CASE r.scope
        WHEN 'product'        THEN 1
        WHEN 'category'       THEN 2
        WHEN 'shop'           THEN 3
        WHEN 'source_country' THEN 4
        WHEN 'country'        THEN 5
        WHEN 'global'         THEN 6
      END AS specificity
    FROM public.sav_rules r
    WHERE r.is_active = true
      AND (
        (r.scope = 'product'        AND _product_id        IS NOT NULL AND r.scope_id = _product_id)
     OR (r.scope = 'category'       AND v_category_id      IS NOT NULL AND r.scope_id = v_category_id)
     OR (r.scope = 'shop'           AND _shop_id           IS NOT NULL AND r.scope_id = _shop_id)
     OR (r.scope = 'source_country' AND _source_country_id IS NOT NULL AND r.scope_id = _source_country_id)
     OR (r.scope = 'country'        AND _country_id        IS NOT NULL AND r.scope_id = _country_id)
     OR (r.scope = 'global'         AND r.scope_id IS NULL)
      )
  ),
  picked AS (
    SELECT DISTINCT ON (rule_key)
      rule_key, value, scope, scope_id, priority
    FROM ranked
    ORDER BY rule_key, specificity ASC, priority DESC
  )
  SELECT * FROM picked;
END;
$$;
