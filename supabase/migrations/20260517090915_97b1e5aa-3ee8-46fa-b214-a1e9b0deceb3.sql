-- Ensure product codes are scoped per independent shop/vendor, never globally.
DO $$
DECLARE
  global_constraint_name text;
  global_index_name text;
BEGIN
  -- Drop any accidental single-column UNIQUE constraint on products.code.
  SELECT c.conname INTO global_constraint_name
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.conrelid = 'public.products'::regclass
    AND c.contype = 'u'
    AND array_length(c.conkey, 1) = 1
    AND a.attname = 'code'
  LIMIT 1;

  IF global_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.products DROP CONSTRAINT %I', global_constraint_name);
  END IF;

  -- Drop any accidental single-column UNIQUE index on products.code.
  SELECT i.relname INTO global_index_name
  FROM pg_index ix
  JOIN pg_class i ON i.oid = ix.indexrelid
  JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = ANY (ix.indkey)
  WHERE ix.indrelid = 'public.products'::regclass
    AND ix.indisunique = true
    AND ix.indisprimary = false
    AND array_length(ix.indkey, 1) = 1
    AND a.attname = 'code'
  LIMIT 1;

  IF global_index_name IS NOT NULL THEN
    EXECUTE format('DROP INDEX IF EXISTS public.%I', global_index_name);
  END IF;
END $$;

-- Keep / recreate the canonical marketplace constraint: one code per shop only.
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_vendor_code_unique;

ALTER TABLE public.products
  ADD CONSTRAINT products_vendor_code_unique UNIQUE (vendor_id, code);

CREATE OR REPLACE FUNCTION public.product_code_exists_in_shop(
  _shop_id uuid,
  _code text,
  _exclude_product_id uuid DEFAULT NULL::uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.vendor_id = _shop_id
      AND p.code = btrim(_code)
      AND (_exclude_product_id IS NULL OR p.id <> _exclude_product_id)
  )
$$;