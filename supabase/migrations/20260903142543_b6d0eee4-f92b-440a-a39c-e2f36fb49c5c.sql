CREATE OR REPLACE FUNCTION public.kawscan_next_internal_code(_store_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next bigint;
BEGIN
  IF NOT public.kawscan_can_manage(_store_id, auth.uid()) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT COALESCE(MAX((code)::bigint), 0) + 1
    INTO _next
    FROM public.kawscan_products
   WHERE store_id = _store_id
     AND code ~ '^[0-9]{1,15}$';

  RETURN _next::text;
END;
$$;

REVOKE ALL ON FUNCTION public.kawscan_next_internal_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kawscan_next_internal_code(uuid) TO authenticated, service_role;