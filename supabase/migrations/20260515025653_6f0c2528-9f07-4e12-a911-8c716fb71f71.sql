-- 1. Add parent_request_id to support pending-on-pending hierarchy
ALTER TABLE public.category_requests
  ADD COLUMN IF NOT EXISTS parent_request_id UUID REFERENCES public.category_requests(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_cat_req_vendor ON public.category_requests(vendor_id, status);
CREATE INDEX IF NOT EXISTS idx_cat_req_parent_req ON public.category_requests(parent_request_id);

-- 2. Update vendor INSERT policy to allow parent_request_id only when owned by same vendor
DROP POLICY IF EXISTS cat_req_vendor_insert ON public.category_requests;
CREATE POLICY cat_req_vendor_insert ON public.category_requests
FOR INSERT
WITH CHECK (
  auth.uid() = vendor_id
  AND has_role(auth.uid(), 'vendeur'::app_role)
  AND (
    parent_request_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.category_requests p
      WHERE p.id = parent_request_id AND p.vendor_id = auth.uid()
    )
  )
);

-- 3. Notifications table for vendors (admin actions on category requests, etc.)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON public.notifications(user_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_self_read ON public.notifications;
CREATE POLICY notif_self_read ON public.notifications
FOR SELECT USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS notif_self_update ON public.notifications;
CREATE POLICY notif_self_update ON public.notifications
FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notif_admin_insert ON public.notifications;
CREATE POLICY notif_admin_insert ON public.notifications
FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS notif_admin_all ON public.notifications;
CREATE POLICY notif_admin_all ON public.notifications
FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));