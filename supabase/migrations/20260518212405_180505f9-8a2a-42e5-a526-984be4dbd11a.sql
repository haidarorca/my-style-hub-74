-- Optimisation: calcul des prix panier en un seul appel
-- Renvoie les mêmes lignes que N appels à get_product_display_price.
CREATE OR REPLACE FUNCTION public.get_display_price_lines_batch(
  _lines jsonb,
  _destination_country_id uuid DEFAULT NULL
)
RETURNS TABLE(
  product_id uuid,
  variant_id uuid,
  base_price numeric,
  final_price numeric,
  commission_rate numeric,
  commission_amount numeric,
  commission_rule_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.product_id, r.variant_id, r.base_price, r.final_price,
         r.commission_rate, r.commission_amount, r.commission_rule_id
  FROM jsonb_array_elements(COALESCE(_lines, '[]'::jsonb)) AS l
  CROSS JOIN LATERAL public.get_product_display_price(
    (l->>'product_id')::uuid,
    NULLIF(l->>'variant_id', '')::uuid,
    _destination_country_id
  ) AS r;
$$;

GRANT EXECUTE ON FUNCTION public.get_display_price_lines_batch(jsonb, uuid) TO anon, authenticated;