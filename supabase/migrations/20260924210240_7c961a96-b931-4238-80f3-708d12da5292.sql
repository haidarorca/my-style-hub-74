CREATE TABLE public.product_image_sensitivity (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('sensitive','normal','review')),
  audience public.user_sex NULL,
  source text NOT NULL CHECK (source IN ('RULE','AI','MANUAL')),
  confidence text NULL,
  reason text NULL,
  concepts text[] NOT NULL DEFAULT '{}',
  matched_term text NULL,
  rule_id uuid NULL,
  input_hash text NOT NULL,
  analyzed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_image_sensitivity TO anon, authenticated;
GRANT ALL ON public.product_image_sensitivity TO service_role;
ALTER TABLE public.product_image_sensitivity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read sensitivity" ON public.product_image_sensitivity FOR SELECT USING (true);
CREATE INDEX idx_pis_decision ON public.product_image_sensitivity(decision);

CREATE TABLE public.sensitive_image_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('sensitive','normal')),
  audience public.user_sex NULL,
  origin text NOT NULL CHECK (origin IN ('AI','MANUAL')),
  hits integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (term, category_id)
);
GRANT ALL ON public.sensitive_image_rules TO service_role;
ALTER TABLE public.sensitive_image_rules ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sensitive_input_hash(p public.products)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT md5(coalesce(p.name,'') || '|' || coalesce(p.description,'') || '|' || coalesce(p.category_id::text,''))
$$;

CREATE OR REPLACE FUNCTION public.sensitive_pending_products(_limit int)
RETURNS TABLE(id uuid, name text, description text, category_id uuid, material text, input_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name, p.description, p.category_id, p.material, public.sensitive_input_hash(p)
  FROM public.products p
  LEFT JOIN public.product_image_sensitivity s ON s.product_id = p.id
  WHERE s.product_id IS NULL OR s.input_hash <> public.sensitive_input_hash(p)
  ORDER BY p.created_at DESC
  LIMIT _limit
$$;
CREATE OR REPLACE FUNCTION public.sensitive_pending_count()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FROM public.products p
  LEFT JOIN public.product_image_sensitivity s ON s.product_id = p.id
  WHERE s.product_id IS NULL OR s.input_hash <> public.sensitive_input_hash(p)
$$;
REVOKE EXECUTE ON FUNCTION public.sensitive_pending_products(int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sensitive_pending_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sensitive_pending_products(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.sensitive_pending_count() TO service_role;