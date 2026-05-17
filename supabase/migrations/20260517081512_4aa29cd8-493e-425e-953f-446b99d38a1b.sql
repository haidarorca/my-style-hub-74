
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin_shop boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS managed_by_admin_id uuid;

CREATE INDEX IF NOT EXISTS profiles_is_admin_shop_idx ON public.profiles (is_admin_shop) WHERE is_admin_shop = true;
