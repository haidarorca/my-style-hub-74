
-- Audit log for return cases
CREATE TABLE public.return_case_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.return_cases(id) ON DELETE CASCADE,
  action text NOT NULL,
  payload jsonb,
  actor_id uuid,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX return_case_actions_case_idx ON public.return_case_actions(case_id, created_at DESC);

GRANT SELECT, INSERT ON public.return_case_actions TO authenticated;
GRANT ALL ON public.return_case_actions TO service_role;

ALTER TABLE public.return_case_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage return_case_actions"
  ON public.return_case_actions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

-- Helper: insert action with current user
CREATE OR REPLACE FUNCTION public.log_return_case_action(_case_id uuid, _action text, _payload jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _email text;
BEGIN
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.return_case_actions(case_id, action, payload, actor_id, actor_email)
  VALUES (_case_id, _action, _payload, auth.uid(), _email);
END $$;

-- Triggers on return_cases
CREATE OR REPLACE FUNCTION public.tg_return_cases_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_return_case_action(NEW.id, 'case_opened',
      jsonb_build_object('kind', NEW.kind, 'reason_code', NEW.reason_code, 'reason_note', NEW.reason_note));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.log_return_case_action(NEW.id, 'status_changed',
        jsonb_build_object('from', OLD.status, 'to', NEW.status));
    END IF;
    IF NEW.decision IS DISTINCT FROM OLD.decision OR NEW.refund_final_xof IS DISTINCT FROM OLD.refund_final_xof OR NEW.refund_method IS DISTINCT FROM OLD.refund_method THEN
      PERFORM public.log_return_case_action(NEW.id, 'decision_recorded',
        jsonb_build_object('decision', NEW.decision, 'refund_final_xof', NEW.refund_final_xof, 'refund_method', NEW.refund_method));
    END IF;
    IF NEW.internal_notes IS DISTINCT FROM OLD.internal_notes THEN
      PERFORM public.log_return_case_action(NEW.id, 'notes_updated', NULL);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_return_cases_log ON public.return_cases;
CREATE TRIGGER trg_return_cases_log
  AFTER INSERT OR UPDATE ON public.return_cases
  FOR EACH ROW EXECUTE FUNCTION public.tg_return_cases_log();

-- Triggers on return_case_items
CREATE OR REPLACE FUNCTION public.tg_return_case_items_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_return_case_action(NEW.case_id, 'item_added',
      jsonb_build_object('order_item_id', NEW.order_item_id, 'quantity', NEW.quantity, 'unit_price_xof', NEW.unit_price_xof));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_return_case_action(OLD.case_id, 'item_removed',
      jsonb_build_object('order_item_id', OLD.order_item_id, 'quantity', OLD.quantity));
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_return_case_items_log ON public.return_case_items;
CREATE TRIGGER trg_return_case_items_log
  AFTER INSERT OR DELETE ON public.return_case_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_return_case_items_log();

-- Triggers on return_case_fees
CREATE OR REPLACE FUNCTION public.tg_return_case_fees_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_return_case_action(NEW.case_id, 'fee_added',
      jsonb_build_object('label', NEW.label, 'amount_xof', NEW.amount_xof));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_return_case_action(OLD.case_id, 'fee_removed',
      jsonb_build_object('label', OLD.label, 'amount_xof', OLD.amount_xof));
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_return_case_fees_log ON public.return_case_fees;
CREATE TRIGGER trg_return_case_fees_log
  AFTER INSERT OR DELETE ON public.return_case_fees
  FOR EACH ROW EXECUTE FUNCTION public.tg_return_case_fees_log();
