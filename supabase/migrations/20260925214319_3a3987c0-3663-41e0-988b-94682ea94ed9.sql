GRANT SELECT ON public.translation_jobs TO authenticated;
CREATE POLICY "Admins can view translation jobs" ON public.translation_jobs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));