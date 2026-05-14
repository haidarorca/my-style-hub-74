ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS is_edit boolean NOT NULL DEFAULT false;