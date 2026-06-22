
-- Vague 3 — Workflow d'échange + notifications + stock
-- 1) Colonnes de lien d'échange sur order_items
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS is_exchange_replacement boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exchange_source_case_id uuid REFERENCES public.sav_cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_exchange_id uuid REFERENCES public.sav_exchanges(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_exchange_source_case ON public.order_items(exchange_source_case_id);
CREATE INDEX IF NOT EXISTS idx_order_items_source_exchange ON public.order_items(source_exchange_id);

-- 2) Canal + payload sur notifications (préparation WhatsApp/email)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS event_key text;

CREATE INDEX IF NOT EXISTS idx_notifications_event_key ON public.notifications(event_key);

-- 3) RPC stock — toute écriture passe par ici (audit + futur module stock)
CREATE OR REPLACE FUNCTION public.apply_stock_delta(
  _variant_id uuid,
  _delta integer,
  _reason text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new integer;
BEGIN
  IF _variant_id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.product_variants
     SET stock = GREATEST(0, COALESCE(stock, 0) + _delta)
   WHERE id = _variant_id
   RETURNING stock INTO v_new;
  IF v_new IS NULL THEN
    RAISE EXCEPTION 'Variant % not found', _variant_id;
  END IF;
  -- Audit léger (réutilise admin_action_log si admin authentifié)
  IF auth.uid() IS NOT NULL THEN
    PERFORM public.log_admin_action(
      'stock.delta',
      'product_variant',
      _variant_id::text,
      jsonb_build_object('delta', _delta, 'new_stock', v_new, 'reason', _reason)
    );
  END IF;
  RETURN v_new;
END $$;

REVOKE ALL ON FUNCTION public.apply_stock_delta(uuid, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_stock_delta(uuid, integer, text) TO authenticated, service_role;

-- 4) Helper: comptage SAV par scope, pour les sidebars
CREATE OR REPLACE FUNCTION public.get_sav_counts(_scope text)
RETURNS TABLE(new_count bigint, pending_count bigint, urgent_count bigint, total_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_urgent_cutoff timestamptz := now() + interval '24 hours';
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, 0::bigint; RETURN;
  END IF;

  IF _scope = 'admin' THEN
    IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.is_super_admin(v_uid)) THEN
      RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, 0::bigint; RETURN;
    END IF;
    RETURN QUERY
      SELECT
        COUNT(*) FILTER (WHERE status = 'open')::bigint,
        COUNT(*) FILTER (WHERE status IN ('open','vendor_responded','in_review','waiting','in_arbitration','escalated'))::bigint,
        COUNT(*) FILTER (WHERE sla_deadline_at IS NOT NULL AND sla_deadline_at < v_urgent_cutoff AND status NOT IN ('closed','resolved'))::bigint,
        COUNT(*)::bigint
      FROM public.sav_cases
      WHERE status NOT IN ('closed','resolved');
  ELSIF _scope = 'vendor' THEN
    RETURN QUERY
      SELECT
        COUNT(*) FILTER (WHERE status = 'open' AND vendor_recommendation = 'none')::bigint,
        COUNT(*) FILTER (WHERE status IN ('open','waiting_vendor') AND vendor_recommendation = 'none')::bigint,
        COUNT(*) FILTER (WHERE sla_deadline_at IS NOT NULL AND sla_deadline_at < v_urgent_cutoff AND status NOT IN ('closed','resolved'))::bigint,
        COUNT(*)::bigint
      FROM public.sav_cases
      WHERE vendor_id = v_uid
        AND status NOT IN ('closed','resolved');
  ELSE -- client
    RETURN QUERY
      SELECT
        COUNT(*) FILTER (WHERE status = 'open')::bigint,
        COUNT(*) FILTER (WHERE status IN ('open','waiting_client','vendor_responded','in_review','in_arbitration'))::bigint,
        COUNT(*) FILTER (WHERE sla_deadline_at IS NOT NULL AND sla_deadline_at < v_urgent_cutoff AND status NOT IN ('closed','resolved'))::bigint,
        COUNT(*)::bigint
      FROM public.sav_cases sc
      WHERE (
        sc.on_behalf_of_user_id = v_uid
        OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = sc.order_id AND o.buyer_id = v_uid)
      )
      AND status NOT IN ('closed','resolved');
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.get_sav_counts(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_sav_counts(text) TO authenticated, service_role;
