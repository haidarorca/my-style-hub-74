
-- Phase 4 SAV : permissions granulaires + colonne on_behalf
ALTER TYPE public.admin_permission ADD VALUE IF NOT EXISTS 'sav_view_all';
ALTER TYPE public.admin_permission ADD VALUE IF NOT EXISTS 'sav_assign';
ALTER TYPE public.admin_permission ADD VALUE IF NOT EXISTS 'sav_decide';
ALTER TYPE public.admin_permission ADD VALUE IF NOT EXISTS 'sav_override';
ALTER TYPE public.admin_permission ADD VALUE IF NOT EXISTS 'sav_rules_manage';
ALTER TYPE public.admin_permission ADD VALUE IF NOT EXISTS 'sav_refund_issue';
ALTER TYPE public.admin_permission ADD VALUE IF NOT EXISTS 'sav_exception_create';

-- Colonne pour les dossiers créés par l'admin pour le compte d'un client (Sénégal)
ALTER TABLE public.sav_cases
  ADD COLUMN IF NOT EXISTS on_behalf_of_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sav_cases_on_behalf ON public.sav_cases(on_behalf_of_user_id) WHERE on_behalf_of_user_id IS NOT NULL;

-- RLS additionnelles pour permettre au client (acheteur ou on_behalf_of) de voir ses propres dossiers
-- et au vendeur de voir les dossiers liés à ses produits/boutique
DROP POLICY IF EXISTS "client_view_own_cases" ON public.sav_cases;
CREATE POLICY "client_view_own_cases" ON public.sav_cases
  FOR SELECT TO authenticated
  USING (
    client_visible = true
    AND (
      on_behalf_of_user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = sav_cases.order_id AND o.buyer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "client_insert_own_case" ON public.sav_cases;
CREATE POLICY "client_insert_own_case" ON public.sav_cases
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = sav_cases.order_id AND o.buyer_id = auth.uid())
  );

DROP POLICY IF EXISTS "vendor_view_shop_cases" ON public.sav_cases;
CREATE POLICY "vendor_view_shop_cases" ON public.sav_cases
  FOR SELECT TO authenticated
  USING (vendor_id = auth.uid());

DROP POLICY IF EXISTS "vendor_update_recommendation" ON public.sav_cases;
CREATE POLICY "vendor_update_recommendation" ON public.sav_cases
  FOR UPDATE TO authenticated
  USING (vendor_id = auth.uid())
  WITH CHECK (vendor_id = auth.uid());

-- sav_messages : RLS supplémentaires pour client/vendeur
DROP POLICY IF EXISTS "msg_client_view" ON public.sav_messages;
CREATE POLICY "msg_client_view" ON public.sav_messages
  FOR SELECT TO authenticated
  USING (
    is_internal_note = false
    AND EXISTS (
      SELECT 1 FROM public.sav_cases c
      WHERE c.id = sav_messages.case_id
        AND c.client_visible = true
        AND (c.on_behalf_of_user_id = auth.uid()
             OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = c.order_id AND o.buyer_id = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "msg_vendor_view" ON public.sav_messages;
CREATE POLICY "msg_vendor_view" ON public.sav_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.sav_cases c WHERE c.id = sav_messages.case_id AND c.vendor_id = auth.uid())
  );

DROP POLICY IF EXISTS "msg_insert_party" ON public.sav_messages;
CREATE POLICY "msg_insert_party" ON public.sav_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.sav_cases c
      WHERE c.id = sav_messages.case_id
        AND (
          c.vendor_id = auth.uid()
          OR c.on_behalf_of_user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = c.order_id AND o.buyer_id = auth.uid())
          OR public.has_role(auth.uid(), 'admin'::app_role)
        )
    )
  );

-- sav_attachments : RLS client/vendeur
DROP POLICY IF EXISTS "att_client_view" ON public.sav_attachments;
CREATE POLICY "att_client_view" ON public.sav_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sav_cases c
      WHERE c.id = sav_attachments.case_id
        AND c.client_visible = true
        AND (c.on_behalf_of_user_id = auth.uid()
             OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = c.order_id AND o.buyer_id = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "att_vendor_view" ON public.sav_attachments;
CREATE POLICY "att_vendor_view" ON public.sav_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.sav_cases c WHERE c.id = sav_attachments.case_id AND c.vendor_id = auth.uid())
  );

DROP POLICY IF EXISTS "att_insert_party" ON public.sav_attachments;
CREATE POLICY "att_insert_party" ON public.sav_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploader_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.sav_cases c
      WHERE c.id = sav_attachments.case_id
        AND (
          c.vendor_id = auth.uid()
          OR c.on_behalf_of_user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = c.order_id AND o.buyer_id = auth.uid())
          OR public.has_role(auth.uid(), 'admin'::app_role)
        )
    )
  );

-- sav_actions : visibilité (le trigger append-only continue d'exister)
DROP POLICY IF EXISTS "act_client_view" ON public.sav_actions;
CREATE POLICY "act_client_view" ON public.sav_actions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sav_cases c
      WHERE c.id = sav_actions.case_id
        AND c.client_visible = true
        AND (c.on_behalf_of_user_id = auth.uid()
             OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = c.order_id AND o.buyer_id = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "act_vendor_view" ON public.sav_actions;
CREATE POLICY "act_vendor_view" ON public.sav_actions
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.sav_cases c WHERE c.id = sav_actions.case_id AND c.vendor_id = auth.uid())
  );
