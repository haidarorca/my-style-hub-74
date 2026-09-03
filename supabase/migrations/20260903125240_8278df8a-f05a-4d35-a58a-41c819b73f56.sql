GRANT EXECUTE ON FUNCTION public.kawscan_is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kawscan_is_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kawscan_can_manage(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.kawscan_after_store_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.kawscan_subscriptions (store_id, status, starts_at, ends_at)
  VALUES (NEW.id, 'active', now(), now() + interval '30 days')
  ON CONFLICT (store_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kawscan_after_store_insert ON public.kawscan_stores;
CREATE TRIGGER trg_kawscan_after_store_insert
AFTER INSERT ON public.kawscan_stores
FOR EACH ROW EXECUTE FUNCTION public.kawscan_after_store_insert();

INSERT INTO public.kawscan_subscriptions (store_id, status, starts_at, ends_at)
SELECT s.id, 'active', now(), now() + interval '30 days'
FROM public.kawscan_stores s
LEFT JOIN public.kawscan_subscriptions sub ON sub.store_id = s.id
WHERE sub.id IS NULL;