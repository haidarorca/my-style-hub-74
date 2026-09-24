ALTER TABLE public.products ADD COLUMN IF NOT EXISTS specifications jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_status text;

CREATE OR REPLACE FUNCTION public.recompute_supplier_stock_status(_product_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ext text; _n int; _avail int; _unknown int; _sum numeric; _status text;
BEGIN
  SELECT external_product_id INTO _ext FROM products WHERE id = _product_id;
  IF _ext IS NULL THEN RETURN; END IF;
  SELECT count(*),
         count(*) FILTER (WHERE supplier_available IS DISTINCT FROM false AND coalesce(supplier_stock, 1) > 0),
         count(*) FILTER (WHERE supplier_stock IS NULL AND supplier_available IS DISTINCT FROM false),
         coalesce(sum(supplier_stock) FILTER (WHERE supplier_stock > 0), 0)
    INTO _n, _avail, _unknown, _sum
  FROM product_variants WHERE product_id = _product_id;
  IF _n = 0 THEN _status := NULL;
  ELSIF _avail = 0 THEN _status := 'out';
  ELSIF _unknown = 0 AND _sum <= 10 THEN _status := 'low';
  ELSE _status := 'in';
  END IF;
  UPDATE products SET stock_status = _status WHERE id = _product_id AND stock_status IS DISTINCT FROM _status;
END $$;
REVOKE ALL ON FUNCTION public.recompute_supplier_stock_status(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_variant_supplier_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.supplier_stock IS NOT NULL THEN
    NEW.supplier_available := NEW.supplier_stock > 0;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.trg_variant_supplier_stock() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_variant_stock_status_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_supplier_stock_status(COALESCE(NEW.product_id, OLD.product_id));
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.trg_variant_stock_status_after() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS variant_supplier_stock_before ON public.product_variants;
CREATE TRIGGER variant_supplier_stock_before BEFORE INSERT OR UPDATE OF supplier_stock ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.trg_variant_supplier_stock();

DROP TRIGGER IF EXISTS variant_stock_status_after ON public.product_variants;
CREATE TRIGGER variant_stock_status_after AFTER INSERT OR DELETE OR UPDATE OF supplier_stock, supplier_available ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.trg_variant_stock_status_after();

UPDATE public.product_variants SET supplier_available = (supplier_stock > 0) WHERE supplier_stock IS NOT NULL AND supplier_available IS DISTINCT FROM (supplier_stock > 0);
SELECT public.recompute_supplier_stock_status(id) FROM public.products WHERE external_product_id IS NOT NULL;