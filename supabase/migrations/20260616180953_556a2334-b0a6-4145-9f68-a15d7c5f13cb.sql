
-- 1. orders.closed_at
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS closed_at timestamptz NULL;

CREATE OR REPLACE FUNCTION public.tg_orders_set_closed_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('delivered','cancelled') AND (OLD.status IS DISTINCT FROM NEW.status OR NEW.closed_at IS NULL) THEN
    NEW.closed_at := COALESCE(NEW.closed_at, now());
  ELSIF NEW.status NOT IN ('delivered','cancelled') THEN
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_set_closed_at ON public.orders;
CREATE TRIGGER orders_set_closed_at
  BEFORE INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_orders_set_closed_at();

SET LOCAL session_replication_role = replica;
UPDATE public.orders SET closed_at = created_at
  WHERE status IN ('delivered','cancelled') AND closed_at IS NULL;
SET LOCAL session_replication_role = origin;

-- 2. SAV auto sur produit / boutique supprimés
CREATE OR REPLACE FUNCTION public.tg_emit_sav_for_deletion_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_title text;
BEGIN
  IF NEW.event_type IN ('product_deleted','shop_deleted') THEN
    v_title := CASE NEW.event_type
      WHEN 'product_deleted' THEN 'Produit supprimé — commande en cours'
      WHEN 'shop_deleted'    THEN 'Boutique supprimée — commande en cours'
    END;
    IF NOT EXISTS (
      SELECT 1 FROM public.sav_cases s
      WHERE s.order_id = NEW.order_id
        AND COALESCE(s.vendor_id::text,'') = COALESCE(NEW.vendor_id::text,'')
        AND s.problem_type = NEW.event_type::text
        AND s.status <> 'closed'
    ) THEN
      INSERT INTO public.sav_cases (
        order_id, vendor_id, order_item_id, problem_type, status, owner_party,
        title, description, financial_impact_amount, financial_impact_currency,
        created_by, last_activity_at
      ) VALUES (
        NEW.order_id, NEW.vendor_id, NEW.order_item_id, NEW.event_type::text,
        'open', 'kawzone', v_title, NEW.reason, 0, 'XOF',
        NEW.created_by, now()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS emit_sav_for_deletion_event ON public.order_events;
CREATE TRIGGER emit_sav_for_deletion_event
  AFTER INSERT ON public.order_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_emit_sav_for_deletion_event();

-- 3. Vue comptable enrichie (DROP nécessaire pour insérer des colonnes au milieu)
DROP VIEW IF EXISTS public.v_sub_order_accounting;

CREATE VIEW public.v_sub_order_accounting
WITH (security_invoker = true) AS
WITH lines AS (
  SELECT oi.order_id, oi.vendor_id,
         SUM(COALESCE(oi.unit_price, 0) * COALESCE(oi.quantity, 0))::numeric(14,2) AS gross_value
  FROM public.order_items oi
  GROUP BY oi.order_id, oi.vendor_id
),
mvts AS (
  SELECT e.order_id, e.vendor_id,
         d.decision_type, m.movement_type, m.direction, m.amount
  FROM public.financial_movements m
  JOIN public.order_decisions d ON d.id = m.decision_id
  JOIN public.order_events e   ON e.id = d.event_id
),
agg AS (
  SELECT order_id, vendor_id,
    SUM(amount) FILTER (WHERE movement_type = 'cash_out')              AS refunded_value,
    SUM(amount) FILTER (WHERE movement_type = 'cash_in')               AS extra_collected_value,
    SUM(amount) FILTER (WHERE movement_type = 'credit_note_issued')    AS credited_value,
    SUM(amount) FILTER (WHERE movement_type = 'credit_note_used')      AS credit_used_value,
    SUM(amount) FILTER (WHERE movement_type IN ('penalty_kept','penalty_to_vendor')) AS penalty_value,
    SUM(amount) FILTER (WHERE movement_type IN ('loss_kawzone','loss_vendor','loss_shared')) AS loss_value,
    SUM(amount) FILTER (WHERE movement_type = 'commission_due_to_vendor') AS commission_due_value,
    SUM(amount) FILTER (WHERE movement_type = 'commission_paid')        AS commission_paid_value
  FROM mvts
  GROUP BY order_id, vendor_id
),
cancelled AS (
  SELECT e.order_id, e.vendor_id,
         SUM(COALESCE(oi.unit_price,0) * COALESCE(oi.quantity,0))::numeric(14,2) AS cancelled_value
  FROM public.order_decisions d
  JOIN public.order_events e ON e.id = d.event_id
  JOIN public.order_items oi ON oi.id = e.order_item_id
  WHERE d.decision_type IN ('cancel_article','cancel_suborder')
  GROUP BY e.order_id, e.vendor_id
),
pending_refund AS (
  SELECT e.order_id, e.vendor_id,
         SUM(COALESCE((d.payload->>'amount')::numeric, 0))::numeric(14,2) AS expected_refund
  FROM public.order_decisions d
  JOIN public.order_events e ON e.id = d.event_id
  WHERE d.decision_type = 'issue_refund'
  GROUP BY e.order_id, e.vendor_id
),
pending_credit AS (
  SELECT e.order_id, e.vendor_id,
         SUM(COALESCE((d.payload->>'amount')::numeric, 0))::numeric(14,2) AS expected_credit
  FROM public.order_decisions d
  JOIN public.order_events e ON e.id = d.event_id
  WHERE d.decision_type = 'issue_credit_note'
  GROUP BY e.order_id, e.vendor_id
),
pending_extra AS (
  SELECT e.order_id, e.vendor_id,
         SUM(COALESCE((d.payload->>'amount')::numeric, 0))::numeric(14,2) AS expected_extra
  FROM public.order_decisions d
  JOIN public.order_events e ON e.id = d.event_id
  WHERE d.decision_type = 'replace_higher'
  GROUP BY e.order_id, e.vendor_id
)
SELECT
  l.order_id,
  l.vendor_id,
  l.gross_value,
  COALESCE(c.cancelled_value, 0)        AS cancelled_value,
  COALESCE(a.refunded_value, 0)         AS refunded_value,
  COALESCE(a.credited_value, 0)         AS credited_value,
  COALESCE(a.credit_used_value, 0)      AS credit_used_value,
  COALESCE(a.extra_collected_value, 0)  AS extra_collected_value,
  COALESCE(a.penalty_value, 0)          AS penalty_value,
  COALESCE(a.loss_value, 0)             AS loss_value,
  GREATEST(COALESCE(a.commission_due_value, 0) - COALESCE(a.commission_paid_value, 0), 0)::numeric(14,2) AS commission_to_remit_vendor,
  COALESCE(a.commission_paid_value, 0)  AS commission_paid_value,
  (l.gross_value - COALESCE(c.cancelled_value, 0) + COALESCE(a.penalty_value, 0))::numeric(14,2) AS net_value,
  GREATEST(COALESCE(pr.expected_refund, 0) - COALESCE(a.refunded_value, 0), 0)::numeric(14,2) AS outstanding_to_refund_client,
  GREATEST(COALESCE(pc.expected_credit, 0) - COALESCE(a.credited_value, 0) - COALESCE(a.credit_used_value, 0), 0)::numeric(14,2) AS outstanding_credit_to_issue,
  GREATEST(COALESCE(pe.expected_extra, 0) - COALESCE(a.extra_collected_value, 0), 0)::numeric(14,2) AS outstanding_extra_from_client
FROM lines l
LEFT JOIN agg a            USING (order_id, vendor_id)
LEFT JOIN cancelled c      USING (order_id, vendor_id)
LEFT JOIN pending_refund pr USING (order_id, vendor_id)
LEFT JOIN pending_credit pc USING (order_id, vendor_id)
LEFT JOIN pending_extra pe USING (order_id, vendor_id);

GRANT SELECT ON public.v_sub_order_accounting TO authenticated;
GRANT ALL ON public.v_sub_order_accounting TO service_role;
