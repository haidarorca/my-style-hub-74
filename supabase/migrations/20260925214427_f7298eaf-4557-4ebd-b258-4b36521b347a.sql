CREATE OR REPLACE FUNCTION public.translation_product_hashes(_ids uuid[])
RETURNS TABLE(id uuid, h text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, product_i18n_hash(p.name,p.designation,p.description,p.specifications,p.material,p.group_option_label)
  FROM products p WHERE p.id = ANY(_ids)
$$;
CREATE OR REPLACE FUNCTION public.translation_pending_dict(_langs text[], _limit int)
RETURNS SETOF public.translation_dictionary LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM translation_dictionary WHERE attempts < 3 AND NOT (tr ?& _langs) ORDER BY kind, src_norm LIMIT _limit
$$;
REVOKE ALL ON FUNCTION public.translation_product_hashes(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.translation_pending_dict(text[], int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.translation_product_hashes(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.translation_pending_dict(text[], int) TO service_role;