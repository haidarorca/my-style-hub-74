-- Allow super administrators to manage site settings, banners, and uploaded site assets.
-- Existing admin access is preserved.

DROP POLICY IF EXISTS site_settings_admin_write ON public.site_settings;
CREATE POLICY site_settings_admin_write
ON public.site_settings
FOR ALL
TO public
USING (
  public.is_super_admin(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS home_banners_admin_write ON public.home_banners;
CREATE POLICY home_banners_admin_write
ON public.home_banners
FOR ALL
TO public
USING (
  public.is_super_admin(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

INSERT INTO storage.buckets (id, name, public)
VALUES ('site-assets', 'site-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "site_assets_admin_write" ON storage.objects;
DROP POLICY IF EXISTS "site_assets_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "site_assets_admin_delete" ON storage.objects;

CREATE POLICY "site_assets_admin_write"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'site-assets'
  AND (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

CREATE POLICY "site_assets_admin_update"
ON storage.objects
FOR UPDATE
TO public
USING (
  bucket_id = 'site-assets'
  AND (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'site-assets'
  AND (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

CREATE POLICY "site_assets_admin_delete"
ON storage.objects
FOR DELETE
TO public
USING (
  bucket_id = 'site-assets'
  AND (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);