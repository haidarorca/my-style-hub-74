
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS warranty_days integer,
  ADD COLUMN IF NOT EXISTS is_fragile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_order_qty integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS variant_ref text;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_min_order_qty_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_min_order_qty_check CHECK (min_order_qty >= 1);

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_warranty_days_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_warranty_days_check CHECK (warranty_days IS NULL OR warranty_days >= 0);
