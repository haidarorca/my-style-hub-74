-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: Tables Admin1 — Workflow Center v4
-- ═══════════════════════════════════════════════════════════════

-- 1. Table des colis (Packages)
CREATE TABLE IF NOT EXISTS packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  package_type text NOT NULL CHECK (package_type IN ('local', 'import')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN (
    'new', 'confirmed', 'deposit_paid', 'processing', 'warehouse_arrived',
    'fees_calculated', 'ready_to_ship', 'shipped', 'delivered', 'cancelled'
  )),
  weight_kg numeric(10, 2),
  volumetric_weight_kg numeric(10, 2),
  freight_rate_per_kg numeric(12, 2) DEFAULT 7500,
  freight_cost numeric(12, 2) DEFAULT 0,
  tracking_number text,
  carrier_name text,
  warehouse_arrived_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_packages_order_id ON packages(order_id);
CREATE INDEX IF NOT EXISTS idx_packages_status ON packages(status);

-- 2. Table des paiements (Journal immuable)
CREATE TABLE IF NOT EXISTS payment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('wave', 'orange_money', 'cash', 'bank_transfer', 'other')),
  reference text,
  recorded_by uuid REFERENCES auth.users(id),
  recorded_at timestamptz DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS idx_payment_logs_order_id ON payment_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_recorded_at ON payment_logs(recorded_at);

-- 3. Table des changements de statut (Journal immuable)
CREATE TABLE IF NOT EXISTS order_status_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS idx_status_logs_order_id ON order_status_logs(order_id);

-- 4. Trigger pour updated_at sur packages
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_packages_updated_at ON packages;
CREATE TRIGGER update_packages_updated_at
  BEFORE UPDATE ON packages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 5. Fonction pour calculer le solde d'une commande
CREATE OR REPLACE FUNCTION calculate_order_balance(order_uuid uuid)
RETURNS numeric AS $$
DECLARE
  total_products numeric;
  total_fees numeric;
  total_paid numeric;
BEGIN
  SELECT COALESCE(SUM(total_product_amount), 0) INTO total_products FROM orders WHERE id = order_uuid;
  SELECT COALESCE(SUM(freight_cost), 0) INTO total_fees FROM packages WHERE order_id = order_uuid;
  SELECT COALESCE(SUM(amount), 0) INTO total_paid FROM payment_logs WHERE order_id = order_uuid;
  RETURN (total_products + total_fees) - total_paid;
END;
$$ LANGUAGE plpgsql;
