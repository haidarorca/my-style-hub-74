
-- 1) Order status history
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_osh_order ON public.order_status_history(order_id, created_at DESC);

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS osh_admin_all ON public.order_status_history;
CREATE POLICY osh_admin_all ON public.order_status_history
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS osh_read ON public.order_status_history;
CREATE POLICY osh_read ON public.order_status_history
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_status_history.order_id AND o.buyer_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = order_status_history.order_id AND oi.vendor_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_status_history(order_id, from_status, to_status, changed_by)
    VALUES (NEW.id, NULL, NEW.status, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_history(order_id, from_status, to_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_log_order_status ON public.orders;
CREATE TRIGGER trg_log_order_status
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_status_change();

-- 2) Vendor responses to reviews
ALTER TABLE public.product_reviews
  ADD COLUMN IF NOT EXISTS vendor_response text,
  ADD COLUMN IF NOT EXISTS vendor_response_at timestamptz;

DROP POLICY IF EXISTS reviews_vendor_reply ON public.product_reviews;
CREATE POLICY reviews_vendor_reply ON public.product_reviews
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_reviews.product_id AND p.vendor_id = auth.uid())
  );

-- 3) Notify vendor on new review
CREATE OR REPLACE FUNCTION public.notify_vendor_on_review()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_vendor uuid;
  v_name text;
BEGIN
  SELECT p.vendor_id, p.name INTO v_vendor, v_name FROM public.products p WHERE p.id = NEW.product_id;
  IF v_vendor IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, title, message, link)
    VALUES (v_vendor, '⭐ Nouvel avis', NEW.rating || '/5 sur ' || COALESCE(v_name, 'votre produit'), '/vendor/reviews');
  END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_notify_vendor_review ON public.product_reviews;
CREATE TRIGGER trg_notify_vendor_review
AFTER INSERT ON public.product_reviews
FOR EACH ROW EXECUTE FUNCTION public.notify_vendor_on_review();

-- 4) Notify vendor on new report concerning their product/vendor account
CREATE OR REPLACE FUNCTION public.notify_vendor_on_report()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_vendor uuid;
BEGIN
  IF NEW.report_type = 'vendor' THEN
    v_vendor := NEW.vendor_id;
  ELSE
    SELECT p.vendor_id INTO v_vendor FROM public.products p WHERE p.id = NEW.product_id;
  END IF;
  IF v_vendor IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, title, message, link)
    VALUES (v_vendor, '🚩 Nouveau signalement',
            COALESCE(NEW.reason_category, 'Signalement') || ' — ' || COALESCE(LEFT(NEW.reason, 140), ''),
            '/vendor/reports');
  END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_notify_vendor_report ON public.product_reports;
CREATE TRIGGER trg_notify_vendor_report
AFTER INSERT ON public.product_reports
FOR EACH ROW EXECUTE FUNCTION public.notify_vendor_on_report();
