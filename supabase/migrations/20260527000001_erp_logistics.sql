-- Migration : ERP Logistique — Fondations pour tableau centralisé
-- Phase 1 : Tables paiement, tracking, colonnes personnalisées

-- ═══════════════════════════════════════════════════════════
-- 1. TYPES ÉNUMÉRÉS
-- ═══════════════════════════════════════════════════════════

-- PostgreSQL does NOT support CREATE TYPE IF NOT EXISTS.
-- Use DO blocks with exception handling for idempotency.

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM (
    'pending', 'partial', 'paid', 'confirmed', 'waived', 'refunded'
  );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM (
    'wave', 'orange_money', 'free_money', 'cash', 'bank_transfer', 'other'
  );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.custom_column_type AS ENUM (
    'text', 'number', 'date', 'boolean', 'select'
  );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ═══════════════════════════════════════════════════════════
-- 2. TABLE : PAIEMENTS EXPÉDITION
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.shipment_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_shipment_assessment_id uuid NOT NULL REFERENCES public.order_shipment_assessments(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  -- Montants
  amount_requested numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  amount_remaining numeric(12,2) GENERATED ALWAYS AS (amount_requested - amount_paid) STORED,

  -- Paiement
  payment_status public.payment_status NOT NULL DEFAULT 'pending',
  payment_method public.payment_method,
  payment_reference varchar(100),                    -- Référence Wave/OM
  payment_proof_url text,                            -- Photo/screenshot reçu

  -- Confirmation
  paid_at timestamptz,
  confirmed_by uuid REFERENCES auth.users(id),
  confirmed_at timestamptz,
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sp_order ON public.shipment_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_sp_status ON public.shipment_payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_sp_remaining ON public.shipment_payments(amount_remaining) WHERE amount_remaining > 0;

-- Trigger : updated_at auto
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sp_updated_at ON public.shipment_payments;
CREATE TRIGGER trg_sp_updated_at
  BEFORE UPDATE ON public.shipment_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.shipment_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sp_admin_all ON public.shipment_payments;
CREATE POLICY sp_admin_all ON public.shipment_payments
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS sp_buyer_read ON public.shipment_payments;
CREATE POLICY sp_buyer_read ON public.shipment_payments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = shipment_payments.order_id AND o.buyer_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════
-- 3. TABLE : TRACKING COLIS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.shipment_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_shipment_assessment_id uuid NOT NULL REFERENCES public.order_shipment_assessments(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  tracking_number varchar(100),
  carrier_name varchar(100),
  tracking_url text,

  warehouse_received_at timestamptz,
  weighed_at timestamptz,
  shipped_at timestamptz,
  estimated_arrival_at timestamptz,

  warehouse_location varchar(200),
  agent_name varchar(100),

  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_st_order ON public.shipment_tracking(order_id);
CREATE INDEX IF NOT EXISTS idx_st_tracking ON public.shipment_tracking(tracking_number);

DROP TRIGGER IF EXISTS trg_st_updated_at ON public.shipment_tracking;
CREATE TRIGGER trg_st_updated_at
  BEFORE UPDATE ON public.shipment_tracking
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.shipment_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS st_admin_all ON public.shipment_tracking;
CREATE POLICY st_admin_all ON public.shipment_tracking
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ═══════════════════════════════════════════════════════════
-- 4. TABLES : COLONNES PERSONNALISÉES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.shipment_custom_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  column_name varchar(50) NOT NULL UNIQUE,
  column_label varchar(100) NOT NULL,
  column_type public.custom_column_type NOT NULL DEFAULT 'text',
  options jsonb DEFAULT NULL,                        -- Pour type 'select'
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shipment_custom_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id uuid NOT NULL REFERENCES public.shipment_custom_columns(id) ON DELETE CASCADE,
  order_shipment_assessment_id uuid NOT NULL REFERENCES public.order_shipment_assessments(id) ON DELETE CASCADE,
  value_text text,
  value_number numeric,
  value_date timestamptz,
  value_boolean boolean,
  UNIQUE(column_id, order_shipment_assessment_id)
);

CREATE INDEX IF NOT EXISTS idx_scv_osa ON public.shipment_custom_values(order_shipment_assessment_id);

-- RLS
ALTER TABLE public.shipment_custom_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_custom_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scc_admin_all ON public.shipment_custom_columns;
CREATE POLICY scc_admin_all ON public.shipment_custom_columns
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS scv_admin_all ON public.shipment_custom_values;
CREATE POLICY scv_admin_all ON public.shipment_custom_values
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ═══════════════════════════════════════════════════════════
-- 5. VUE SYNTHÉTIQUE : ORDRE LOGISTIQUE COMPLET
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.logistics_order_view AS
SELECT
  o.id AS order_id,
  o.status AS order_status,
  o.customer_name,
  o.customer_phone,
  o.total AS order_total,
  o.created_at AS order_created_at,
  o.archived_at,
  o.destination_country_id,
  o.shipping_service_id,

  -- Évaluation
  osa.id AS assessment_id,
  osa.status AS logistics_status,
  osa.real_weight_kg,
  osa.volumetric_weight_kg,
  osa.air_freight_fee,
  osa.service_fee,
  osa.extra_fees,
  osa.admin_comment,
  osa.parcel_photo_url,

  -- Frais total
  COALESCE(osa.air_freight_fee, 0) + COALESCE(osa.service_fee, 0) + COALESCE(osa.extra_fees, 0) AS total_shipping_fees,

  -- Paiement
  sp.payment_status,
  sp.amount_requested,
  sp.amount_paid,
  sp.amount_remaining,
  sp.payment_method,
  sp.payment_reference,
  sp.confirmed_at,

  -- Tracking
  st.tracking_number,
  st.carrier_name,
  st.warehouse_received_at,
  st.weighed_at,
  st.shipped_at,
  st.estimated_arrival_at,

  -- Nombre d'articles
  (SELECT COUNT(*) FROM public.order_items oi WHERE oi.order_id = o.id) AS item_count

FROM public.orders o
LEFT JOIN public.order_shipment_assessments osa ON osa.order_id = o.id
LEFT JOIN public.shipment_payments sp ON sp.order_shipment_assessment_id = osa.id
LEFT JOIN public.shipment_tracking st ON st.order_shipment_assessment_id = osa.id
WHERE o.archived_at IS NULL;

-- ═══════════════════════════════════════════════════════════
-- 6. FONCTION : CRÉER AUTO-EVALUATION + PAIEMENT
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_shipment_assessment_complete(
  _order_id uuid,
  _shipping_service_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_assessment_id uuid;
  order_total numeric(12,2);
BEGIN
  -- Récupérer le total de la commande
  SELECT total INTO order_total FROM public.orders WHERE id = _order_id;

  -- Créer l'évaluation
  INSERT INTO public.order_shipment_assessments (order_id, shipping_service_id, status)
  VALUES (_order_id, _shipping_service_id, 'pending_arrival')
  RETURNING id INTO new_assessment_id;

  -- Créer le paiement associé (montant 0, en attente)
  INSERT INTO public.shipment_payments (
    order_shipment_assessment_id, order_id,
    amount_requested, amount_paid, payment_status
  ) VALUES (
    new_assessment_id, _order_id,
    0, 0, 'pending'
  );

  -- Créer le tracking (vide)
  INSERT INTO public.shipment_tracking (
    order_shipment_assessment_id, order_id
  ) VALUES (
    new_assessment_id, _order_id
  );

  RETURN new_assessment_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 7. DONNÉES INITIALES : Colonnes personnalisées par défaut
-- ═══════════════════════════════════════════════════════════

INSERT INTO public.shipment_custom_columns (column_name, column_label, column_type, sort_order)
VALUES
  ('date_paiement', 'Date paiement', 'date', 1),
  ('recu_wave', 'Reçu Wave/OM', 'text', 2),
  ('numero_colis', 'Numéro colis', 'text', 3),
  ('note_fournisseur', 'Note fournisseur', 'text', 4),
  ('date_reception_chine', 'Date réception Chine', 'date', 5),
  ('date_expedition', 'Date expédition', 'date', 6),
  ('agent_transport', 'Agent transport', 'text', 7),
  ('entrepot', 'Entrepôt', 'text', 8),
  ('remarque_admin', 'Remarque admin', 'text', 9),
  ('reference_externe', 'Référence externe', 'text', 10)
ON CONFLICT (column_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
-- 8. FONCTION : STATS LOGISTIQUES RAPIDES
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_logistics_stats()
RETURNS TABLE (
  to_weigh bigint,
  awaiting_payment bigint,
  partial_payment bigint,
  to_ship bigint,
  shipped bigint,
  total_remaining numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.order_shipment_assessments WHERE status = 'awaiting_weighing'),
    (SELECT COUNT(*) FROM public.shipment_payments WHERE payment_status = 'pending'),
    (SELECT COUNT(*) FROM public.shipment_payments WHERE payment_status = 'partial'),
    (SELECT COUNT(*) FROM public.order_shipment_assessments WHERE status = 'validated'),
    (SELECT COUNT(*) FROM public.order_shipment_assessments WHERE status = 'shipped'),
    (SELECT COALESCE(SUM(amount_remaining), 0) FROM public.shipment_payments WHERE amount_remaining > 0);
END;
$$;
