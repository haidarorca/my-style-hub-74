
-- return_shipments
CREATE TABLE IF NOT EXISTS public.return_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.sav_cases(id) ON DELETE CASCADE,
  leg_type text NOT NULL,
  carrier_name text,
  tracking_number text,
  tracking_url text,
  from_address text,
  to_address text,
  shipped_at timestamptz,
  expected_at timestamptz,
  received_at timestamptz,
  received_condition text DEFAULT 'not_received',
  reception_photos text[] DEFAULT '{}',
  shipping_cost numeric(12,2) DEFAULT 0,
  shipping_cost_currency text DEFAULT 'XOF',
  status text NOT NULL DEFAULT 'pending',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  CONSTRAINT chk_return_shipments_leg_type CHECK (leg_type IN ('client_to_kawzone','kawzone_to_supplier','kawzone_to_stock','kawzone_to_destruction','kawzone_to_client')),
  CONSTRAINT chk_return_shipments_received_condition CHECK (received_condition IN ('not_received','perfect','good','damaged','destroyed','incomplete')),
  CONSTRAINT chk_return_shipments_status CHECK (status IN ('pending','label_generated','picked_up','in_transit','out_for_delivery','delivered','failed','returned_to_sender'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_return_shipments_unique_leg ON public.return_shipments(case_id, leg_type);
CREATE INDEX IF NOT EXISTS idx_return_shipments_case_id ON public.return_shipments(case_id);
CREATE INDEX IF NOT EXISTS idx_return_shipments_tracking ON public.return_shipments(tracking_number);
CREATE INDEX IF NOT EXISTS idx_return_shipments_status ON public.return_shipments(status);
CREATE INDEX IF NOT EXISTS idx_return_shipments_received ON public.return_shipments(received_at) WHERE received_at IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.return_shipments TO authenticated;
GRANT ALL ON public.return_shipments TO service_role;
ALTER TABLE public.return_shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "return_shipments_admin_all" ON public.return_shipments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "return_shipments_auth_read" ON public.return_shipments FOR SELECT TO authenticated USING (true);

-- inspection_reports
CREATE TABLE IF NOT EXISTS public.inspection_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.sav_cases(id) ON DELETE CASCADE,
  return_shipment_id uuid REFERENCES public.return_shipments(id),
  inspected_by uuid NOT NULL REFERENCES public.profiles(id),
  inspected_at timestamptz NOT NULL DEFAULT now(),
  condition text NOT NULL,
  actual_weight_g integer,
  actual_dimensions_cm integer[],
  accessories_present text[] DEFAULT '{}',
  accessories_missing text[] DEFAULT '{}',
  serial_number text,
  packaging_condition text,
  disposition text NOT NULL,
  photos text[] DEFAULT '{}',
  videos text[] DEFAULT '{}',
  findings text,
  recommended_action text,
  client_fault boolean DEFAULT false,
  inspection_cost numeric(12,2) DEFAULT 0,
  inspection_cost_currency text DEFAULT 'XOF',
  inspection_cost_payer text DEFAULT 'kawzone',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_inspection_reports_condition CHECK (condition IN ('new_sealed','new_opened','like_new','good','fair','damaged_functional','damaged_unfunctional','incomplete','wrong_product','counterfeit')),
  CONSTRAINT chk_inspection_reports_packaging CHECK (packaging_condition IN ('original_intact','original_damaged','original_missing','replacement')),
  CONSTRAINT chk_inspection_reports_disposition CHECK (disposition IN ('restock_as_new','restock_as_used','send_to_repair','return_to_supplier','destroy','donate','pending_decision'))
);
CREATE INDEX IF NOT EXISTS idx_inspection_reports_case_id ON public.inspection_reports(case_id);
CREATE INDEX IF NOT EXISTS idx_inspection_reports_disposition ON public.inspection_reports(disposition);
CREATE INDEX IF NOT EXISTS idx_inspection_reports_inspected_at ON public.inspection_reports(inspected_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_reports TO authenticated;
GRANT ALL ON public.inspection_reports TO service_role;
ALTER TABLE public.inspection_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inspection_reports_admin_all" ON public.inspection_reports FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "inspection_reports_auth_read" ON public.inspection_reports FOR SELECT TO authenticated USING (true);

-- destruction_records
CREATE TABLE IF NOT EXISTS public.destruction_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.sav_cases(id) ON DELETE CASCADE,
  inspection_report_id uuid REFERENCES public.inspection_reports(id),
  method text NOT NULL,
  destroyed_by uuid REFERENCES public.profiles(id),
  witnessed_by uuid REFERENCES public.profiles(id),
  destroyed_at timestamptz NOT NULL DEFAULT now(),
  photos text[] DEFAULT '{}',
  certificate_url text,
  original_value numeric(12,2),
  original_currency text DEFAULT 'XOF',
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  CONSTRAINT chk_destruction_records_method CHECK (method IN ('recycling','landfill','incineration','donation','resale_destruction','other'))
);
CREATE INDEX IF NOT EXISTS idx_destruction_records_case_id ON public.destruction_records(case_id);
CREATE INDEX IF NOT EXISTS idx_destruction_records_inspection ON public.destruction_records(inspection_report_id);
CREATE INDEX IF NOT EXISTS idx_destruction_records_destroyed_at ON public.destruction_records(destroyed_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.destruction_records TO authenticated;
GRANT ALL ON public.destruction_records TO service_role;
ALTER TABLE public.destruction_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "destruction_records_admin_all" ON public.destruction_records FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "destruction_records_auth_read" ON public.destruction_records FOR SELECT TO authenticated USING (true);

-- supplier_returns
CREATE TABLE IF NOT EXISTS public.supplier_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.sav_cases(id) ON DELETE CASCADE,
  inspection_report_id uuid REFERENCES public.inspection_reports(id),
  supplier_id text NOT NULL,
  supplier_name text,
  requested_at timestamptz,
  request_method text,
  request_reference text,
  items_returned jsonb DEFAULT '[]',
  supplier_response text DEFAULT 'pending',
  supplier_response_at timestamptz,
  supplier_response_note text,
  credit_amount numeric(12,2) DEFAULT 0,
  credit_currency text DEFAULT 'CNY',
  credit_received_at timestamptz,
  credit_applied_to_case boolean DEFAULT false,
  return_shipment_id uuid REFERENCES public.return_shipments(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  CONSTRAINT chk_supplier_returns_method CHECK (request_method IN ('email','platform_api','phone','agent','wechat')),
  CONSTRAINT chk_supplier_returns_response CHECK (supplier_response IN ('pending','accepted_full','accepted_partial','refused','no_response','counter_offer','requested_more_info'))
);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_case_id ON public.supplier_returns(case_id);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_supplier ON public.supplier_returns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_response ON public.supplier_returns(supplier_response);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_credit ON public.supplier_returns(credit_applied_to_case) WHERE credit_applied_to_case = true;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_returns TO authenticated;
GRANT ALL ON public.supplier_returns TO service_role;
ALTER TABLE public.supplier_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "supplier_returns_admin_all" ON public.supplier_returns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "supplier_returns_auth_read" ON public.supplier_returns FOR SELECT TO authenticated USING (true);

-- updated_at trigger fn
CREATE OR REPLACE FUNCTION public.fn_set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_return_shipments_updated_at ON public.return_shipments;
CREATE TRIGGER trg_return_shipments_updated_at BEFORE UPDATE ON public.return_shipments FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
DROP TRIGGER IF EXISTS trg_inspection_reports_updated_at ON public.inspection_reports;
CREATE TRIGGER trg_inspection_reports_updated_at BEFORE UPDATE ON public.inspection_reports FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
DROP TRIGGER IF EXISTS trg_supplier_returns_updated_at ON public.supplier_returns;
CREATE TRIGGER trg_supplier_returns_updated_at BEFORE UPDATE ON public.supplier_returns FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- v_case_balances
CREATE OR REPLACE VIEW public.v_case_balances AS
SELECT
  sc.id AS case_id,
  sc.order_id,
  sc.order_item_id,
  sc.case_type,
  sc.status AS case_status,
  sc.owner_party,
  sc.problem_type,
  sc.vendor_id,
  COALESCE(oi.unit_price * oi.quantity, 0) AS total_paid,
  oi.unit_price,
  oi.quantity AS original_quantity,
  COALESCE(fees.total_fees, 0) AS total_fees,
  COALESCE(fees_by_type.fees_breakdown, '{}'::jsonb) AS fees_breakdown,
  COALESCE(refunds.total_refunded, 0) AS total_refunded,
  COALESCE(credits.total_credit, 0) AS total_credit_notes,
  COALESCE(supplier_credits.total_supplier_credit, 0) AS total_supplier_credit,
  COALESCE(losses.total_loss, 0) AS total_lost,
  COALESCE(oi.unit_price * oi.quantity, 0) - COALESCE(refunds.total_refunded, 0) AS total_remaining,
  COALESCE(fees.total_fees, 0) - COALESCE(refunds.total_refunded, 0) - COALESCE(supplier_credits.total_supplier_credit, 0) AS net_position,
  CASE WHEN sc.status IN ('closed','resolved') THEN 'settled'
       WHEN sc.status = 'in_execution' THEN 'pending_closure'
       ELSE 'open' END AS balance_status,
  sc.created_at AS case_opened_at,
  sc.closed_at AS case_closed_at,
  sc.updated_at
FROM public.sav_cases sc
LEFT JOIN public.order_items oi ON oi.id = sc.order_item_id
LEFT JOIN (SELECT case_id, SUM(amount) AS total_fees, MAX(currency) AS currency FROM public.sav_fee_charges GROUP BY case_id) fees ON fees.case_id = sc.id
LEFT JOIN (
  SELECT case_id, jsonb_object_agg(fee_kind::text, jsonb_build_object('amount', amount, 'currency', currency, 'payer', payer_party)) AS fees_breakdown
  FROM (SELECT case_id, fee_kind, SUM(amount) AS amount, MAX(currency) AS currency, MAX(payer_party::text) AS payer_party FROM public.sav_fee_charges GROUP BY case_id, fee_kind) sub
  GROUP BY case_id
) fees_by_type ON fees_by_type.case_id = sc.id
LEFT JOIN (SELECT case_id, SUM(amount) AS total_refunded FROM public.sav_refunds WHERE status = 'issued' GROUP BY case_id) refunds ON refunds.case_id = sc.id
LEFT JOIN (SELECT case_id, SUM(amount) AS total_credit FROM public.sav_refunds WHERE method = 'credit_note' AND status = 'issued' GROUP BY case_id) credits ON credits.case_id = sc.id
LEFT JOIN (SELECT case_id, SUM(credit_amount) AS total_supplier_credit FROM public.supplier_returns WHERE credit_applied_to_case = true GROUP BY case_id) supplier_credits ON supplier_credits.case_id = sc.id
LEFT JOIN (SELECT case_id, SUM(amount) AS total_loss FROM public.sav_fee_charges WHERE fee_kind IN ('destruction','handling','storage') GROUP BY case_id) losses ON losses.case_id = sc.id;

GRANT SELECT ON public.v_case_balances TO authenticated, service_role;
