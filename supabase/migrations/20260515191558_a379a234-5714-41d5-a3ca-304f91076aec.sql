ALTER TABLE public.commission_rules DROP CONSTRAINT commission_rules_scope_check;
ALTER TABLE public.commission_rules ADD CONSTRAINT commission_rules_scope_check
  CHECK (scope = ANY (ARRAY['global'::text, 'vendor'::text, 'category'::text, 'product'::text, 'country_pair'::text]));