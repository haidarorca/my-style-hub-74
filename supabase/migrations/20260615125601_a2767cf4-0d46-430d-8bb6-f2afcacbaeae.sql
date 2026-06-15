ALTER TABLE public.order_article_states
  ADD COLUMN IF NOT EXISTS settlement jsonb;

COMMENT ON COLUMN public.order_article_states.settlement IS
  'Exécution financière d''une décision article. NULL = pas (encore) requis ou pas applicable. Forme: { type: refund|credit|complement|none, amount, cost_attribution: kawzone|vendor|shared, shared_split?, reference, processed_at, processed_by }. Voir helper requiresSettlement(stock_break) pour savoir si une décision exige un settlement.';