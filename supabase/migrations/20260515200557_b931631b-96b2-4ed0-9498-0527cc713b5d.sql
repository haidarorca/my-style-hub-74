DROP INDEX IF EXISTS public.commission_rules_category_uniq;

CREATE UNIQUE INDEX commission_rules_category_uniq
ON public.commission_rules (
  category_id,
  COALESCE(vendor_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(source_country_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(destination_country_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
WHERE scope = 'category';