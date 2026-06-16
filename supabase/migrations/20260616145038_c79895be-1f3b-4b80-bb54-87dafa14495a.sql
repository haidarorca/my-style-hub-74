
-- ════════════════════════════════════════════════════════════════
-- PHASE B — Noyau événementiel ERP du Cockpit
-- ════════════════════════════════════════════════════════════════

-- 1. ENUMS catalogues fermés

CREATE TYPE public.order_event_type AS ENUM (
  'client_cancellation',
  'stock_break',
  'product_deleted',
  'shop_deleted',
  'customer_dispute',
  'delivery_refusal',
  'post_delivery_return',
  'vendor_error',
  'kawzone_error',
  'supplier_unavailable',
  'commercial_gesture',
  'payment_blocked',
  'delivery_blocked',
  'order_abandoned'
);

CREATE TYPE public.order_decision_type AS ENUM (
  'cancel_article',
  'cancel_suborder',
  'wait_restock',
  'wait_supplier',
  'wait_client',
  'replace_same',
  'replace_higher',
  'replace_lower',
  'partial_delivery',
  'accept_return',
  'refuse_return',
  'accept_exchange',
  'issue_refund',
  'issue_credit_note',
  'apply_penalty',
  'commercial_gesture',
  'override_no_action'
);

CREATE TYPE public.financial_movement_type AS ENUM (
  'cash_in',
  'cash_out',
  'credit_note_issued',
  'credit_note_used',
  'penalty_kept',
  'penalty_to_vendor',
  'commission_due_to_vendor',
  'loss_kawzone',
  'loss_vendor',
  'loss_shared',
  'gain_kawzone',
  'gain_vendor'
);

CREATE TYPE public.movement_direction AS ENUM ('debit', 'credit');

CREATE TYPE public.cost_attribution AS ENUM ('kawzone', 'vendor', 'client', 'shared');

-- 2. order_events — la cause (append-only)
CREATE TABLE public.order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  order_item_id uuid NULL REFERENCES public.order_items(id) ON DELETE SET NULL,
  event_type public.order_event_type NOT NULL,
  reason text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX order_events_order_idx ON public.order_events(order_id);
CREATE INDEX order_events_vendor_idx ON public.order_events(vendor_id);
CREATE INDEX order_events_type_idx ON public.order_events(event_type);
CREATE INDEX order_events_created_idx ON public.order_events(created_at DESC);

GRANT SELECT, INSERT ON public.order_events TO authenticated;
GRANT ALL ON public.order_events TO service_role;
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read all events" ON public.order_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));
CREATE POLICY "vendors read own events" ON public.order_events FOR SELECT TO authenticated
  USING (vendor_id = auth.uid());
CREATE POLICY "admins insert events" ON public.order_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

-- 3. order_decisions — la réponse (append-only)
CREATE TABLE public.order_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.order_events(id) ON DELETE RESTRICT,
  decision_type public.order_decision_type NOT NULL,
  rationale text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  supersedes_decision_id uuid NULL REFERENCES public.order_decisions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX order_decisions_event_idx ON public.order_decisions(event_id);
CREATE INDEX order_decisions_type_idx ON public.order_decisions(decision_type);

GRANT SELECT, INSERT ON public.order_decisions TO authenticated;
GRANT ALL ON public.order_decisions TO service_role;
ALTER TABLE public.order_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read all decisions" ON public.order_decisions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));
CREATE POLICY "vendors read own decisions" ON public.order_decisions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.order_events e WHERE e.id = event_id AND e.vendor_id = auth.uid()));
CREATE POLICY "admins insert decisions" ON public.order_decisions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

-- 4. financial_movements — la conséquence (append-only)
CREATE TABLE public.financial_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL REFERENCES public.order_decisions(id) ON DELETE RESTRICT,
  movement_type public.financial_movement_type NOT NULL,
  direction public.movement_direction NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'XOF',
  cost_attribution public.cost_attribution NOT NULL DEFAULT 'kawzone',
  cost_split jsonb NULL,
  method text NULL,
  reference text NULL,
  note text NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX financial_movements_decision_idx ON public.financial_movements(decision_id);
CREATE INDEX financial_movements_type_idx ON public.financial_movements(movement_type);
CREATE INDEX financial_movements_occurred_idx ON public.financial_movements(occurred_at DESC);

GRANT SELECT, INSERT ON public.financial_movements TO authenticated;
GRANT ALL ON public.financial_movements TO service_role;
ALTER TABLE public.financial_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read all movements" ON public.financial_movements FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));
CREATE POLICY "vendors read own movements" ON public.financial_movements FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.order_decisions d
    JOIN public.order_events e ON e.id = d.event_id
    WHERE d.id = decision_id AND e.vendor_id = auth.uid()
  ));
CREATE POLICY "admins insert movements" ON public.financial_movements FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

-- 5. Trigger append-only : interdit UPDATE/DELETE pour non service_role
CREATE OR REPLACE FUNCTION public.tg_append_only_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text := current_setting('role', true);
BEGIN
  IF v_role IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'Append-only table: % operations are forbidden on %', TG_OP, TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER guard_order_events_no_update BEFORE UPDATE ON public.order_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_append_only_guard();
