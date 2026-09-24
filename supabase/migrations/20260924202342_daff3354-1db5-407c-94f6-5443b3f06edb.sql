ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS sensitive_images boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sensitive_gender public.user_sex NULL;