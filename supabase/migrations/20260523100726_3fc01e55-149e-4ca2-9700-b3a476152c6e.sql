CREATE TABLE IF NOT EXISTS public.import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    store_url TEXT NOT NULL,
    store_name TEXT,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed', 'error')),
    total_imported INTEGER NOT NULL DEFAULT 0,
    last_offset INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_batches_vendor ON public.import_batches(vendor_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_status ON public.import_batches(status);
CREATE INDEX IF NOT EXISTS idx_import_batches_store_url ON public.import_batches(store_url);

CREATE TABLE IF NOT EXISTS public.import_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
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
    suggested_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    suggested_category_name TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'discarded')),
    duplicate_of TEXT,
    ai_metadata JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_products_batch ON public.import_products(batch_id);
CREATE INDEX IF NOT EXISTS idx_import_products_vendor ON public.import_products(vendor_id);
CREATE INDEX IF NOT EXISTS idx_import_products_status ON public.import_products(status);
CREATE INDEX IF NOT EXISTS idx_import_products_source_url ON public.import_products(source_url);
CREATE INDEX IF NOT EXISTS idx_import_products_duplicate ON public.import_products(duplicate_of) WHERE duplicate_of IS NOT NULL;

DROP TRIGGER IF EXISTS trg_import_batches_updated ON public.import_batches;
CREATE TRIGGER trg_import_batches_updated
    BEFORE UPDATE ON public.import_batches
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_import_products_updated ON public.import_products;
CREATE TRIGGER trg_import_products_updated
    BEFORE UPDATE ON public.import_products
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_batches ON public.import_batches;
CREATE POLICY admin_all_batches ON public.import_batches
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS admin_all_products ON public.import_products;
CREATE POLICY admin_all_products ON public.import_products
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS vendor_own_batches ON public.import_batches;
CREATE POLICY vendor_own_batches ON public.import_batches
    FOR ALL
    USING (vendor_id = auth.uid())
    WITH CHECK (vendor_id = auth.uid());

DROP POLICY IF EXISTS vendor_own_products ON public.import_products;
CREATE POLICY vendor_own_products ON public.import_products
    FOR ALL
    USING (vendor_id = auth.uid())
    WITH CHECK (vendor_id = auth.uid());