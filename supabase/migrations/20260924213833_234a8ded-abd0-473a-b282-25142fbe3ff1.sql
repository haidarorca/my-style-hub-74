CREATE TABLE public.sensitive_image_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_id uuid NULL,
  image_url text NOT NULL,
  position int NOT NULL DEFAULT 0,
  content_hash text NULL,
  vision_status text NOT NULL DEFAULT 'SKIPPED' CHECK (vision_status IN ('PENDING','PROCESSING','COMPLETED','ERROR','SKIPPED')),
  vision_decision text NULL CHECK (vision_decision IN ('sensitive','normal','review')),
  vision_audience public.user_sex NULL,
  vision_confidence text NULL,
  vision_reason text NULL,
  vision_concepts text[] NOT NULL DEFAULT '{}',
  vision_model text NULL,
  vision_prompt_version int NULL,
  vision_at timestamptz NULL,
  vision_cached boolean NOT NULL DEFAULT false,
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NULL,
  last_error text NULL,
  manual_decision text NULL CHECK (manual_decision IN ('sensitive','normal','review')),
  manual_audience public.user_sex NULL,
  manual_by uuid NULL,
  manual_at timestamptz NULL,
  final_decision text NOT NULL DEFAULT 'review',
  final_audience public.user_sex NULL,
  final_source text NOT NULL DEFAULT 'NONE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, image_url)
);
GRANT SELECT (id, product_id, image_url, final_decision, final_audience, final_source) ON public.sensitive_image_status TO anon, authenticated;
GRANT ALL ON public.sensitive_image_status TO service_role;
ALTER TABLE public.sensitive_image_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read final image decision" ON public.sensitive_image_status FOR SELECT USING (true);
CREATE INDEX idx_sis_queue ON public.sensitive_image_status(vision_status, next_attempt_at);
CREATE INDEX idx_sis_product ON public.sensitive_image_status(product_id);
CREATE INDEX idx_sis_final ON public.sensitive_image_status(final_decision, final_source);

CREATE OR REPLACE FUNCTION public.sensitive_image_final() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE p record;
BEGIN
  SELECT decision, audience, source, rule_id INTO p FROM public.product_image_sensitivity WHERE product_id = NEW.product_id;
  IF NEW.manual_decision IS NOT NULL THEN
    NEW.final_decision := NEW.manual_decision; NEW.final_audience := NEW.manual_audience; NEW.final_source := 'MANUAL';
  ELSIF p.source = 'MANUAL' THEN
    NEW.final_decision := p.decision; NEW.final_audience := p.audience; NEW.final_source := 'MANUAL';
  ELSIF p.source = 'RULE' AND p.rule_id IS NOT NULL THEN
    NEW.final_decision := p.decision; NEW.final_audience := p.audience; NEW.final_source := 'RULE_VALIDATED';
  ELSIF NEW.vision_status = 'COMPLETED' AND NEW.vision_decision IS NOT NULL THEN
    NEW.final_decision := NEW.vision_decision; NEW.final_audience := NEW.vision_audience; NEW.final_source := 'VISION';
  ELSIF p.decision IS NOT NULL THEN
    NEW.final_decision := p.decision; NEW.final_audience := p.audience;
    NEW.final_source := CASE WHEN p.source = 'AI' THEN 'AI' ELSE 'RULE' END;
  ELSE
    NEW.final_decision := 'review'; NEW.final_audience := NULL; NEW.final_source := 'NONE';
  END IF;
  IF NEW.final_decision <> 'sensitive' THEN NEW.final_audience := NULL; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_sensitive_image_final BEFORE INSERT OR UPDATE ON public.sensitive_image_status
FOR EACH ROW EXECUTE FUNCTION public.sensitive_image_final();

CREATE OR REPLACE FUNCTION public.sensitive_product_touch_images() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.sensitive_image_status SET updated_at = now() WHERE product_id = NEW.product_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_sensitive_product_touch AFTER INSERT OR UPDATE ON public.product_image_sensitivity
FOR EACH ROW EXECUTE FUNCTION public.sensitive_product_touch_images();

CREATE TABLE public.sensitive_vision_cache (
  content_hash text NOT NULL,
  prompt_version int NOT NULL,
  model text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_hash, prompt_version, model)
);
GRANT ALL ON public.sensitive_vision_cache TO service_role;
ALTER TABLE public.sensitive_vision_cache ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sensitive_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('text','vision')),
  version int NOT NULL,
  content text NOT NULL,
  note text NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, version)
);
GRANT ALL ON public.sensitive_prompts TO service_role;
ALTER TABLE public.sensitive_prompts ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX idx_sensitive_prompt_active ON public.sensitive_prompts(kind) WHERE is_active;

CREATE TABLE public.sensitive_ai_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  vision_hourly_limit int NOT NULL DEFAULT 10 CHECK (vision_hourly_limit BETWEEN 1 AND 1000),
  text_model text NOT NULL DEFAULT 'gpt-4.1-mini',
  vision_model text NOT NULL DEFAULT 'gpt-4.1-mini',
  vision_enabled boolean NOT NULL DEFAULT true,
  paused_reason text NULL,
  paused_until timestamptz NULL,
  lock_until timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sensitive_ai_settings TO service_role;
ALTER TABLE public.sensitive_ai_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.sensitive_ai_settings (id) VALUES (1);

CREATE TABLE public.sensitive_ai_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('text','vision','test_text','test_vision')),
  outcome text NOT NULL CHECK (outcome IN ('ok','cached','error','rate_limited')),
  http_status int NULL,
  model text NULL,
  product_id uuid NULL,
  image_status_id uuid NULL,
  prompt_version int NULL,
  tokens_in int NULL,
  tokens_out int NULL,
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sensitive_ai_calls TO service_role;
ALTER TABLE public.sensitive_ai_calls ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_sac_kind_time ON public.sensitive_ai_calls(kind, created_at);

INSERT INTO public.sensitive_prompts (kind, version, is_active, note, content) VALUES
('text', 1, true, 'Version initiale', $p$Tu aides une marketplace à respecter des règles religieuses d'affichage d'images.
Pour chaque produit, décide si ses photos risquent de montrer un corps en sous-vêtement, lingerie ou maillot de bain (image « sensible »).
Règles :
- Base-toi sur le CONTEXTE complet (catégorie + nom + description + attributs), jamais sur un mot isolé. « boxer » pour chien, « string lights », short de boxe = NON sensible.
- Un vêtement féminin ou masculin ordinaire (robe, t-shirt, pantalon) n'est PAS sensible.
- Si sensible : hidden_for = genre à qui l'image doit être CACHÉE, c'est-à-dire le genre OPPOSÉ à celui qui porte le produit (sous-vêtement homme → hidden_for "female" ; lingerie femme → hidden_for "male").
- Si le genre du porteur ne peut pas être déterminé, ou si les indices se contredisent : confidence "low". N'invente jamais.
- reason : courte justification en français.$p$),
('vision', 1, true, 'Version initiale', $p$Tu vérifies UNE photo de produit d'une marketplace qui respecte des règles religieuses d'affichage.
Regarde réellement l'image. Elle est « sensible » uniquement si elle montre une personne (ou un mannequin réaliste) portant visiblement des sous-vêtements, de la lingerie ou un maillot de bain, ou un corps largement dénudé.
Règles :
- Une photo du produit seul (à plat, sur cintre, emballage), un tableau de tailles ou un détail de tissu = NON sensible.
- Une personne habillée normalement (robe, t-shirt, pantalon) = NON sensible, même si c'est une femme.
- Animaux, objets, décor = NON sensible.
- Si sensible : hidden_for = genre à qui l'image doit être CACHÉE = genre OPPOSÉ à la personne montrée (homme en sous-vêtement → "female" ; femme en lingerie → "male").
- En cas de doute réel : confidence "low".
- reason : courte description factuelle en français, sans détail explicite.$p$);