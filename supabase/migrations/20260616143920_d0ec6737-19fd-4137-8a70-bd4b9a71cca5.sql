
-- Phase A — Fondations métier des filtres Cockpit

-- 1. Soft-delete boutique (vendor profile)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS profiles_active_idx ON public.profiles (id) WHERE deleted_at IS NULL;

-- 2. Soft-delete produit
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS products_active_idx ON public.products (id) WHERE deleted_at IS NULL;

-- 3. Pays origine produit
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS origin_country_id uuid NULL REFERENCES public.countries(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS products_origin_country_idx ON public.products (origin_country_id);

-- 4. Snapshots sur order_items (preservation historique)
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS shop_name_snapshot text NULL,
  ADD COLUMN IF NOT EXISTS shop_country_id_snapshot uuid NULL,
  ADD COLUMN IF NOT EXISTS shop_type_snapshot text NULL CHECK (shop_type_snapshot IN ('admin','commission','autonomous') OR shop_type_snapshot IS NULL),
  ADD COLUMN IF NOT EXISTS product_origin_country_id_snapshot uuid NULL,
  ADD COLUMN IF NOT EXISTS is_admin_shop_snapshot boolean NULL;
