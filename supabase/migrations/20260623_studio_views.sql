-- ============================================================
-- Migration : Table studio_views — KawZone Studio MVP
-- Date : 2026-06-23
-- Commit : Phase 1
-- ============================================================

-- Table de persistance des configurations de vues Studio
CREATE TABLE IF NOT EXISTS studio_views (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  description     text,
  template_key    text NOT NULL CHECK (template_key IN ('articles_vendus', 'sous_commandes', 'produits')),
  config          jsonb NOT NULL DEFAULT '{}',
  created_by      uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE studio_views IS 'Configurations sauvegardees des vues KawZone Studio (Vues Configurables)';

-- Index
CREATE INDEX IF NOT EXISTS idx_studio_views_created_by ON studio_views(created_by);
CREATE INDEX IF NOT EXISTS idx_studio_views_template_key ON studio_views(template_key);

-- RLS — admin et super_admin uniquement
ALTER TABLE studio_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "studio_views_select_admin"
  ON studio_views FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "studio_views_insert_admin"
  ON studio_views FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "studio_views_update_admin"
  ON studio_views FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "studio_views_delete_admin"
  ON studio_views FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );
