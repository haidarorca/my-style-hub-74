REVOKE EXECUTE ON FUNCTION public.currency_recompute_summary(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_currency_recompute_batch(text, uuid, integer) FROM PUBLIC, anon;