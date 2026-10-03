-- Aucun produit CJ sans image ne peut être publié (garde-fou base, toutes voies confondues).
CREATE OR REPLACE FUNCTION public.guard_cj_publish_without_image()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.source = 'cj_import' AND NEW.is_active IS TRUE
     AND (TG_OP = 'INSERT' OR OLD.is_active IS DISTINCT FROM TRUE)
     AND NOT EXISTS (SELECT 1 FROM public.product_images i WHERE i.product_id = NEW.id) THEN
    NEW.is_active := false;
    NEW.status := 'pending';
    NEW.validation_mode := NULL;
    NEW.review_reasons := (SELECT array_agg(DISTINCT r) FROM unnest(coalesce(NEW.review_reasons, '{}') || ARRAY['Image principale absente']) r);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_cj_publish_without_image ON public.products;
CREATE TRIGGER trg_guard_cj_publish_without_image
BEFORE INSERT OR UPDATE OF is_active ON public.products
FOR EACH ROW EXECUTE FUNCTION public.guard_cj_publish_without_image();

-- Blocage (sans suppression) des produits CJ actuellement publiés sans image.
UPDATE public.products p
SET is_active = false, status = 'pending', validation_mode = NULL,
    review_reasons = (SELECT array_agg(DISTINCT r) FROM unnest(coalesce(p.review_reasons, '{}') || ARRAY['Image principale absente']) r)
WHERE p.source = 'cj_import' AND p.archived_at IS NULL
  AND (p.is_active OR p.status = 'approved')
  AND NOT EXISTS (SELECT 1 FROM public.product_images i WHERE i.product_id = p.id);