ALTER TABLE public.order_shipment_assessments
  ADD COLUMN IF NOT EXISTS anomaly_resolution text,
  ADD COLUMN IF NOT EXISTS anomaly_resolved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS anomaly_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS anomaly_note text;

COMMENT ON COLUMN public.order_shipment_assessments.anomaly_resolution IS 'Action prise par l''admin sur une anomalie de poids: accept_loss | contact_client | cancel_order';