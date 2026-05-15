
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS shop_logo_url text,
  ADD COLUMN IF NOT EXISTS shop_banner_url text,
  ADD COLUMN IF NOT EXISTS shop_description text,
  ADD COLUMN IF NOT EXISTS shop_hours text,
  ADD COLUMN IF NOT EXISTS shop_whatsapp text,
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

-- Public read of vendor shop fields so the public shop page can display them.
DROP POLICY IF EXISTS profiles_public_shop_read ON public.profiles;
CREATE POLICY profiles_public_shop_read ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = profiles.id AND ur.role = 'vendeur'
    )
  );

-- Storage policies on existing public bucket site-assets so vendors can upload their logo/banner under vendors/{user_id}/...
DROP POLICY IF EXISTS site_assets_vendor_upload ON storage.objects;
CREATE POLICY site_assets_vendor_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'site-assets'
    AND (storage.foldername(name))[1] = 'vendors'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS site_assets_vendor_update ON storage.objects;
CREATE POLICY site_assets_vendor_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'site-assets'
    AND (storage.foldername(name))[1] = 'vendors'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS site_assets_vendor_delete ON storage.objects;
CREATE POLICY site_assets_vendor_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'site-assets'
    AND (storage.foldername(name))[1] = 'vendors'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
