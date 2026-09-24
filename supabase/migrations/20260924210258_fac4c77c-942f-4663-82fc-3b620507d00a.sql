GRANT SELECT ON public.sensitive_image_rules TO authenticated;
CREATE POLICY "Admins read sensitive rules" ON public.sensitive_image_rules FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));