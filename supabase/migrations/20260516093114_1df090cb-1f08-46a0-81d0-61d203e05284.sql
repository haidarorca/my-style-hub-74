ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS auth_sender_email text DEFAULT 'haidarorca@gmail.com',
  ADD COLUMN IF NOT EXISTS auth_sender_name text DEFAULT 'KawZone';

UPDATE public.site_settings
SET auth_sender_email = COALESCE(auth_sender_email, 'haidarorca@gmail.com'),
    auth_sender_name = COALESCE(auth_sender_name, 'KawZone')
WHERE id = 'main';