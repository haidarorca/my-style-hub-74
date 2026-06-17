-- ============================================================
-- MIGRATION: Système d'adresses international Kawzone (corrigée)
-- Tables: geo_regions, geo_cities, addresses, vendor_warehouses
-- ============================================================

-- Activer l'extension pg_trgm pour la recherche fuzzy (si pas déjà activée)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Table geo_regions (Régions / États / Provinces)
CREATE TABLE IF NOT EXISTS public.geo_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id UUID NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(country_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.geo_regions TO authenticated;
GRANT ALL ON public.geo_regions TO service_role;
ALTER TABLE public.geo_regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read regions" ON public.geo_regions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage regions" ON public.geo_regions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_geo_regions_country ON public.geo_regions(country_id);
CREATE INDEX IF NOT EXISTS idx_geo_regions_name ON public.geo_regions USING gin(name gin_trgm_ops);

-- 2. Table geo_cities (Villes)
CREATE TABLE IF NOT EXISTS public.geo_cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id UUID NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  region_id UUID REFERENCES public.geo_regions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(country_id, region_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.geo_cities TO authenticated;
GRANT ALL ON public.geo_cities TO service_role;
ALTER TABLE public.geo_cities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cities" ON public.geo_cities
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage cities" ON public.geo_cities
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_geo_cities_country ON public.geo_cities(country_id);
CREATE INDEX IF NOT EXISTS idx_geo_cities_region ON public.geo_cities(region_id);
CREATE INDEX IF NOT EXISTS idx_geo_cities_name ON public.geo_cities USING gin(name gin_trgm_ops);

-- 3. Table addresses (polymorphe unique)
CREATE TABLE IF NOT EXISTS public.addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'vendor', 'shop', 'order', 'guest', 'supplier')),
  owner_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'shipping' CHECK (type IN ('shipping', 'billing', 'pickup', 'warehouse')),
  label TEXT,
  is_default BOOLEAN DEFAULT false,
  full_name TEXT,
  phone TEXT,
  phone_alt TEXT,
  country_id UUID REFERENCES public.countries(id),
  region_id UUID REFERENCES public.geo_regions(id),
  city_id UUID REFERENCES public.geo_cities(id),
  region_text TEXT,
  city_text TEXT,
  neighborhood_text TEXT,
  postal_code TEXT,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  landmark TEXT,
  latitude DECIMAL(10,8),
  longitude DECIMAL(10,8),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses TO authenticated;
GRANT ALL ON public.addresses TO service_role;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own addresses" ON public.addresses
  FOR ALL TO authenticated
  USING (auth.uid()::text = owner_id OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (auth.uid()::text = owner_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_addresses_owner ON public.addresses(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_addresses_country ON public.addresses(country_id);
CREATE INDEX IF NOT EXISTS idx_addresses_region ON public.addresses(region_id);
CREATE INDEX IF NOT EXISTS idx_addresses_city ON public.addresses(city_id);
CREATE INDEX IF NOT EXISTS idx_addresses_type ON public.addresses(type);

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION public.update_addresses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_addresses_updated_at ON public.addresses;
CREATE TRIGGER trigger_addresses_updated_at
  BEFORE UPDATE ON public.addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_addresses_updated_at();

-- 4. Table vendor_warehouses
CREATE TABLE IF NOT EXISTS public.vendor_warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id TEXT NOT NULL,
  name TEXT NOT NULL,
  address_id UUID REFERENCES public.addresses(id) ON DELETE SET NULL,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_warehouses TO authenticated;
GRANT ALL ON public.vendor_warehouses TO service_role;
ALTER TABLE public.vendor_warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendors can manage their own warehouses" ON public.vendor_warehouses
  FOR ALL TO authenticated
  USING (auth.uid()::text = vendor_id OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (auth.uid()::text = vendor_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_vendor_warehouses_vendor ON public.vendor_warehouses(vendor_id);

DROP TRIGGER IF EXISTS trigger_vendor_warehouses_updated_at ON public.vendor_warehouses;
CREATE TRIGGER trigger_vendor_warehouses_updated_at
  BEFORE UPDATE ON public.vendor_warehouses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_addresses_updated_at();

-- 5. Fonction utilitaire: migration conditionnelle depuis customer_addresses
CREATE OR REPLACE FUNCTION public.migrate_customer_addresses()
RETURNS INTEGER AS $$
DECLARE
  migrated_count INTEGER := 0;
  old_rec RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customer_addresses') THEN
    RETURN 0;
  END IF;

  FOR old_rec IN SELECT * FROM public.customer_addresses LOOP
    INSERT INTO public.addresses (
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

-- Commentaires
COMMENT ON TABLE public.geo_regions IS 'Régions / États / Provinces par pays.';
COMMENT ON TABLE public.geo_cities IS 'Villes par région et pays.';
COMMENT ON TABLE public.addresses IS 'Table polymorphe unique pour toutes les adresses du système.';
COMMENT ON TABLE public.vendor_warehouses IS 'Entrepôts des vendeurs.';