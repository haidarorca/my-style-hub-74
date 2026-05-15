
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ships_internationally boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allowed_destination_country_ids uuid[] NOT NULL DEFAULT '{}';
