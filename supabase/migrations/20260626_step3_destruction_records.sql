-- ============================================================
-- Migration Step 3 : destruction_records
-- KawZone ERP — Système de gestion des retours
-- ============================================================
-- Date : 2026-06-26
-- Principe : Documentation fiscale des destructions
-- Dépendances : sav_cases (existante), inspection_reports (step 2), profiles (existante)
-- ============================================================

-- ------------------------------------------------------------
-- TABLE : destruction_records
-- ------------------------------------------------------------
-- But : Archiver chaque destruction avec preuve. Fiscalement,
-- un produit détruit = une perte qui doit être justifiée.
--
-- Exigences :
--   - 2 signatures (destroyed_by + witnessed_by) → anti-fraude
--   - Photos du produit avant destruction
--   - Méthode de destruction (recyclage, enfouissement...)
--   - Valeur détruite pour les rapports financiers
--   - Certificat de destruction (PDF scanné)
--
-- Chaque destruction = 1 ligne. Lien vers inspection_report
-- pour traçabilité complète (qui a décidé → qui a exécuté).
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS destruction_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES sav_cases(id) ON DELETE CASCADE,

  -- Lien vers le rapport d'inspection qui a recommandé la destruction
  inspection_report_id uuid REFERENCES inspection_reports(id),

  -- Méthode de destruction
  method text NOT NULL,

  -- Double signature (anti-fraude)
  destroyed_by uuid REFERENCES profiles(id),
  witnessed_by uuid REFERENCES profiles(id),
  destroyed_at timestamptz NOT NULL DEFAULT now(),

  -- Documentation visuelle
  photos text[] DEFAULT '{}',       -- Photos du produit avant destruction
  certificate_url text,              -- URL du certificat de destruction (PDF)

  -- Valeur détruite (pour les rapports financiers et comptables)
  original_value numeric(12,2),      -- Valeur d'achat originale
  original_currency text DEFAULT 'XOF',

  -- Commentaire obligatoire (justification de la destruction)
  reason text NOT NULL,

  -- Meta
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

-- Contrainte CHECK sur la méthode
ALTER TABLE destruction_records
  ADD CONSTRAINT chk_destruction_records_method 
    CHECK (method IN (
      'recycling',     -- Recyclage matière
      'landfill',      -- Enfouissement
      'incineration',  -- Incinération
      'donation',      -- Don (destruction symbolique)
      'resale_destruction', -- Destruction après revente en l'état
      'other'          -- Autre (préciser dans reason)
    ));

-- Indexes
CREATE INDEX idx_destruction_records_case_id ON destruction_records(case_id);
CREATE INDEX idx_destruction_records_inspection ON destruction_records(inspection_report_id);
CREATE INDEX idx_destruction_records_destroyed_at ON destruction_records(destroyed_at);

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
ALTER TABLE destruction_records ENABLE ROW LEVEL SECURITY;

-- Admin : accès total
CREATE POLICY "destruction_records_admin_all" ON destruction_records
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur 
    JOIN roles r ON ur.role_id = r.id 
    WHERE ur.user_id = auth.uid() AND r.name = 'admin'
  ));

-- Lecture pour tous les users authentifiés
CREATE POLICY "destruction_records_auth_read" ON destruction_records
  FOR SELECT
  TO authenticated
  USING (true);
