
DROP VIEW IF EXISTS public.public_vendor_contacts;
CREATE VIEW public.public_vendor_contacts
WITH (security_invoker = true) AS
SELECT
  p.id AS vendor_id,
  p.shop_name,
  p.shop_logo_url,
  p.shop_banner_url,
  p.shop_description,
  p.shop_description_i18n,
  p.shop_hours,
  p.shop_hours_i18n,
  p.shop_hours_schedule,
  CASE WHEN public.vendor_contacts_visible(p.id) AND p.show_whatsapp THEN p.shop_whatsapp ELSE NULL END AS shop_whatsapp,
  CASE WHEN public.vendor_contacts_visible(p.id) AND p.show_phone THEN p.phone ELSE NULL END AS phone,
  CASE WHEN public.vendor_contacts_visible(p.id) AND p.show_email THEN p.email ELSE NULL END AS email,
  CASE WHEN public.vendor_contacts_visible(p.id) AND p.show_address THEN p.address ELSE NULL END AS address,
  CASE WHEN public.vendor_contacts_visible(p.id) AND p.show_address THEN p.latitude ELSE NULL END AS latitude,
  CASE WHEN public.vendor_contacts_visible(p.id) AND p.show_address THEN p.longitude ELSE NULL END AS longitude,
  p.contact_mode,
  p.vendor_mode
FROM public.profiles p
WHERE public.vendor_publicly_visible(p.id);

GRANT SELECT ON public.public_vendor_contacts TO anon, authenticated;
