DROP POLICY IF EXISTS contact_settings_public_read ON public.contact_settings;

CREATE POLICY contact_settings_admin_read ON public.contact_settings
FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

REVOKE SELECT ON public.contact_settings FROM anon;