DROP POLICY IF EXISTS kawscan_stores_select ON public.kawscan_stores;
CREATE POLICY kawscan_stores_select ON public.kawscan_stores FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR public.kawscan_can_manage(id, auth.uid()));