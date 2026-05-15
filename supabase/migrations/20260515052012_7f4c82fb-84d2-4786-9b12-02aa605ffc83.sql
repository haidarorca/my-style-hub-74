
DROP INDEX IF EXISTS public.commission_rules_product_uniq;
CREATE UNIQUE INDEX commission_rules_product_uniq
  ON public.commission_rules (product_id, COALESCE(vendor_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE scope = 'product';
