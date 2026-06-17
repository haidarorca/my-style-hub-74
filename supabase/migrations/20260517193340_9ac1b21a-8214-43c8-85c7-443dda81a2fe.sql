DROP POLICY IF EXISTS products_admin_all ON public.products;
CREATE POLICY products_admin_all ON public.products
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS products_vendor_delete ON public.products;
CREATE POLICY products_vendor_delete ON public.products
  FOR DELETE
  USING (vendor_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS pi_vendor_write ON public.product_images;
CREATE POLICY pi_vendor_write ON public.product_images
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_images.product_id AND (p.vendor_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_images.product_id AND (p.vendor_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))));

DROP POLICY IF EXISTS pv_vendor_write ON public.product_variants;
CREATE POLICY pv_vendor_write ON public.product_variants
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id AND (p.vendor_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id AND (p.vendor_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))));