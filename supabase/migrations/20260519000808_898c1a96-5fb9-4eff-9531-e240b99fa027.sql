-- Enum pour le statut d'évaluation expédition (séparé de orders.status)
DO $$ BEGIN
  CREATE TYPE public.shipment_assessment_status AS ENUM (
    'pending_arrival',
    'awaiting_weighing',
    'fees_calculated',
    'awaiting_client_validation',
    'validated',
    'rejected',
    'ready_to_ship',
    'shipped'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table principale
CREATE TABLE IF NOT EXISTS public.order_shipment_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE,
  status public.shipment_assessment_status NOT NULL DEFAULT 'pending_arrival',

  -- Mesures
  real_weight_kg numeric(10,3),
  volumetric_weight_kg numeric(10,3),
  length_cm numeric(10,2),
  width_cm numeric(10,2),
  height_cm numeric(10,2),

  -- Frais
  air_freight_fee numeric(12,2) DEFAULT 0,
  service_fee numeric(12,2) DEFAULT 0,
  extra_fees numeric(12,2) DEFAULT 0,
  total_fees numeric(12,2) GENERATED ALWAYS AS (
    COALESCE(air_freight_fee,0) + COALESCE(service_fee,0) + COALESCE(extra_fees,0)
  ) STORED,

  -- Métadonnées
  admin_comment text,
  parcel_photo_url text,

  -- Validation client
  client_validated_at timestamptz,
  client_rejected_at timestamptz,
  client_response_note text,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_osa_order_id ON public.order_shipment_assessments(order_id);
CREATE INDEX IF NOT EXISTS idx_osa_status ON public.order_shipment_assessments(status);

-- Trigger updated_at
DROP TRIGGER IF EXISTS tg_osa_updated_at ON public.order_shipment_assessments;
CREATE TRIGGER tg_osa_updated_at
  BEFORE UPDATE ON public.order_shipment_assessments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- RLS
ALTER TABLE public.order_shipment_assessments ENABLE ROW LEVEL SECURITY;

-- Admin : ALL
CREATE POLICY osa_admin_all ON public.order_shipment_assessments
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

-- Client : SELECT son évaluation
CREATE POLICY osa_buyer_read ON public.order_shipment_assessments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_shipment_assessments.order_id
        AND o.buyer_id = auth.uid()
    )
  );

-- Client : UPDATE uniquement pour valider/refuser (vérifié via server function)
CREATE POLICY osa_buyer_validate ON public.order_shipment_assessments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_shipment_assessments.order_id
        AND o.buyer_id = auth.uid()
    )
    AND status = 'awaiting_client_validation'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_shipment_assessments.order_id
        AND o.buyer_id = auth.uid()
    )
    AND status IN ('validated', 'rejected')
  );

-- Trigger pour empêcher le client de modifier les frais ou métadonnées admin
CREATE OR REPLACE FUNCTION public.protect_shipment_assessment_client_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR public.has_role(v_uid, 'admin'::app_role) OR public.is_super_admin(v_uid) THEN
    RETURN NEW;
  END IF;

  -- Le client ne peut pas modifier les frais / poids / dimensions / commentaire admin / photo
  IF NEW.real_weight_kg IS DISTINCT FROM OLD.real_weight_kg
     OR NEW.volumetric_weight_kg IS DISTINCT FROM OLD.volumetric_weight_kg
     OR NEW.length_cm IS DISTINCT FROM OLD.length_cm
     OR NEW.width_cm IS DISTINCT FROM OLD.width_cm
     OR NEW.height_cm IS DISTINCT FROM OLD.height_cm
     OR NEW.air_freight_fee IS DISTINCT FROM OLD.air_freight_fee
     OR NEW.service_fee IS DISTINCT FROM OLD.service_fee
     OR NEW.extra_fees IS DISTINCT FROM OLD.extra_fees
     OR NEW.admin_comment IS DISTINCT FROM OLD.admin_comment
     OR NEW.parcel_photo_url IS DISTINCT FROM OLD.parcel_photo_url
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Les clients ne peuvent modifier que leur validation/refus.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_osa_protect ON public.order_shipment_assessments;
CREATE TRIGGER tg_osa_protect
  BEFORE UPDATE ON public.order_shipment_assessments
  FOR EACH ROW EXECUTE FUNCTION public.protect_shipment_assessment_client_fields();