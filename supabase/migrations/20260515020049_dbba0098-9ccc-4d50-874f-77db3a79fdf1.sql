
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS shop_hours_schedule jsonb;
