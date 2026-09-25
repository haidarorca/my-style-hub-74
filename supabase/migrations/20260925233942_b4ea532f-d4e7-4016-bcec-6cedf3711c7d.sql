CREATE OR REPLACE FUNCTION public.variant_has_measurements(m jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT bool_or((v.value #>> '{}') ~ '^[0-9]*\.?[0-9]+$' AND (v.value #>> '{}')::numeric > 0)
    FROM jsonb_each(COALESCE(m, '{}'::jsonb)) v
    WHERE jsonb_typeof(m) = 'object'
  ), false)
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_products_size_guide(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_variants_size_guide() FROM PUBLIC, anon, authenticated;