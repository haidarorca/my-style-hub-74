
-- Storage policies for sav-evidence bucket
-- Convention: storage_path = '{case_id}/{filename}'
DROP POLICY IF EXISTS "sav_evidence_insert" ON storage.objects;
CREATE POLICY "sav_evidence_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'sav-evidence'
    AND owner = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.sav_cases c
      WHERE c.id::text = split_part(name, '/', 1)
        AND (
          c.vendor_id = auth.uid()
          OR c.on_behalf_of_user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = c.order_id AND o.buyer_id = auth.uid())
          OR public.has_role(auth.uid(), 'admin'::app_role)
        )
    )
  );

DROP POLICY IF EXISTS "sav_evidence_select" ON storage.objects;
CREATE POLICY "sav_evidence_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'sav-evidence'
    AND EXISTS (
      SELECT 1 FROM public.sav_cases c
      WHERE c.id::text = split_part(name, '/', 1)
        AND (
          c.vendor_id = auth.uid()
          OR c.on_behalf_of_user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = c.order_id AND o.buyer_id = auth.uid())
          OR public.has_role(auth.uid(), 'admin'::app_role)
        )
    )
  );

DROP POLICY IF EXISTS "sav_evidence_admin_delete" ON storage.objects;
CREATE POLICY "sav_evidence_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'sav-evidence'
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  );
