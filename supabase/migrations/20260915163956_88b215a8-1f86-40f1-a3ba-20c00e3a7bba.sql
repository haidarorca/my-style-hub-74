-- 1. Revoke public/authenticated EXECUTE on internal SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.get_shop_product_stats(uuid) FROM anon, authenticated;
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'resolve_commission'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', r.sig);
  END LOOP;
END $$;

-- 2. sav-evidence storage: ownership-scoped read/write policies
DROP POLICY IF EXISTS sav_evidence_owner_insert ON storage.objects;
CREATE POLICY sav_evidence_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'sav-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS sav_evidence_owner_select ON storage.objects;
CREATE POLICY sav_evidence_owner_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'sav-evidence'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.is_super_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS sav_evidence_owner_update ON storage.objects;
CREATE POLICY sav_evidence_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'sav-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'sav-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );