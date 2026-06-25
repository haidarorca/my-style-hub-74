-- ============================================================
-- Migration Step 4 : supplier_returns
-- KawZone ERP — Système de gestion des retours
-- ============================================================
-- Date : 2026-06-26
-- Principe : Traçabilité des retours fournisseur internationaux
-- Dépendances : sav_cases (existante), inspection_reports (step 2),
--               return_shipments (step 1), profiles (existante)
-- ============================================================

-- ------------------------------------------------------------
-- TABLE : supplier_returns
-- ------------------------------------------------------------
-- But : Tracer le cycle de retour vers le fournisseur.
--
-- Contexte métier : Les retours fournisseur sont un processus
-- INTERNATIONAL ASYNCHRONE (délai 30-90 jours). Le fournisseur
-- chinois peut : accepter, refuser, ou proposer un avoir partiel.
-- Il faut une table dédiée car ce cycle est long et complexe.
--
-- Chaque retour fournisseur = 1 ligne. Le fournisseur peut ne pas
-- avoir de compte dans le système (fournisseur Chine externe),
-- d'où le supplier_id en texte libre.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS supplier_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES sav_cases(id) ON DELETE CASCADE,

  -- Lien vers le rapport d'inspection (recommandation)
  inspection_report_id uuid REFERENCES inspection_reports(id),

  -- Fournisseur (texte libre car fournisseur externe possible)
  supplier_id text NOT NULL,
  supplier_name text,

  -- Demande de retour au fournisseur
  requested_at timestamptz,
  request_method text,
  request_reference text,           -- Numéro de référence de la demande

  -- Description du colis envoyé (JSON structuré)
  -- Format : [{"product_id": "...", "quantity": 1, "condition": "defective", "reason": "..."}]
  items_returned jsonb DEFAULT '[]',

  -- Réponse du fournisseur
  supplier_response text DEFAULT 'pending',
  supplier_response_at timestamptz,
  supplier_response_note text,

  -- Avoir / Crédit (le fournisseur propose souvent un crédit plutôt qu'un remboursement)
  credit_amount numeric(12,2) DEFAULT 0,
  credit_currency text DEFAULT 'CNY',
  credit_received_at timestamptz,
  credit_applied_to_case boolean DEFAULT false,  -- L'avoir a-t-il été appliqué au dossier ?

  -- Lien vers le trajet logistique (KawZone → fournisseur)
  return_shipment_id uuid REFERENCES return_shipments(id),

  -- Meta
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

-- Contraintes CHECK
ALTER TABLE supplier_returns
  ADD CONSTRAINT chk_supplier_returns_method 
    CHECK (request_method IN (
      'email', 'platform_api', 'phone', 'agent', 'wechat'
    )),
  ADD CONSTRAINT chk_supplier_returns_response 
    CHECK (supplier_response IN (
      'pending', 'accepted_full', 'accepted_partial', 'refused',
      'no_response', 'counter_offer', 'requested_more_info'
    ));

-- Indexes
CREATE INDEX idx_supplier_returns_case_id ON supplier_returns(case_id);
CREATE INDEX idx_supplier_returns_supplier ON supplier_returns(supplier_id);
CREATE INDEX idx_supplier_returns_response ON supplier_returns(supplier_response);
CREATE INDEX idx_supplier_returns_credit ON supplier_returns(credit_applied_to_case) 
  WHERE credit_applied_to_case = true;

-- Trigger updated_at (réutilise la fonction créée en step 1)
CREATE TRIGGER trg_supplier_returns_updated_at
  BEFORE UPDATE ON supplier_returns
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
ALTER TABLE supplier_returns ENABLE ROW LEVEL SECURITY;

-- Admin : accès total
CREATE POLICY "supplier_returns_admin_all" ON supplier_returns
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur 
    JOIN roles r ON ur.role_id = r.id 
    WHERE ur.user_id = auth.uid() AND r.name = 'admin'
  ));

-- Lecture pour tous les users authentifiés
CREATE POLICY "supplier_returns_auth_read" ON supplier_returns
  FOR SELECT
  TO authenticated
  USING (true);
