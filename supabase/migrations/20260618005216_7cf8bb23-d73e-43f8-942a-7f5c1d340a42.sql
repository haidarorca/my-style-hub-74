ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(10,3) NULL,
  ADD COLUMN IF NOT EXISTS length_cm INTEGER NULL,
  ADD COLUMN IF NOT EXISTS width_cm INTEGER NULL,
  ADD COLUMN IF NOT EXISTS height_cm INTEGER NULL,
  ADD COLUMN IF NOT EXISTS weight_source TEXT NULL CHECK (weight_source IN ('vendor_declared', 'measured_at_hub')),
  ADD COLUMN IF NOT EXISTS source_country_id UUID NULL REFERENCES countries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_source_country_id ON products(source_country_id);
CREATE INDEX IF NOT EXISTS idx_products_weight_kg ON products(weight_kg) WHERE weight_kg IS NOT NULL;

COMMENT ON COLUMN products.weight_kg IS 'Poids réel en kg. Déclaré par le vendeur ou mesuré au hub.';
COMMENT ON COLUMN products.length_cm IS 'Longueur en cm pour calcul volumétrique.';
COMMENT ON COLUMN products.width_cm IS 'Largeur en cm pour calcul volumétrique.';
COMMENT ON COLUMN products.height_cm IS 'Hauteur en cm pour calcul volumétrique.';
COMMENT ON COLUMN products.weight_source IS 'vendor_declared = vendeur connaît le poids, measured_at_hub = mesuré à l''arrivée.';
COMMENT ON COLUMN products.source_country_id IS 'Pays d''origine. Défaut = source_country_id du vendeur. Permet surcharge stock local.';