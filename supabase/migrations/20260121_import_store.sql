-- Migration: import_batches + import_products
-- Système d'importation IA Taobao/1688
-- Date: 2026-01-21

-- ── Table: import_batches ──
-- Mémorise les sessions d'import de boutiques
CREATE TABLE IF NOT EXISTS import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    store_url TEXT NOT NULL,
    store_name TEXT,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed', 'error')),
    total_imported INTEGER NOT NULL DEFAULT 0,
    last_offset INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_batches_vendor ON import_batches(vendor_id);
CREATE INDEX idx_import_batches_status ON import_batches(status);
CREATE INDEX idx_import_batches_store_url ON import_batches(store_url);

-- ── Table: import_products ──
-- Brouillons de produits importés (anti-doublons, édition, validation avant publication)
CREATE TABLE IF NOT EXISTS import_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    source_url TEXT NOT NULL,
    source_store_url TEXT,
    source_product_id TEXT,
    name TEXT NOT NULL DEFAULT '',
    designation TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    source_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    source_currency TEXT NOT NULL DEFAULT 'CNY',
    price NUMERIC(12,2) NOT NULL DEFAULT 0,
    images JSONB NOT NULL DEFAULT '[]'::jsonb,
    variants JSONB NOT NULL DEFAULT '[]'::jsonb,
    suggested_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    suggested_category_name TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'discarded')),
    duplicate_of TEXT,
    ai_metadata JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_products_batch ON import_products(batch_id);
CREATE INDEX idx_import_products_vendor ON import_products(vendor_id);
CREATE INDEX idx_import_products_status ON import_products(status);
CREATE INDEX idx_import_products_source_url ON import_products(source_url);
CREATE INDEX idx_import_products_duplicate ON import_products(duplicate_of) WHERE duplicate_of IS NOT NULL;

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_import_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_import_batches_updated ON import_batches;
CREATE TRIGGER trg_import_batches_updated
    BEFORE UPDATE ON import_batches
    FOR EACH ROW
    EXECUTE FUNCTION update_import_updated_at();

DROP TRIGGER IF EXISTS trg_import_products_updated ON import_products;
CREATE TRIGGER trg_import_products_updated
    BEFORE UPDATE ON import_products
    FOR EACH ROW
    EXECUTE FUNCTION update_import_updated_at();

-- ── RLS Policies ──
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_products ENABLE ROW LEVEL SECURITY;

-- Admins can see all
CREATE POLICY admin_all_batches ON import_batches
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
    );

CREATE POLICY admin_all_products ON import_products
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
    );

-- Vendors can see only their own
CREATE POLICY vendor_own_batches ON import_batches
    FOR ALL USING (vendor_id = auth.uid());

CREATE POLICY vendor_own_products ON import_products
    FOR ALL USING (vendor_id = auth.uid());

-- ── Permission: products ──
-- Lien vers la permission existante pour l'accès vendeur
-- L'admin peut autoriser un vendeur via admin_permissions.permission = 'products'
-- ou via profiles.can_import_store = true
