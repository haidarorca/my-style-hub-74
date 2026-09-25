CREATE OR REPLACE FUNCTION public.translation_seed_dictionary()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inserted int;
BEGIN
  WITH vals AS (
    SELECT 'opt_value'::text AS kind, btrim(color) AS v FROM product_variants WHERE color IS NOT NULL
    UNION SELECT 'opt_value', btrim(size) FROM product_variants WHERE size IS NOT NULL
    UNION SELECT 'opt_value', btrim(e.value) FROM product_variants pv,
      jsonb_each_text(CASE WHEN jsonb_typeof(pv.cj_options)='object' THEN pv.cj_options ELSE '{}'::jsonb END) e
    UNION SELECT 'opt_name', btrim(e.key) FROM product_variants pv,
      jsonb_each_text(CASE WHEN jsonb_typeof(pv.cj_options)='object' THEN pv.cj_options ELSE '{}'::jsonb END) e
  ), d AS (
    SELECT DISTINCT ON (vals.kind, lower(vals.v)) vals.kind AS k, lower(vals.v) AS nv, vals.v AS ov FROM vals WHERE length(vals.v) BETWEEN 1 AND 200
  )
  INSERT INTO translation_dictionary(kind, src_norm, src) SELECT d.k, d.nv, d.ov FROM d
  ON CONFLICT (kind, src_norm) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END $$;