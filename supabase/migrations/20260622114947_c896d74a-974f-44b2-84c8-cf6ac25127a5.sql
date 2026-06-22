
-- Brands table (anti-doublon par slug normalisé)
CREATE TABLE IF NOT EXISTS public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.brands TO anon, authenticated;
GRANT INSERT, UPDATE ON public.brands TO authenticated;
GRANT ALL ON public.brands TO service_role;

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brands are readable by everyone"
  ON public.brands FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create brands"
  ON public.brands FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can update brands"
  ON public.brands FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Slug normalization trigger
CREATE OR REPLACE FUNCTION public.brands_normalize_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.name := btrim(NEW.name);
  -- lowercase, strip accents (best-effort via translate), collapse non-alnum to dash
  NEW.slug := regexp_replace(
    lower(translate(NEW.name,
      'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
      'aaaaaaceeeeiiiinooooouuuuyyaaaaaaceeeeiiiinooooouuuuy'
    )),
    '[^a-z0-9]+', '-', 'g'
  );
  NEW.slug := btrim(NEW.slug, '-');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS brands_normalize_slug_trg ON public.brands;
CREATE TRIGGER brands_normalize_slug_trg
  BEFORE INSERT OR UPDATE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.brands_normalize_slug();

-- Products: nouveaux champs
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS material_composition_items jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS season text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS age_group text,
  ADD COLUMN IF NOT EXISTS care_instructions text[] DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS products_brand_id_idx ON public.products(brand_id);
