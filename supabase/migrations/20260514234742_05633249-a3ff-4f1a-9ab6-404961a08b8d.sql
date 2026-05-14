ALTER TABLE public.customer_addresses
  ADD COLUMN IF NOT EXISTS phone_secondary text,
  ADD COLUMN IF NOT EXISTS phone_alt text;