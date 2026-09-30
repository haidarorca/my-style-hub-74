CREATE OR REPLACE FUNCTION public.get_vendor_shipping_profiles(_ids uuid[])
RETURNS TABLE(id uuid, full_name text, shop_name text, vendor_mode public.vendor_mode, source_country_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.shop_name, p.vendor_mode, p.source_country_id
  FROM public.profiles p
  WHERE p.id = ANY(_ids) AND EXISTS (SELECT 1 FROM public.products pr WHERE pr.vendor_id = p.id);
$$;
REVOKE ALL ON FUNCTION public.get_vendor_shipping_profiles(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_vendor_shipping_profiles(uuid[]) TO anon, authenticated;