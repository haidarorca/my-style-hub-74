REVOKE ALL ON FUNCTION public.kawscan_is_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kawscan_is_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kawscan_can_manage(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kawscan_is_admin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.kawscan_is_owner(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.kawscan_can_manage(uuid, uuid) TO service_role;
