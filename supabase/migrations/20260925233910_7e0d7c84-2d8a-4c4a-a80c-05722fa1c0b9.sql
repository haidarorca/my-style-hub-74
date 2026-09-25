ALTER TABLE public.products ADD COLUMN IF NOT EXISTS has_size_guide boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.variant_has_measurements(m jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE((
    SELECT bool_or((v.value #>> '{}') ~ '^[0-9]*\.?[0-9]+$' AND (v.value #>> '{}')::numeric > 0)
    FROM jsonb_each(COALESCE(m, '{}'::jsonb)) v
    WHERE jsonb_typeof(m) = 'object'
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.refresh_products_size_guide(_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.products p
  SET has_size_guide = COALESCE((
    SELECT bool_or(public.variant_has_measurements(pv.measurements))
    FROM public.product_variants pv
    WHERE pv.product_id = p.id
  ), false)
  WHERE p.id = ANY(_ids)
    AND p.has_size_guide IS DISTINCT FROM COALESCE((
      SELECT bool_or(public.variant_has_measurements(pv.measurements))
      FROM public.product_variants pv
      WHERE pv.product_id = p.id
    ), false);
$$;

CREATE OR REPLACE FUNCTION public.tg_variants_size_guide()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ids uuid[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT product_id) INTO ids FROM old_rows;
  ELSIF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT product_id) INTO ids FROM new_rows;
  ELSE
    SELECT array_agg(DISTINCT product_id) INTO ids FROM (
      SELECT product_id FROM new_rows UNION SELECT product_id FROM old_rows
    ) s;
  END IF;
  IF ids IS NOT NULL THEN
    PERFORM public.refresh_products_size_guide(ids);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS pv_size_guide_ins ON public.product_variants;
DROP TRIGGER IF EXISTS pv_size_guide_upd ON public.product_variants;
DROP TRIGGER IF EXISTS pv_size_guide_del ON public.product_variants;

CREATE TRIGGER pv_size_guide_ins AFTER INSERT ON public.product_variants
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.tg_variants_size_guide();

CREATE TRIGGER pv_size_guide_upd AFTER UPDATE ON public.product_variants
REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.tg_variants_size_guide();

CREATE TRIGGER pv_size_guide_del AFTER DELETE ON public.product_variants
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.tg_variants_size_guide();

UPDATE public.products p
SET has_size_guide = true
WHERE EXISTS (
  SELECT 1 FROM public.product_variants pv
  WHERE pv.product_id = p.id
    AND public.variant_has_measurements(pv.measurements)
) AND has_size_guide = false;