CREATE TABLE IF NOT EXISTS public.category_classification_feedback (
  id uuid primary key default gen_random_uuid(),
  signals text not null,
  suggested_category_id uuid references public.categories(id) on delete set null,
  chosen_category_id uuid not null references public.categories(id) on delete cascade,
  was_correction boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_ccf_chosen ON public.category_classification_feedback(chosen_category_id);
GRANT SELECT, INSERT ON public.category_classification_feedback TO authenticated;
GRANT ALL ON public.category_classification_feedback TO service_role;
ALTER TABLE public.category_classification_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth can read classification feedback" ON public.category_classification_feedback;
CREATE POLICY "auth can read classification feedback" ON public.category_classification_feedback FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth can insert own classification feedback" ON public.category_classification_feedback;
CREATE POLICY "auth can insert own classification feedback" ON public.category_classification_feedback FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());