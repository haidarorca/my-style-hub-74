ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS validation_mode text,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_reasons text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_source_check;
ALTER TABLE public.products ADD CONSTRAINT products_source_check CHECK (source IN ('cj_import','manual','other'));
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_validation_mode_check;
ALTER TABLE public.products ADD CONSTRAINT products_validation_mode_check CHECK (validation_mode IS NULL OR validation_mode IN ('auto','manual'));

UPDATE public.products SET source = 'cj_import' WHERE external_product_id IS NOT NULL AND source <> 'cj_import';
UPDATE public.products SET validation_mode = 'manual' WHERE status = 'approved' AND validation_mode IS NULL;

-- Raisons « À vérifier » pour les produits CJ encore en attente
UPDATE public.products p SET review_reasons = ARRAY_REMOVE(ARRAY[
  CASE WHEN p.category_id IS NULL THEN 'Catégorie à attribuer' END,
  CASE WHEN NOT EXISTS (SELECT 1 FROM public.product_images i WHERE i.product_id = p.id) THEN 'Image principale absente' END,
  CASE WHEN p.cost_price IS NULL THEN 'Prix d''achat absent' END,
  CASE WHEN COALESCE(p.price,0) <= 0 THEN 'Prix de vente non calculé' END,
  CASE WHEN NOT EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id) THEN 'Aucune variante' END,
  CASE WHEN EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id AND v.weight_kg IS NULL) THEN 'Poids manquant sur une variante' END
], NULL)
WHERE p.source = 'cj_import' AND p.status = 'pending';

-- Le vendeur ne peut pas modifier l'origine ni la validation
CREATE OR REPLACE FUNCTION public.protect_product_source_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR current_setting('role', true) IN ('service_role','postgres','supabase_admin')
     OR public.has_role(v_uid, 'admin'::app_role) OR public.is_super_admin(v_uid) THEN
    RETURN NEW;
  END IF;
  IF NEW.source IS DISTINCT FROM OLD.source OR NEW.validation_mode IS DISTINCT FROM OLD.validation_mode
     OR NEW.validated_at IS DISTINCT FROM OLD.validated_at THEN
    RAISE EXCEPTION 'Champs de validation réservés à l''administration.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_product_source ON public.products;
CREATE TRIGGER trg_protect_product_source BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.protect_product_source_fields();

CREATE INDEX IF NOT EXISTS idx_products_mod_status_created ON public.products (status, created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_source_status ON public.products (source, status);
CREATE INDEX IF NOT EXISTS idx_products_vendor_status_created ON public.products (vendor_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_review_reasons ON public.products USING gin (review_reasons);
CREATE INDEX IF NOT EXISTS idx_products_sku_trgm ON public.products USING gin (sku extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_shop_name_trgm ON public.profiles USING gin (shop_name extensions.gin_trgm_ops);