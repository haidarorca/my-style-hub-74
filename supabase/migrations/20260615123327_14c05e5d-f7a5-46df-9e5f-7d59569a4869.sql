-- ════════════════════════════════════════════════════════════════
-- Cockpit Kawzone — Persistance article-centric (Phase fondation)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE public.order_article_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  variant_id uuid,
  -- Statut article (libre, validé côté app via les enums TS) :
  -- pending | available | ordered | partial_stock | no_stock | shipped | received | ready | delivered | returned | refunded
  status text NOT NULL DEFAULT 'pending',
  delivered_qty integer NOT NULL DEFAULT 0,
  -- Décision de rupture + règlement financier (structure exacte : voir src/cockpit/lib/article-states.ts → OrderArticle.stock_break)
  stock_break jsonb,
  -- Concurrence multi-admin (optimistic locking)
  version integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unicité par (commande, produit, variante). NULL traité comme valeur via COALESCE.
CREATE UNIQUE INDEX order_article_states_unique
  ON public.order_article_states (order_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Index pour vues transverses futures (tous remboursements, toutes attentes réappro, etc.)
CREATE INDEX order_article_states_order_idx ON public.order_article_states (order_id);
CREATE INDEX order_article_states_status_idx ON public.order_article_states (status);
CREATE INDEX order_article_states_stock_break_action_idx
  ON public.order_article_states ((stock_break->>'action'))
  WHERE stock_break IS NOT NULL;

-- GRANTs (Data API)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_article_states TO authenticated;
GRANT ALL ON public.order_article_states TO service_role;

-- RLS : admin / super_admin uniquement
ALTER TABLE public.order_article_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage article states"
  ON public.order_article_states
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

-- Trigger updated_at + version auto-incrément à chaque UPDATE
CREATE OR REPLACE FUNCTION public.tg_order_article_states_bump()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN
    NEW.version := COALESCE(OLD.version, 1) + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER order_article_states_bump
  BEFORE INSERT OR UPDATE ON public.order_article_states
  FOR EACH ROW EXECUTE FUNCTION public.tg_order_article_states_bump();
