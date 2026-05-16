
-- 1) Photos sur avis
ALTER TABLE public.product_reviews
  ADD COLUMN IF NOT EXISTS photos text[] NOT NULL DEFAULT '{}'::text[];

-- 2) Étendre product_reports pour signaler aussi un vendeur
ALTER TABLE public.product_reports
  ADD COLUMN IF NOT EXISTS report_type text NOT NULL DEFAULT 'product',
  ADD COLUMN IF NOT EXISTS vendor_id uuid,
  ADD COLUMN IF NOT EXISTS reason_category text,
  ADD COLUMN IF NOT EXISTS order_id uuid;

ALTER TABLE public.product_reports
  DROP CONSTRAINT IF EXISTS product_reports_type_chk;
ALTER TABLE public.product_reports
  ADD CONSTRAINT product_reports_type_chk
  CHECK (report_type IN ('product','vendor'));

-- product_id doit être nullable car un signalement vendeur n'a pas forcément un produit
ALTER TABLE public.product_reports
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE public.product_reports
  DROP CONSTRAINT IF EXISTS product_reports_target_chk;
ALTER TABLE public.product_reports
  ADD CONSTRAINT product_reports_target_chk
  CHECK (
    (report_type = 'product' AND product_id IS NOT NULL)
    OR (report_type = 'vendor' AND vendor_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS product_reports_vendor_idx ON public.product_reports(vendor_id);
CREATE INDEX IF NOT EXISTS product_reports_status_idx ON public.product_reports(status);

-- 3) Bucket photos d'avis
INSERT INTO storage.buckets (id, name, public)
VALUES ('review-photos', 'review-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "review_photos_public_read" ON storage.objects;
CREATE POLICY "review_photos_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'review-photos');

DROP POLICY IF EXISTS "review_photos_owner_write" ON storage.objects;
CREATE POLICY "review_photos_owner_write"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'review-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "review_photos_owner_delete" ON storage.objects;
CREATE POLICY "review_photos_owner_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'review-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 4) Notifications admin lors d'un nouveau signalement
CREATE OR REPLACE FUNCTION public.notify_admins_on_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_user record;
  v_title text;
  v_msg text;
  v_link text;
BEGIN
  IF NEW.report_type = 'vendor' THEN
    v_title := '🚩 Signalement vendeur';
    v_msg := COALESCE(NEW.reason_category, 'Signalement') || ' — ' || COALESCE(LEFT(NEW.reason, 140), '');
    v_link := '/admin/reports';
  ELSE
    v_title := '🚩 Signalement produit';
    v_msg := COALESCE(NEW.reason_category, 'Signalement') || ' — ' || COALESCE(LEFT(NEW.reason, 140), '');
    v_link := '/admin/reports';
  END IF;

  FOR admin_user IN
    SELECT DISTINCT user_id FROM public.user_roles
    WHERE role IN ('admin'::app_role, 'super_admin'::app_role)
      AND is_suspended = false
  LOOP
    INSERT INTO public.notifications (user_id, title, message, link)
    VALUES (admin_user.user_id, v_title, v_msg, v_link);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_on_report ON public.product_reports;
CREATE TRIGGER trg_notify_admins_on_report
AFTER INSERT ON public.product_reports
FOR EACH ROW
EXECUTE FUNCTION public.notify_admins_on_report();

-- 5) RLS — autoriser signalement vendeur (la policy existante reports_own_insert couvre déjà reporter_id = auth.uid())
