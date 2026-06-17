
-- Enum for moderation steps
DO $$ BEGIN
  CREATE TYPE public.moderation_step AS ENUM (
    'name','code','designation','description','category','subcategory',
    'images','price','stock','variants','countries','global'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.moderation_decision AS ENUM ('approved','rejected','changes_requested');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Templates table
CREATE TABLE IF NOT EXISTS public.moderation_reason_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step public.moderation_step NOT NULL,
  label text NOT NULL,
  video_url text,
  is_default boolean NOT NULL DEFAULT false,
  is_enabled boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mrt_step ON public.moderation_reason_templates(step) WHERE is_enabled = true;

ALTER TABLE public.moderation_reason_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mrt_admin_all ON public.moderation_reason_templates;
CREATE POLICY mrt_admin_all ON public.moderation_reason_templates
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS mrt_vendor_read ON public.moderation_reason_templates;
CREATE POLICY mrt_vendor_read ON public.moderation_reason_templates
  FOR SELECT USING (true);

CREATE TRIGGER trg_mrt_updated_at BEFORE UPDATE ON public.moderation_reason_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Feedback table
CREATE TABLE IF NOT EXISTS public.product_moderation_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  admin_id uuid NOT NULL,
  decision public.moderation_decision NOT NULL,
  global_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pmf_product ON public.product_moderation_feedback(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pmf_vendor ON public.product_moderation_feedback(vendor_id, created_at DESC);

ALTER TABLE public.product_moderation_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pmf_admin_all ON public.product_moderation_feedback;
CREATE POLICY pmf_admin_all ON public.product_moderation_feedback
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS pmf_vendor_read ON public.product_moderation_feedback;
CREATE POLICY pmf_vendor_read ON public.product_moderation_feedback
  FOR SELECT USING (auth.uid() = vendor_id);

-- Feedback items
CREATE TABLE IF NOT EXISTS public.product_moderation_feedback_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES public.product_moderation_feedback(id) ON DELETE CASCADE,
  step public.moderation_step NOT NULL,
  reason_text text NOT NULL,
  video_url text,
  position integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pmfi_feedback ON public.product_moderation_feedback_items(feedback_id);

ALTER TABLE public.product_moderation_feedback_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pmfi_admin_all ON public.product_moderation_feedback_items;
CREATE POLICY pmfi_admin_all ON public.product_moderation_feedback_items
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS pmfi_vendor_read ON public.product_moderation_feedback_items;
CREATE POLICY pmfi_vendor_read ON public.product_moderation_feedback_items
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.product_moderation_feedback f
    WHERE f.id = feedback_id AND f.vendor_id = auth.uid()
  ));

-- Seed default templates
INSERT INTO public.moderation_reason_templates (step, label, is_default, position) VALUES
  ('name', 'Veuillez écrire un nom clair en français.', true, 1),
  ('name', 'Veuillez éviter le nom en chinois, car il ne sera pas traduit automatiquement.', true, 2),
  ('name', 'Veuillez écrire un nom plus professionnel et compréhensible pour le client.', true, 3),
  ('category', 'Veuillez choisir la bonne catégorie.', true, 1),
  ('category', 'Si la catégorie n''existe pas, veuillez faire une demande de création de catégorie.', true, 2),
  ('category', 'Veuillez choisir une catégorie plus précise.', true, 3),
  ('subcategory', 'Veuillez choisir la bonne sous-catégorie.', true, 1),
  ('images', 'Veuillez ajouter des images plus claires du produit.', true, 1),
  ('images', 'Veuillez retirer les images contenant du texte ou un filigrane.', true, 2),
  ('images', 'Veuillez ajouter plus d''images sous différents angles.', true, 3),
  ('description', 'Veuillez écrire une description plus détaillée du produit.', true, 1),
  ('description', 'Veuillez traduire la description en français.', true, 2),
  ('designation', 'Veuillez corriger la désignation du produit.', true, 1),
  ('code', 'Le code produit est invalide ou déjà utilisé.', true, 1),
  ('price', 'Le prix ne correspond pas au marché, veuillez le corriger.', true, 1),
  ('price', 'Le prix semble erroné, veuillez vérifier.', true, 2),
  ('stock', 'Veuillez indiquer un stock correct.', true, 1),
  ('variants', 'Veuillez corriger les variantes (taille, couleur).', true, 1),
  ('variants', 'Veuillez ajouter les variantes disponibles.', true, 2),
  ('countries', 'Veuillez vérifier les pays de livraison sélectionnés.', true, 1),
  ('global', 'Merci de corriger ces éléments puis renvoyer le produit pour validation.', true, 1),
  ('global', 'Produit conforme, en attente de petites corrections.', true, 2)
ON CONFLICT DO NOTHING;
