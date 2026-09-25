ALTER TABLE public.cj_import_job_items ADD COLUMN IF NOT EXISTS target_key text;
CREATE INDEX IF NOT EXISTS cj_import_job_items_target_idx ON public.cj_import_job_items(job_id, target_key);