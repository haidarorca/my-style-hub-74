-- ============================================================
-- MIGRATION: Système d'adresses international Kawzone
-- Tables: addresses, geo_regions, geo_cities
-- ============================================================

-- 1. Table geo_regions (Régions / États / Provinces)
-- Ultra-légère: 4 colonnes utiles
CREATE TABLE IF NOT EXISTS geo_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id TEXT NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(country_id, name)
);

-- Index pour recherche rapide par pays
CREATE INDEX IF NOT EXISTS idx_geo_regions_country ON geo_regions(country_id);
CREATE INDEX IF NOT EXISTS idx_geo_regions_name ON geo_regions USING gin(name gin_trgm_ops);

-- 2. Table geo_cities (Villes)
-- Ultra-légère: 5 colonnes utiles
CREATE TABLE IF NOT EXISTS geo_cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id TEXT NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  region_id UUID REFERENCES geo_regions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(country_id, region_id, name)
);

-- Index pour cascade pays → région → ville
CREATE INDEX IF NOT EXISTS idx_geo_cities_country ON geo_cities(country_id);
CREATE INDEX IF NOT EXISTS idx_geo_cities_region ON geo_cities(region_id);
CREATE INDEX IF NOT EXISTS idx_geo_cities_name ON geo_cities USING gin(name gin_trgm_ops);

-- 3. Table addresses (unique table pour toutes les adresses)
-- Polymorphe: owner_type + owner_id permet d'attacher à n'importe quelle entité
CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Polymorphisme: propriétaire de l'adresse
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'vendor', 'shop', 'order', 'guest', 'supplier')),
  owner_id TEXT NOT NULL,

  -- Typologie d'adresse
  type TEXT NOT NULL DEFAULT 'shipping' CHECK (type IN ('shipping', 'billing', 'pickup', 'warehouse')),
  label TEXT,                           -- "Maison", "Bureau", "Entrepôt"
  is_default BOOLEAN DEFAULT false,

  -- Contact
  full_name TEXT,
  phone TEXT,
  phone_alt TEXT,

  -- Hiérarchie géographique (FK normalisées)
  country_id TEXT REFERENCES countries(id),
  region_id UUID REFERENCES geo_regions(id),
  city_id UUID REFERENCES geo_cities(id),

  -- Fallback texte (quand pas encore dans les tables geo)
  region_text TEXT,
  city_text TEXT,

  -- Adresse détaillée
  neighborhood_text TEXT,
  postal_code TEXT,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  landmark TEXT,                        -- "Près de la mosquée", "Face Total"

  -- Géolocalisation
  latitude DECIMAL(10,8),
  longitude DECIMAL(10,8),

  -- Métadonnées
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index composites pour performances
CREATE INDEX IF NOT EXISTS idx_addresses_owner ON addresses(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_addresses_country ON addresses(country_id);
CREATE INDEX IF NOT EXISTS idx_addresses_region ON addresses(region_id);
CREATE INDEX IF NOT EXISTS idx_addresses_city ON addresses(city_id);
CREATE INDEX IF NOT EXISTS idx_addresses_type ON addresses(type);

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_addresses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_addresses_updated_at ON addresses;
CREATE TRIGGER trigger_addresses_updated_at
  BEFORE UPDATE ON addresses
  FOR EACH ROW
  EXECUTE FUNCTION update_addresses_updated_at();

-- 4. Fonction utilitaire: copier customer_addresses vers addresses
-- À exécuter manuellement après déploiement pour la migration des données
CREATE OR REPLACE FUNCTION migrate_customer_addresses()
RETURNS INTEGER AS $$
DECLARE
  migrated_count INTEGER := 0;
  old_rec RECORD;
BEGIN
  FOR old_rec IN SELECT * FROM customer_addresses LOOP
    INSERT INTO addresses (
      owner_type, owner_id, type, label, is_default,
      full_name, phone, phone_alt,
      country_id, city_text,
      address_line1, note,
      latitude, longitude,
      created_at, updated_at
    ) VALUES (
      'user', old_rec.user_id, 'shipping', old_rec.label, old_rec.is_default,
      old_rec.full_name, old_rec.phone, old_rec.phone_alt,
      old_rec.destination_country_id, old_rec.city,
      old_rec.address, old_rec.note,
      old_rec.latitude, old_rec.longitude,
      old_rec.created_at, old_rec.updated_at
    );
    migrated_count := migrated_count + 1;
  END LOOP;

  RETURN migrated_count;
END;
$$ LANGUAGE plpgsql;

-- Activer l'extension pg_trgm pour la recherche fuzzy (si pas déjà activée)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Commentaires pour documentation
COMMENT ON TABLE geo_regions IS 'Régions / États / Provinces par pays. Vide au départ, peuplé via CSV ou manuellement.';
COMMENT ON TABLE geo_cities IS 'Villes par région et pays. Vide au départ, peuplé via CSV ou manuellement.';
COMMENT ON TABLE addresses IS 'Table polymorphe unique pour toutes les adresses du système. Remplace customer_addresses.';
