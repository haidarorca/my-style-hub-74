-- ═══════════════════════════════════════════════════════════════
-- Migration : Tables paiements et audit pour le Cockpit
-- ═══════════════════════════════════════════════════════════════

-- 1. Table des paiements par commande
CREATE TABLE IF NOT EXISTS order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount decimal(12,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('wave', 'orange_money', 'cash', 'bank_transfer', 'other')),
  reference text,
  admin_name text NOT NULL DEFAULT 'Admin',
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index pour les recherches par commande
CREATE INDEX IF NOT EXISTS idx_order_payments_order_id ON order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_created_at ON order_payments(created_at DESC);

-- 2. Table de resume (total paye par commande)
CREATE TABLE IF NOT EXISTS order_payment_summary (
  order_id uuid PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  total_paid decimal(12,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Table d'audit (journal des actions)
CREATE TABLE IF NOT EXISTS payment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  action text NOT NULL,
  admin_name text NOT NULL DEFAULT 'Admin',
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_audit_order_id ON payment_audit(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_audit_created_at ON payment_audit(created_at DESC);

-- 4. Politiques RLS (Row Level Security)
ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_payment_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_audit ENABLE ROW LEVEL SECURITY;

-- Politique : les admins peuvent tout voir
CREATE POLICY "admin_all_order_payments"
  ON order_payments FOR ALL
  USING (auth.uid() IN (
    SELECT user_id FROM user_roles WHERE role IN ('admin', 'super_admin')
  ));

CREATE POLICY "admin_all_payment_summary"
  ON order_payment_summary FOR ALL
  USING (auth.uid() IN (
    SELECT user_id FROM user_roles WHERE role IN ('admin', 'super_admin')
  ));

CREATE POLICY "admin_all_payment_audit"
  ON payment_audit FOR ALL
  USING (auth.uid() IN (
    SELECT user_id FROM user_roles WHERE role IN ('admin', 'super_admin')
  ));

-- Politique : les vendeurs peuvent voir les paiements de leurs commandes
CREATE POLICY "vendor_view_own_order_payments"
  ON order_payments FOR SELECT
  USING (auth.uid() IN (
    SELECT vendor_id FROM orders WHERE id = order_payments.order_id
  ));

-- 5. Fonction pour recalculer automatiquement le total
CREATE OR REPLACE FUNCTION recalc_order_payment_summary()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO order_payment_summary (order_id, total_paid, updated_at)
  SELECT 
    order_id,
    COALESCE(SUM(amount), 0),
    now()
  FROM order_payments
  WHERE order_id = COALESCE(NEW.order_id, OLD.order_id)
  GROUP BY order_id
  ON CONFLICT (order_id) DO UPDATE SET
    total_paid = EXCLUDED.total_paid,
    updated_at = now();
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger sur order_payments
DROP TRIGGER IF EXISTS trg_recalc_payments ON order_payments;
CREATE TRIGGER trg_recalc_payments
  AFTER INSERT OR UPDATE OR DELETE ON order_payments
  FOR EACH ROW
  EXECUTE FUNCTION recalc_order_payment_summary();