CREATE TRIGGER guard_order_events_no_delete BEFORE DELETE ON public.order_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_append_only_guard();
CREATE TRIGGER guard_order_decisions_no_update BEFORE UPDATE ON public.order_decisions
  FOR EACH ROW EXECUTE FUNCTION public.tg_append_only_guard();
CREATE TRIGGER guard_order_decisions_no_delete BEFORE DELETE ON public.order_decisions
  FOR EACH ROW EXECUTE FUNCTION public.tg_append_only_guard();
CREATE TRIGGER guard_financial_movements_no_update BEFORE UPDATE ON public.financial_movements
  FOR EACH ROW EXECUTE FUNCTION public.tg_append_only_guard();
CREATE TRIGGER guard_financial_movements_no_delete BEFORE DELETE ON public.financial_movements
  FOR EACH ROW EXECUTE FUNCTION public.tg_append_only_guard();

-- 6. Trigger auto-event sur soft-delete produit
CREATE OR REPLACE FUNCTION public.tg_emit_product_deleted_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO public.order_events (order_id, vendor_id, order_item_id, event_type, reason, payload, created_by)
    SELECT oi.order_id, oi.vendor_id, oi.id, 'product_deleted'::public.order_event_type,
           'Auto: produit retiré du catalogue',
           jsonb_build_object('product_id', NEW.id, 'product_name', NEW.name),
           NEW.deleted_by
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.product_id = NEW.id
      AND COALESCE(o.status, '') NOT IN ('delivered','cancelled');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER emit_product_deleted_events AFTER UPDATE OF deleted_at ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.tg_emit_product_deleted_events();

-- 7. Trigger auto-event sur soft-delete boutique (profile vendeur)
CREATE OR REPLACE FUNCTION public.tg_emit_shop_deleted_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO public.order_events (order_id, vendor_id, order_item_id, event_type, reason, payload, created_by)
    SELECT DISTINCT oi.order_id, NEW.id, NULL, 'shop_deleted'::public.order_event_type,
           'Auto: boutique retirée',
           jsonb_build_object('shop_id', NEW.id, 'shop_name', NEW.shop_name),
           NEW.deleted_by
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.vendor_id = NEW.id
      AND COALESCE(o.status, '') NOT IN ('delivered','cancelled');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER emit_shop_deleted_events AFTER UPDATE OF deleted_at ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_emit_shop_deleted_events();

-- 8. Vue comptable agrégée par sous-commande (order_id, vendor_id)
CREATE OR REPLACE VIEW public.v_sub_order_accounting AS
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
  JOIN public.order_events e ON e.id = d.event_id
),
agg AS (
  SELECT order_id, vendor_id,
    SUM(amount) FILTER (WHERE movement_type = 'cash_out') AS refunded_value,
    SUM(amount) FILTER (WHERE movement_type = 'cash_in') AS extra_collected_value,
    SUM(amount) FILTER (WHERE movement_type = 'credit_note_issued') AS credited_value,
    SUM(amount) FILTER (WHERE movement_type IN ('penalty_kept','penalty_to_vendor')) AS penalty_value,
    SUM(amount) FILTER (WHERE movement_type IN ('loss_kawzone','loss_vendor','loss_shared')) AS loss_value,
    SUM(amount) FILTER (WHERE movement_type = 'commission_due_to_vendor') AS commission_to_remit_vendor
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
)
SELECT
  l.order_id,
  l.vendor_id,
  l.gross_value,
  COALESCE(c.cancelled_value, 0) AS cancelled_value,
  COALESCE(a.refunded_value, 0) AS refunded_value,
  COALESCE(a.credited_value, 0) AS credited_value,
  COALESCE(a.extra_collected_value, 0) AS extra_collected_value,
  COALESCE(a.penalty_value, 0) AS penalty_value,
  COALESCE(a.loss_value, 0) AS loss_value,
  COALESCE(a.commission_to_remit_vendor, 0) AS commission_to_remit_vendor,
  (l.gross_value - COALESCE(c.cancelled_value, 0) + COALESCE(a.penalty_value, 0))::numeric(14,2) AS net_value,
  GREATEST(COALESCE(pr.expected_refund, 0) - COALESCE(a.refunded_value, 0), 0)::numeric(14,2) AS outstanding_to_refund_client,
  GREATEST(COALESCE(pc.expected_credit, 0) - COALESCE(a.credited_value, 0), 0)::numeric(14,2) AS outstanding_credit_to_issue
FROM lines l
LEFT JOIN agg a USING (order_id, vendor_id)
LEFT JOIN cancelled c USING (order_id, vendor_id)
LEFT JOIN pending_refund pr USING (order_id, vendor_id)
LEFT JOIN pending_credit pc USING (order_id, vendor_id);

GRANT SELECT ON public.v_sub_order_accounting TO authenticated;
GRANT ALL ON public.v_sub_order_accounting TO service_role;
