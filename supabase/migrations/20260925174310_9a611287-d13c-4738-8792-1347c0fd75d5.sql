ALTER FUNCTION public.kz_human_duration(interval) SET search_path = public;
REVOKE ALL ON FUNCTION public.tg_orders_cockpit_events() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_payment_summary_cockpit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_cockpit_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_cockpit_admin(uuid) TO authenticated, service_role;