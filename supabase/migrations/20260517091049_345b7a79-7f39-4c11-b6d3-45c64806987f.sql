REVOKE ALL ON FUNCTION public.product_code_exists_in_shop(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.product_code_exists_in_shop(uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.product_code_exists_in_shop(uuid, text, uuid) FROM authenticated;