-- ============================================================
-- Migration Step 1 : return_shipments
-- KawZone ERP — Système de gestion des retours
-- ============================================================
-- Date : 2026-06-26
-- Principe : Traçabilité logistique du retour physique
-- Dépendances : sav_cases (existante)
-- ============================================================

-- ------------------------------------------------------------
-- TABLE : return_shipments
-- ------------------------------------------------------------
-- But : Tracer chaque trajet physique d'un produit retourné.
-- Un cas SAV peut avoir plusieurs trajets :
--   - client → KawZone (retour initial)
--   - KawZone → fournisseur (retour fournisseur)
--   - KawZone → stock (reconditionnement)
--   - KawZone → destruction
--   - KawZone → client (réexpédition / échange)
--
-- Chaque trajet = 1 ligne. Contrainte d'unicité sur (case_id, leg_type)
-- pour éviter les doublons.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS return_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES sav_cases(id) ON DELETE CASCADE,

  -- Type de trajet (leg). Valeurs contraintes pour éviter les erreurs de saisie.
  leg_type text NOT NULL,

  -- Transporteur et suivi
  carrier_name text,
  tracking_number text,
  tracking_url text,

  -- Adresses
  from_address text,
  to_address text,

  -- Dates du trajet
  shipped_at timestamptz,
  expected_at timestamptz,
  received_at timestamptz,

  -- État du colis à la réception
  -- 'not_received' = défaut, mis à jour quand le colis arrive
  received_condition text DEFAULT 'not_received',

  -- Photos à la réception (URLs Supabase Storage)
  reception_photos text[] DEFAULT '{}',

  -- Frais de transport (dénormalisés pour performance)
  shipping_cost numeric(12,2) DEFAULT 0,
  shipping_cost_currency text DEFAULT 'XOF',

  -- Statut du trajet
  status text NOT NULL DEFAULT 'pending',

  -- Notes libres
  note text,

  -- Meta
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Contrainte d'unicité : un seul trajet de chaque type par cas
CREATE UNIQUE INDEX idx_return_shipments_unique_leg 
  ON return_shipments(case_id, leg_type);

-- Contraintes CHECK sur les enums (compatibilité maximale PostgreSQL)
ALTER TABLE return_shipments
  ADD CONSTRAINT chk_return_shipments_leg_type 
    CHECK (leg_type IN (
      'client_to_kawzone', 
      'kawzone_to_supplier', 
      'kawzone_to_stock', 
      'kawzone_to_destruction', 
      'kawzone_to_client'
    )),
  ADD CONSTRAINT chk_return_shipments_received_condition 
    CHECK (received_condition IN (
      'not_received', 'perfect', 'good', 'damaged', 'destroyed', 'incomplete'
    )),
  ADD CONSTRAINT chk_return_shipments_status 
    CHECK (status IN (
      'pending', 'label_generated', 'picked_up', 'in_transit',
      'out_for_delivery', 'delivered', 'failed', 'returned_to_sender'
    ));

-- Indexes pour les requêtes fréquentes
CREATE INDEX idx_return_shipments_case_id ON return_shipments(case_id);
CREATE INDEX idx_return_shipments_tracking ON return_shipments(tracking_number);
CREATE INDEX idx_return_shipments_status ON return_shipments(status);
CREATE INDEX idx_return_shipments_received ON return_shipments(received_at) 
  WHERE received_at IS NOT NULL;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_return_shipments_updated_at
  BEFORE UPDATE ON return_shipments
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
ALTER TABLE return_shipments ENABLE ROW LEVEL SECURITY;

-- Admin : accès total
CREATE POLICY "return_shipments_admin_all" ON return_shipments
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur 
    JOIN roles r ON ur.role_id = r.id 
    WHERE ur.user_id = auth.uid() AND r.name = 'admin'
  ));

-- Lecture pour tous les users authentifiés (à affiner selon besoin)
CREATE POLICY "return_shipments_auth_read" ON return_shipments
  FOR SELECT
  TO authenticated
  USING (true);
