DROP POLICY IF EXISTS categories_admin_write ON public.categories;
CREATE POLICY categories_admin_write
ON public.categories
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS cat_req_admin_all ON public.category_requests;
CREATE POLICY cat_req_admin_all
ON public.category_requests
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS pc_vendor_write ON public.product_customizations;
CREATE POLICY pc_vendor_write
ON public.product_customizations
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = product_customizations.product_id
      AND (
        p.vendor_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::app_role)
        OR public.is_super_admin(auth.uid())
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = product_customizations.product_id
      AND (
        p.vendor_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::app_role)
        OR public.is_super_admin(auth.uid())
      )
  )
);

DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
CREATE POLICY profiles_admin_all
ON public.profiles
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS admin_stats_cache_read ON public.admin_stats_cache;
CREATE POLICY admin_stats_cache_read
ON public.admin_stats_cache
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS admin_stats_cache_write ON public.admin_stats_cache;
CREATE POLICY admin_stats_cache_write
ON public.admin_stats_cache
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS ui_overrides_admin_write ON public.ui_overrides;
CREATE POLICY ui_overrides_admin_write
ON public.ui_overrides
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS prod_img_auth_write ON storage.objects;
CREATE POLICY prod_img_auth_write
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_super_admin(auth.uid())
    OR (
      (auth.uid())::text = (storage.foldername(name))[1]
      AND public.has_role(auth.uid(), 'vendeur'::app_role)
    )
  )
);

DROP POLICY IF EXISTS prod_img_owner_delete ON storage.objects;
CREATE POLICY prod_img_owner_delete
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'product-images'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_super_admin(auth.uid())
  )
);

DROP POLICY IF EXISTS prod_img_owner_modify ON storage.objects;
CREATE POLICY prod_img_owner_modify
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'product-images'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_super_admin(auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'product-images'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_super_admin(auth.uid())
  )
);