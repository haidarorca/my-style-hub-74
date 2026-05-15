REVOKE ALL ON FUNCTION public.resolve_commission(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_commission(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_product_display_price(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_display_prices(uuid[], uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resolve_commission(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_commission(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_product_display_price(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_display_prices(uuid[], uuid) TO service_role;