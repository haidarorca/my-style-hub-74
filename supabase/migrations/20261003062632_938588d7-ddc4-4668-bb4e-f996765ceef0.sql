ALTER TABLE public.sensitive_image_rules
  ALTER COLUMN term DROP NOT NULL,
  ALTER COLUMN category_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS engine text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'branch',
  ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS exclusions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS fields text[] NOT NULL DEFAULT '{name,designation}',
  ADD COLUMN IF NOT EXISTS source_lang text,
  ADD COLUMN IF NOT EXISTS match_mode text NOT NULL DEFAULT 'word',
  ADD COLUMN IF NOT EXISTS combine text NOT NULL DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS classification text,
  ADD COLUMN IF NOT EXISTS protection text NOT NULL DEFAULT 'placeholder',
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS proposal jsonb,
  ADD COLUMN IF NOT EXISTS matched_count integer,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE public.sensitive_image_rules DROP CONSTRAINT IF EXISTS sensitive_image_rules_decision_check;
ALTER TABLE public.sensitive_image_rules ADD CONSTRAINT sensitive_image_rules_decision_check CHECK (decision IN ('sensitive','normal','review'));
ALTER TABLE public.sensitive_image_rules ADD CONSTRAINT sir_engine_chk CHECK (engine IN ('legacy','builder'));
ALTER TABLE public.sensitive_image_rules ADD CONSTRAINT sir_scope_chk CHECK (scope IN ('exact','branch'));
ALTER TABLE public.sensitive_image_rules ADD CONSTRAINT sir_mode_chk CHECK (match_mode IN ('contains','word','phrase','prefix'));
ALTER TABLE public.sensitive_image_rules ADD CONSTRAINT sir_combine_chk CHECK (combine IN ('any','all'));
ALTER TABLE public.sensitive_image_rules ADD CONSTRAINT sir_protection_chk CHECK (protection IN ('hide','blur','placeholder'));
ALTER TABLE public.sensitive_image_rules ADD CONSTRAINT sir_status_chk CHECK (status IN ('active','inactive','proposed','rejected'));
ALTER TABLE public.sensitive_image_rules ADD CONSTRAINT sir_builder_target_chk CHECK (engine = 'legacy' OR category_id IS NOT NULL OR cardinality(keywords) > 0);
CREATE INDEX IF NOT EXISTS idx_sir_builder ON public.sensitive_image_rules(engine, status);

CREATE TABLE IF NOT EXISTS public.sensitive_classifications (
  key text PRIMARY KEY,
  label text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('sensitive','normal','review')),
  audience public.user_sex NULL,
  color text NOT NULL DEFAULT 'muted',
  position integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.sensitive_classifications TO authenticated;
GRANT ALL ON public.sensitive_classifications TO service_role;
ALTER TABLE public.sensitive_classifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read classifications" ON public.sensitive_classifications FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
INSERT INTO public.sensitive_classifications(key,label,decision,audience,color,position) VALUES
  ('femme','Sensible Femme','sensitive','femme','destructive',1),
  ('homme','Sensible Homme','sensitive','homme','primary',2),
  ('normal','Non sensible','normal',NULL,'success',3),
  ('review','À vérifier','review',NULL,'warning',4)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.product_image_sensitivity
  ADD COLUMN IF NOT EXISTS protection text NOT NULL DEFAULT 'placeholder';
CREATE INDEX IF NOT EXISTS idx_pis_rule ON public.product_image_sensitivity(rule_id) WHERE rule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pis_ai_pending ON public.product_image_sensitivity(product_id) WHERE confidence = 'ai_pending';

-- Images : recalcul aussi quand une décision produit est retirée.
CREATE OR REPLACE FUNCTION public.sensitive_product_untouch_images() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.sensitive_image_status SET updated_at = now() WHERE product_id = OLD.product_id;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_sensitive_product_untouch ON public.product_image_sensitivity;
CREATE TRIGGER trg_sensitive_product_untouch AFTER DELETE ON public.product_image_sensitivity
FOR EACH ROW EXECUTE FUNCTION public.sensitive_product_untouch_images();

CREATE OR REPLACE FUNCTION public.sensitive_rule_candidates(_cat_ids uuid[], _patterns text[], _fields text[], _after uuid, _limit int)
RETURNS TABLE(id uuid, name text, designation text, description text, category_id uuid, source_lang text, variants text, attributes text, image_url text, image_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  WITH t AS (
    SELECT b.id, b.name, b.designation,
      CASE WHEN 'description' = ANY(_fields) THEN b.description END AS description,
      b.category_id, b.source_lang,
      CASE WHEN 'variants' = ANY(_fields) THEN (SELECT string_agg(concat_ws(' ', v.color, v.size, v.cj_options::text), ' | ') FROM public.product_variants v WHERE v.product_id = b.id) END AS variants,
      CASE WHEN 'attributes' = ANY(_fields) THEN concat_ws(' ', b.material, b.specifications::text, b.gender, b.age_group) END AS attributes
    FROM public.products b
    WHERE b.deleted_at IS NULL
      AND (_cat_ids IS NULL OR b.category_id = ANY(_cat_ids))
      AND (_after IS NULL OR b.id > _after)
  )
  SELECT t.*,
    (SELECT i.url FROM public.product_images i WHERE i.product_id = t.id ORDER BY i.position LIMIT 1),
    (SELECT count(*)::int FROM public.product_images i WHERE i.product_id = t.id)
  FROM t
  WHERE _patterns IS NULL OR cardinality(_patterns) = 0 OR lower(extensions.unaccent(concat_ws(' ',
     CASE WHEN 'name' = ANY(_fields) THEN t.name END,
     CASE WHEN 'designation' = ANY(_fields) THEN t.designation END,
     t.description, t.variants, t.attributes))) LIKE ANY(_patterns)
  ORDER BY t.id
  LIMIT _limit
$$;
REVOKE EXECUTE ON FUNCTION public.sensitive_rule_candidates(uuid[], text[], text[], uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sensitive_rule_candidates(uuid[], text[], text[], uuid, int) TO service_role;

CREATE OR REPLACE FUNCTION public.sensitive_pending_products2(_limit int, _with_ai boolean)
RETURNS TABLE(id uuid, name text, description text, category_id uuid, material text, input_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name, p.description, p.category_id, p.material, public.sensitive_input_hash(p)
  FROM public.products p
  LEFT JOIN public.product_image_sensitivity s ON s.product_id = p.id
  WHERE p.deleted_at IS NULL AND (s.product_id IS NULL OR s.input_hash <> public.sensitive_input_hash(p)
     OR (_with_ai AND s.source = 'RULE' AND s.confidence = 'ai_pending'))
  ORDER BY p.created_at DESC
  LIMIT _limit
$$;
CREATE OR REPLACE FUNCTION public.sensitive_pending_count2(_with_ai boolean)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FROM public.products p
  LEFT JOIN public.product_image_sensitivity s ON s.product_id = p.id
  WHERE p.deleted_at IS NULL AND (s.product_id IS NULL OR s.input_hash <> public.sensitive_input_hash(p)
     OR (_with_ai AND s.source = 'RULE' AND s.confidence = 'ai_pending'))
$$;
REVOKE EXECUTE ON FUNCTION public.sensitive_pending_products2(int, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sensitive_pending_count2(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sensitive_pending_products2(int, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.sensitive_pending_count2(boolean) TO service_role;