-- Ajoute la clé de sous-commande sur les évaluations logistiques
-- pour permettre plusieurs assessments par commande (un par circuit).
ALTER TABLE public.order_shipment_assessments
  ADD COLUMN IF NOT EXISTS sub_order_key TEXT;

-- Rendre air_freight_fee nullable (un assessment "unknown" n'a pas de fret tant qu'aucune pesée n'est saisie)
ALTER TABLE public.order_shipment_assessments
  ALTER COLUMN air_freight_fee DROP NOT NULL;

-- Supprimer une éventuelle contrainte unique sur order_id seul
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'public.order_shipment_assessments'::regclass
    AND contype = 'u'
    AND array_length(conkey, 1) = 1
    AND conkey = ARRAY[
      (SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.order_shipment_assessments'::regclass AND attname = 'order_id')
    ]::int2[];
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.order_shipment_assessments DROP CONSTRAINT %I', c);
  END IF;
END $$;

-- Index pour requêtes par (order_id, sub_order_key)
CREATE INDEX IF NOT EXISTS idx_order_shipment_assessments_order_subkey
  ON public.order_shipment_assessments(order_id, sub_order_key);

-- Table de statut par sous-commande (workflow indépendant)
CREATE TABLE IF NOT EXISTS public.sub_order_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sub_order_key TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, sub_order_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sub_order_states TO authenticated;
GRANT ALL ON public.sub_order_states TO service_role;

ALTER TABLE public.sub_order_states ENABLE ROW LEVEL SECURITY;

-- Lecture : le client peut lire les statuts de ses propres commandes ; admin peut tout lire
CREATE POLICY "Buyers can read own sub-order states"
  ON public.sub_order_states FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = sub_order_states.order_id
        AND (o.buyer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- Écriture : admin uniquement
CREATE POLICY "Admins manage sub-order states"
  ON public.sub_order_states FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));