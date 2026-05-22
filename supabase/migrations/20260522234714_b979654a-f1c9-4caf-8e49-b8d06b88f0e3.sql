
CREATE POLICY "site_assets_shop_owner_upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'site-assets'
  AND (storage.foldername(name))[1] = 'shops'
  AND (storage.foldername(name))[2] = (auth.uid())::text
);

CREATE POLICY "site_assets_shop_owner_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'site-assets'
  AND (storage.foldername(name))[1] = 'shops'
  AND (storage.foldername(name))[2] = (auth.uid())::text
);

CREATE POLICY "site_assets_shop_owner_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'site-assets'
  AND (storage.foldername(name))[1] = 'shops'
  AND (storage.foldername(name))[2] = (auth.uid())::text
);
