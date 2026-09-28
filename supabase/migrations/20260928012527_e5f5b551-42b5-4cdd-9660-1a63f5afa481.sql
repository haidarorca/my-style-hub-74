CREATE TABLE public.category_reclass_log (
  product_id uuid PRIMARY KEY,
  old_category_id uuid,
  new_category_id uuid NOT NULL,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.category_reclass_log TO service_role;
ALTER TABLE public.category_reclass_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read reclass log" ON public.category_reclass_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.category_reclass_log TO authenticated;