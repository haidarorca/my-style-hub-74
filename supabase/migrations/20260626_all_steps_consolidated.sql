-- ============================================================
-- MIGRATION CONSOLIDÉE : COAV — Système de gestion des retours
-- KawZone ERP
-- ============================================================
-- Date : 2026-06-26
-- Exécution : Copier-coller dans Supabase SQL Editor, puis Run
-- ============================================================

-- ============================================================
-- STEP 1 : return_shipments
-- Traçabilité logistique des trajets retour
-- ============================================================

CREATE TABLE IF NOT EXISTS return_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES sav_cases(id) ON DELETE CASCADE,
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
  created_by uuid REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX idx_return_shipments_unique_leg 
  ON return_shipments(case_id, leg_type);
CREATE INDEX idx_return_shipments_case_id ON return_shipments(case_id);
CREATE INDEX idx_return_shipments_tracking ON return_shipments(tracking_number);
CREATE INDEX idx_return_shipments_status ON return_shipments(status);
CREATE INDEX idx_return_shipments_received ON return_shipments(received_at) 
  WHERE received_at IS NOT NULL;

ALTER TABLE return_shipments
  ADD CONSTRAINT chk_return_shipments_leg_type 
    CHECK (leg_type IN ('client_to_kawzone', 'kawzone_to_supplier', 'kawzone_to_stock', 'kawzone_to_destruction', 'kawzone_to_client')),
  ADD CONSTRAINT chk_return_shipments_received_condition 
    CHECK (received_condition IN ('not_received', 'perfect', 'good', 'damaged', 'destroyed', 'incomplete')),
  ADD CONSTRAINT chk_return_shipments_status 
    CHECK (status IN ('pending', 'label_generated', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned_to_sender'));

-- ============================================================
-- STEP 2 : inspection_reports
-- Point de décision critique du workflow retour
-- ============================================================

CREATE TABLE IF NOT EXISTS inspection_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES sav_cases(id) ON DELETE CASCADE,
  return_shipment_id uuid REFERENCES return_shipments(id),
  inspected_by uuid NOT NULL REFERENCES profiles(id),
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
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inspection_reports_case_id ON inspection_reports(case_id);
CREATE INDEX idx_inspection_reports_disposition ON inspection_reports(disposition);
CREATE INDEX idx_inspection_reports_inspected_at ON inspection_reports(inspected_at);

ALTER TABLE inspection_reports
  ADD CONSTRAINT chk_inspection_reports_condition 
    CHECK (condition IN ('new_sealed', 'new_opened', 'like_new', 'good', 'fair', 'damaged_functional', 'damaged_unfunctional', 'incomplete', 'wrong_product', 'counterfeit')),
  ADD CONSTRAINT chk_inspection_reports_packaging 
    CHECK (packaging_condition IN ('original_intact', 'original_damaged', 'original_missing', 'replacement')),
  ADD CONSTRAINT chk_inspection_reports_disposition 
    CHECK (disposition IN ('restock_as_new', 'restock_as_used', 'send_to_repair', 'return_to_supplier', 'destroy', 'donate', 'pending_decision'));

-- ============================================================
-- STEP 3 : destruction_records
-- Documentation fiscale des destructions
-- ============================================================

CREATE TABLE IF NOT EXISTS destruction_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES sav_cases(id) ON DELETE CASCADE,
  inspection_report_id uuid REFERENCES inspection_reports(id),
  method text NOT NULL,
  destroyed_by uuid REFERENCES profiles(id),
  witnessed_by uuid REFERENCES profiles(id),
  destroyed_at timestamptz NOT NULL DEFAULT now(),
  photos text[] DEFAULT '{}',
  certificate_url text,
  original_value numeric(12,2),
  original_currency text DEFAULT 'XOF',
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

CREATE INDEX idx_destruction_records_case_id ON destruction_records(case_id);
CREATE INDEX idx_destruction_records_inspection ON destruction_records(inspection_report_id);
CREATE INDEX idx_destruction_records_destroyed_at ON destruction_records(destroyed_at);

ALTER TABLE destruction_records
  ADD CONSTRAINT chk_destruction_records_method 
    CHECK (method IN ('recycling', 'landfill', 'incineration', 'donation', 'resale_destruction', 'other'));

-- ============================================================
-- STEP 4 : supplier_returns
-- Cycle de retour fournisseur international
-- ============================================================

CREATE TABLE IF NOT EXISTS supplier_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES sav_cases(id) ON DELETE CASCADE,
  inspection_report_id uuid REFERENCES inspection_reports(id),
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
  return_shipment_id uuid REFERENCES return_shipments(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

CREATE INDEX idx_supplier_returns_case_id ON supplier_returns(case_id);
CREATE INDEX idx_supplier_returns_supplier ON supplier_returns(supplier_id);
CREATE INDEX idx_supplier_returns_response ON supplier_returns(supplier_response);
CREATE INDEX idx_supplier_returns_credit ON supplier_returns(credit_applied_to_case) 
  WHERE credit_applied_to_case = true;

ALTER TABLE supplier_returns
  ADD CONSTRAINT chk_supplier_returns_method 
    CHECK (request_method IN ('email', 'platform_api', 'phone', 'agent', 'wechat')),
  ADD CONSTRAINT chk_supplier_returns_response 
    CHECK (supplier_response IN ('pending', 'accepted_full', 'accepted_partial', 'refused', 'no_response', 'counter_offer', 'requested_more_info'));

-- ============================================================
-- STEP 5 : v_case_balances (Vue SQL)
-- Balance financière agrégée par dossier
-- ============================================================

CREATE OR REPLACE VIEW v_case_balances AS
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
  CASE
    WHEN sc.status IN ('closed', 'resolved') THEN 'settled'
    WHEN sc.status = 'in_execution' THEN 'pending_closure'
    ELSE 'open'
  END AS balance_status,
  sc.created_at AS case_opened_at,
  sc.closed_at AS case_closed_at,
  sc.updated_at
FROM sav_cases sc
LEFT JOIN order_items oi ON oi.id = sc.order_item_id
LEFT JOIN (
  SELECT case_id, SUM(amount) AS total_fees, MAX(currency) AS currency
  FROM sav_fee_charges GROUP BY case_id
) fees ON fees.case_id = sc.id
LEFT JOIN (
  SELECT case_id,
    jsonb_object_agg(fee_kind::text, jsonb_build_object('amount', amount, 'currency', currency, 'payer', payer_party)) AS fees_breakdown
  FROM (SELECT case_id, fee_kind, SUM(amount) AS amount, MAX(currency) AS currency, MAX(payer_party::text) AS payer_party
    FROM sav_fee_charges GROUP BY case_id, fee_kind) sub
  GROUP BY case_id
) fees_by_type ON fees_by_type.case_id = sc.id
LEFT JOIN (
  SELECT case_id, SUM(amount) AS total_refunded
  FROM sav_refunds WHERE status = 'issued' GROUP BY case_id
) refunds ON refunds.case_id = sc.id
LEFT JOIN (
  SELECT case_id, SUM(amount) AS total_credit
  FROM sav_refunds WHERE method = 'credit_note' AND status = 'issued' GROUP BY case_id
) credits ON credits.case_id = sc.id
LEFT JOIN (
  SELECT case_id, SUM(credit_amount) AS total_supplier_credit
  FROM supplier_returns WHERE credit_applied_to_case = true GROUP BY case_id
) supplier_credits ON supplier_credits.case_id = sc.id
LEFT JOIN (
  SELECT case_id, SUM(amount) AS total_loss
  FROM sav_fee_charges WHERE fee_kind IN ('destruction', 'handling', 'storage') GROUP BY case_id
) losses ON losses.case_id = sc.id;

-- ============================================================
-- TRIGGERS updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_return_shipments_updated_at
  BEFORE UPDATE ON return_shipments
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_inspection_reports_updated_at
  BEFORE UPDATE ON inspection_reports
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_supplier_returns_updated_at
  BEFORE UPDATE ON supplier_returns
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

ALTER TABLE return_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE destruction_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_returns ENABLE ROW LEVEL SECURITY;

-- Admin policies (all tables)
CREATE POLICY "return_shipments_admin_all" ON return_shipments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = auth.uid() AND r.name = 'admin'));
CREATE POLICY "inspection_reports_admin_all" ON inspection_reports
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = auth.uid() AND r.name = 'admin'));
CREATE POLICY "destruction_records_admin_all" ON destruction_records
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = auth.uid() AND r.name = 'admin'));
CREATE POLICY "supplier_returns_admin_all" ON supplier_returns
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = auth.uid() AND r.name = 'admin'));

-- Read policies (authenticated users)
CREATE POLICY "return_shipments_auth_read" ON return_shipments FOR SELECT TO authenticated USING (true);
CREATE POLICY "inspection_reports_auth_read" ON inspection_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "destruction_records_auth_read" ON destruction_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "supplier_returns_auth_read" ON supplier_returns FOR SELECT TO authenticated USING (true);

-- ============================================================
-- VERIFICATION
-- ============================================================
-- Après exécution, validez avec :
-- SELECT * FROM return_shipments LIMIT 1;
-- SELECT * FROM inspection_reports LIMIT 1;
-- SELECT * FROM destruction_records LIMIT 1;
-- SELECT * FROM supplier_returns LIMIT 1;
-- SELECT * FROM v_case_balances LIMIT 5;
-- ============================================================
