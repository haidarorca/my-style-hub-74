ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS material text,
  ADD COLUMN IF NOT EXISTS material_composition text;