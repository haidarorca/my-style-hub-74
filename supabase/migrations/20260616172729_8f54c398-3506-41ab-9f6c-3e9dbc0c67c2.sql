
-- Bridge Cockpit → SAV : décision typée + traçabilité bidirectionnelle
ALTER TYPE public.order_decision_type ADD VALUE IF NOT EXISTS 'escalate_sav';

ALTER TABLE public.sav_cases
  ADD COLUMN IF NOT EXISTS source_event_id uuid REFERENCES public.order_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_decision_id uuid REFERENCES public.order_decisions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sav_cases_source_event ON public.sav_cases(source_event_id);
CREATE INDEX IF NOT EXISTS idx_sav_cases_source_decision ON public.sav_cases(source_decision_id);
