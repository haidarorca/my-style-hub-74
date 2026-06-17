DROP POLICY IF EXISTS cust_up_auth_write ON storage.objects;
CREATE POLICY cust_up_write_auth_or_guest ON storage.objects
FOR INSERT TO public
WITH CHECK (
  bucket_id = 'customization-uploads'
  AND (
    auth.uid() IS NOT NULL
    OR (storage.foldername(name))[1] = 'guest'
  )
);