-- ============================================================
-- Migration Step 2 : inspection_reports
-- KawZone ERP — Système de gestion des retours
-- ============================================================
-- Date : 2026-06-26
-- Principe : Point de décision critique du workflow retour
-- Dépendances : sav_cases (existante), return_shipments (step 1), profiles (existante)
-- ============================================================

-- ------------------------------------------------------------
-- TABLE : inspection_reports
-- ------------------------------------------------------------
-- But : Documenter l'inspection physique du produit retourné.
-- C'est la FOURCHE DECISIONNELLE du workflow. L'inspecteur :
--   1. Constate l'état réel du produit (10 niveaux)
--   2. Identifie les accessoires présents/manquants
--   3. Vérifie le numéro de série
--   4. Prend une décision de disposition (7 actions)
--   5. Attribue la responsabilité (faute client ?)
--
-- Chaque inspection = 1 ligne. L'unicité est garantie par
-- le case_id (un seul rapport d'inspection par dossier).
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inspection_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES sav_cases(id) ON DELETE CASCADE,

  -- Lien vers le trajet de retour reçu (optionnel mais recommandé)
  return_shipment_id uuid REFERENCES return_shipments(id),

  -- Inspecteur (référence la table profiles des utilisateurs)
  inspected_by uuid NOT NULL REFERENCES profiles(id),
  inspected_at timestamptz NOT NULL DEFAULT now(),

  -- ==========================================================
  -- RÉSULTAT DE L'INSPECTION
  -- ==========================================================
  -- 10 niveaux de condition couvrant tous les cas du neuf scellé
  -- à la contrefaçon. Chaque niveau a une implication différente
  -- sur la décision financière.
  condition text NOT NULL,

  -- Détails physiques constatés
  actual_weight_g integer,              -- Poids réel en grammes
  actual_dimensions_cm integer[],       -- Dimensions [L,l,H] en cm
  accessories_present text[] DEFAULT '{}',  -- Accessoires trouvés
  accessories_missing text[] DEFAULT '{}',  -- Accessoires manquants
  serial_number text,                   -- Numéro de série vérifié

  -- État de l'emballage
  packaging_condition text,

  -- ==========================================================
  -- DÉCISION DE DISPOSITION (aiguillage)
  -- ==========================================================
  -- 7 actions possibles après inspection. Chaque action déclenche
  -- un workflow différent et des coûts différents :
  --   - restock_as_new : remise en stock neuf (remboursement partiel)
  --   - restock_as_used : remise en stock occasion (dépréciation)
  --   - send_to_repair : envoi en réparation
  --   - return_to_supplier : retour fournisseur (crédit CNY)
  --   - destroy : destruction (perte totale)
  --   - donate : don (décharge fiscale)
  --   - pending_decision : expertise nécessaire (décision différée)
  disposition text NOT NULL,

  -- ==========================================================
  -- DOCUMENTATION
  -- ==========================================================
  photos text[] DEFAULT '{}',          -- URLs photos (Supabase Storage)
  videos text[] DEFAULT '{}',          -- URLs vidéos (Supabase Storage)
  findings text,                        -- Constats détaillés (texte libre)
  recommended_action text,              -- Action recommandée par l'inspecteur

  -- ==========================================================
  -- RESPONSABILITÉ
  -- ==========================================================
  -- La faute du client influence directement le montant du
  -- remboursement. Si client_fault = true, des frais de
  -- dépréciation ou de manutention peuvent être appliqués.
  client_fault boolean DEFAULT false,

  -- ==========================================================
  -- FRAIS D'INSPECTION
  -- ==========================================================
  inspection_cost numeric(12,2) DEFAULT 0,
  inspection_cost_currency text DEFAULT 'XOF',
  -- Le payeur est stocké comme texte simple car sav_party est un
  -- type enum existant. Valeurs possibles : 'client', 'kawzone',
  -- 'vendor', 'carrier', 'insurance'
  inspection_cost_payer text DEFAULT 'kawzone',

  -- Meta
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Contraintes CHECK (compatibilité maximale PostgreSQL)
ALTER TABLE inspection_reports
  ADD CONSTRAINT chk_inspection_reports_condition 
    CHECK (condition IN (
      'new_sealed', 'new_opened', 'like_new', 'good', 'fair',
      'damaged_functional', 'damaged_unfunctional', 'incomplete',
      'wrong_product', 'counterfeit'
    )),
  ADD CONSTRAINT chk_inspection_reports_packaging 
    CHECK (packaging_condition IN (
      'original_intact', 'original_damaged', 'original_missing', 'replacement'
    )),
  ADD CONSTRAINT chk_inspection_reports_disposition 
    CHECK (disposition IN (
      'restock_as_new', 'restock_as_used', 'send_to_repair',
      'return_to_supplier', 'destroy', 'donate', 'pending_decision'
    ));

-- Indexes pour les requêtes fréquentes
CREATE INDEX idx_inspection_reports_case_id ON inspection_reports(case_id);
CREATE INDEX idx_inspection_reports_disposition ON inspection_reports(disposition);
CREATE INDEX idx_inspection_reports_inspected_at ON inspection_reports(inspected_at);

-- Trigger updated_at (réutilise la fonction créée en step 1)
CREATE TRIGGER trg_inspection_reports_updated_at
  BEFORE UPDATE ON inspection_reports
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
ALTER TABLE inspection_reports ENABLE ROW LEVEL SECURITY;

-- Admin : accès total
CREATE POLICY "inspection_reports_admin_all" ON inspection_reports
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur 
    JOIN roles r ON ur.role_id = r.id 
    WHERE ur.user_id = auth.uid() AND r.name = 'admin'
  ));

-- Lecture pour tous les users authentifiés
CREATE POLICY "inspection_reports_auth_read" ON inspection_reports
  FOR SELECT
  TO authenticated
  USING (true);
