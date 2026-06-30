
DROP VIEW IF EXISTS public.v_case_balances CASCADE;
DROP FUNCTION IF EXISTS public.resolve_sav_rules(uuid, uuid, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.resolve_sav_rules(uuid, uuid, uuid) CASCADE;

DROP TABLE IF EXISTS public.sav_fee_charges CASCADE;
DROP TABLE IF EXISTS public.sav_exchanges CASCADE;
DROP TABLE IF EXISTS public.sav_refunds CASCADE;
DROP TABLE IF EXISTS public.sav_actions CASCADE;
DROP TABLE IF EXISTS public.sav_messages CASCADE;
DROP TABLE IF EXISTS public.sav_attachments CASCADE;
DROP TABLE IF EXISTS public.sav_rules CASCADE;
DROP TABLE IF EXISTS public.sav_cases CASCADE;

DROP TABLE IF EXISTS public.supplier_returns CASCADE;
DROP TABLE IF EXISTS public.destruction_records CASCADE;
DROP TABLE IF EXISTS public.inspection_reports CASCADE;
DROP TABLE IF EXISTS public.return_shipments CASCADE;

DO $$ BEGIN
  CREATE TYPE public.return_case_kind     AS ENUM ('return', 'cancellation');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.return_case_status   AS ENUM ('open', 'decided', 'closed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.return_case_decision AS ENUM ('accepted', 'partial', 'refused');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.return_case_counters (
  year   INT  NOT NULL,
  kind   public.return_case_kind NOT NULL,
  value  BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (year, kind)
);
GRANT SELECT ON public.return_case_counters TO authenticated;
GRANT ALL    ON public.return_case_counters TO service_role;
ALTER TABLE public.return_case_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read counters" ON public.return_case_counters
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.next_return_case_code(_kind public.return_case_kind)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _year INT := EXTRACT(YEAR FROM now())::INT;
  _next BIGINT;
  _prefix TEXT := CASE _kind WHEN 'return' THEN 'RET' ELSE 'ANN' END;
BEGIN
  INSERT INTO public.return_case_counters (year, kind, value)
  VALUES (_year, _kind, 1)
  ON CONFLICT (year, kind) DO UPDATE SET value = return_case_counters.value + 1
  RETURNING value INTO _next;
  RETURN _prefix || '-' || _year || '-' || LPAD(_next::TEXT, 4, '0');
END;
$$;

CREATE TABLE public.return_cases (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  TEXT NOT NULL UNIQUE,
  kind                  public.return_case_kind NOT NULL,
  order_id              UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  status                public.return_case_status NOT NULL DEFAULT 'open',
  decision              public.return_case_decision,
  reason_code           TEXT,
  reason_note           TEXT,
  internal_notes        TEXT,
  refund_suggested_xof  NUMERIC(14,2) NOT NULL DEFAULT 0,
  refund_final_xof      NUMERIC(14,2),
  refund_method         TEXT,
  opened_by             UUID REFERENCES auth.users(id),
  decided_by            UUID REFERENCES auth.users(id),
  closed_by             UUID REFERENCES auth.users(id),
  decided_at            TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX return_cases_order_id_idx ON public.return_cases(order_id);
CREATE INDEX return_cases_status_idx   ON public.return_cases(status);
CREATE INDEX return_cases_kind_idx     ON public.return_cases(kind);
CREATE INDEX return_cases_created_idx  ON public.return_cases(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.return_cases TO authenticated;
GRANT ALL ON public.return_cases TO service_role;
ALTER TABLE public.return_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage return cases" ON public.return_cases
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.return_case_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID NOT NULL REFERENCES public.return_cases(id) ON DELETE CASCADE,
  order_item_id   UUID NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
  quantity        INT NOT NULL CHECK (quantity > 0),
  unit_price_xof  NUMERIC(14,2) NOT NULL DEFAULT 0,
  item_decision   public.return_case_decision,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, order_item_id)
);
CREATE INDEX return_case_items_case_idx ON public.return_case_items(case_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.return_case_items TO authenticated;
GRANT ALL ON public.return_case_items TO service_role;
ALTER TABLE public.return_case_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage return case items" ON public.return_case_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.return_case_fees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID NOT NULL REFERENCES public.return_cases(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  amount_xof  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_xof >= 0),
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX return_case_fees_case_idx ON public.return_case_fees(case_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.return_case_fees TO authenticated;
GRANT ALL ON public.return_case_fees TO service_role;
ALTER TABLE public.return_case_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage return case fees" ON public.return_case_fees
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.touch_return_case()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER return_cases_touch
  BEFORE UPDATE ON public.return_cases
  FOR EACH ROW EXECUTE FUNCTION public.touch_return_case();

CREATE OR REPLACE FUNCTION public.recalc_return_case_suggested(_case_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _items NUMERIC := 0; _fees NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(quantity * unit_price_xof), 0) INTO _items
    FROM public.return_case_items WHERE case_id = _case_id;
  SELECT COALESCE(SUM(amount_xof), 0) INTO _fees
    FROM public.return_case_fees  WHERE case_id = _case_id;
  UPDATE public.return_cases
     SET refund_suggested_xof = GREATEST(_items - _fees, 0),
         updated_at = now()
   WHERE id = _case_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.return_case_child_changed()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM public.recalc_return_case_suggested(COALESCE(NEW.case_id, OLD.case_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER return_case_items_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.return_case_items
  FOR EACH ROW EXECUTE FUNCTION public.return_case_child_changed();

CREATE TRIGGER return_case_fees_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.return_case_fees
  FOR EACH ROW EXECUTE FUNCTION public.return_case_child_changed();
