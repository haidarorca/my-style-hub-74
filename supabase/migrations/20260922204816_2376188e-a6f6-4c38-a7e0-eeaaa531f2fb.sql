
ALTER TABLE public.cj_products ADD COLUMN IF NOT EXISTS source_description text;
ALTER TABLE public.cj_products ADD COLUMN IF NOT EXISTS source_images jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.guard_no_supplier_urls()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bad text;
BEGIN
  IF NEW.external_product_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT (NEW.status = 'approved'::product_status AND NEW.is_active) THEN
    RETURN NEW;
  END IF;

  IF NEW.description ~* 'cjdropshipping' THEN
    RAISE EXCEPTION 'Publication refusée : la description publique contient encore une référence fournisseur (cjdropshipping).';
  END IF;
  IF NEW.name ~* 'cjdropshipping' OR coalesce(NEW.designation,'') ~* 'cjdropshipping' THEN
    RAISE EXCEPTION 'Publication refusée : le nom ou la désignation contient encore une référence fournisseur (cjdropshipping).';
  END IF;

  SELECT url INTO bad FROM public.product_images
   WHERE product_id = NEW.id AND url ~* 'cjdropshipping' LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Publication refusée : une image du produit pointe encore vers le fournisseur (%).', bad;
  END IF;

  SELECT image_url INTO bad FROM public.product_variants
   WHERE product_id = NEW.id AND image_url ~* 'cjdropshipping' LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Publication refusée : une image de variante pointe encore vers le fournisseur (%).', bad;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_no_supplier_urls() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS products_guard_no_supplier_urls ON public.products;
CREATE TRIGGER products_guard_no_supplier_urls
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.guard_no_supplier_urls();
