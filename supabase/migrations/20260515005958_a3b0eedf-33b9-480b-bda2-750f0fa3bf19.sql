CREATE TABLE public.ui_overrides (
  key TEXT PRIMARY KEY,
  label TEXT,
  size TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.ui_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ui_overrides_public_read" ON public.ui_overrides
  FOR SELECT USING (true);

CREATE POLICY "ui_overrides_admin_write" ON public.ui_overrides
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER tg_ui_overrides_updated_at
  BEFORE UPDATE ON public.ui_overrides
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();