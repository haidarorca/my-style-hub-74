-- Normalize commission rule uniqueness around the full business key.
-- Product rules: product + optional vendor + source country + destination country.
-- This allows the same product to have distinct commission rates per route.

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        scope,
        product_id,
        category_id,
        vendor_id,
        source_country_id,
        destination_country_id
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS rn
  FROM public.commission_rules
  WHERE scope IN ('product', 'category', 'country_pair', 'vendor')
)
UPDATE public.commission_rules cr
SET
  is_enabled = false,
  note = concat_ws(' ', nullif(cr.note, ''), '[Désactivée automatiquement: doublon de règle commission]'),
  updated_at = now()
FROM ranked r
WHERE cr.id = r.id
  AND r.rn > 1;

DROP INDEX IF EXISTS public.commission_rules_product_uniq;
DROP INDEX IF EXISTS public.commission_rules_category_uniq;
DROP INDEX IF EXISTS public.commission_rules_country_pair_uniq;
DROP INDEX IF EXISTS public.commission_rules_vendor_uniq;

CREATE UNIQUE INDEX commission_rules_product_uniq
ON public.commission_rules (
  product_id,
  COALESCE(vendor_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(source_country_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(destination_country_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
WHERE scope = 'product';

CREATE UNIQUE INDEX commission_rules_category_uniq
ON public.commission_rules (
  category_id,
  COALESCE(vendor_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(source_country_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(destination_country_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
WHERE scope = 'category';

CREATE UNIQUE INDEX commission_rules_country_pair_uniq
ON public.commission_rules (
  COALESCE(source_country_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(destination_country_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
WHERE scope = 'country_pair'
  AND vendor_id IS NULL
  AND category_id IS NULL
  AND product_id IS NULL;

CREATE UNIQUE INDEX commission_rules_vendor_uniq
ON public.commission_rules (
  vendor_id,
  COALESCE(source_country_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(destination_country_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
WHERE scope = 'vendor'
  AND category_id IS NULL
  AND product_id IS NULL;