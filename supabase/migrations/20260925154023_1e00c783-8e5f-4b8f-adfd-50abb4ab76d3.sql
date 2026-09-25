ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cj_stock_status text,
  ADD COLUMN IF NOT EXISTS cj_stock_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS cj_stock_issues jsonb,
  ADD COLUMN IF NOT EXISTS cj_send_lock_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS orders_cj_order_id_unique ON public.orders (cj_order_id) WHERE cj_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_cj_stock_issue_idx ON public.orders (cj_stock_status) WHERE cj_stock_status = 'issue';

-- Verrou atomique d'envoi CJ : une seule tentative à la fois, jamais si déjà liée.
CREATE OR REPLACE FUNCTION public.cj_try_lock_order_send(_order_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE public.orders SET cj_send_lock_at = now()
  WHERE id = _order_id AND cj_order_id IS NULL
    AND (cj_send_lock_at IS NULL OR cj_send_lock_at < now() - interval '5 minutes');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;
REVOKE ALL ON FUNCTION public.cj_try_lock_order_send(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cj_try_lock_order_send(uuid) TO service_role;