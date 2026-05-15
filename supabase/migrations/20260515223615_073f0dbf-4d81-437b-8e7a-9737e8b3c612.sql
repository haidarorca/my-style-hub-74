
-- Ajout colonne order_id
ALTER TABLE public.product_reviews
  ADD COLUMN IF NOT EXISTS order_id uuid;

-- Index unique : un seul avis par (user, commande, produit)
CREATE UNIQUE INDEX IF NOT EXISTS product_reviews_unique_per_order
  ON public.product_reviews (user_id, order_id, product_id)
  WHERE order_id IS NOT NULL;

-- Remplacement de la policy d'insertion : exiger un achat livré
DROP POLICY IF EXISTS reviews_self_insert ON public.product_reviews;

CREATE POLICY reviews_self_insert ON public.product_reviews
  FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      auth.uid() = user_id
      AND order_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.order_id = product_reviews.order_id
          AND oi.product_id = product_reviews.product_id
          AND o.buyer_id = auth.uid()
          AND o.status = 'delivered'
      )
    )
  );

-- Mise à jour : restreindre aussi pour cohérence
DROP POLICY IF EXISTS reviews_self_update ON public.product_reviews;
CREATE POLICY reviews_self_update ON public.product_reviews
  FOR UPDATE
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
