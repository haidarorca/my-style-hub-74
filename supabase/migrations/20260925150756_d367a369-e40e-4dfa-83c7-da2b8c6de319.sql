GRANT SELECT ON public.product_facets TO anon, authenticated;
CREATE POLICY "Public can read product facets" ON public.product_facets FOR SELECT TO anon, authenticated USING (true);