REVOKE ALL ON FUNCTION public.create_imported_product_atomic(uuid, text, text, text, text, text, text, numeric, uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_imported_product_atomic(uuid, text, text, text, text, text, text, numeric, uuid, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_imported_product_atomic(uuid, text, text, text, text, text, text, numeric, uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_imported_product_atomic(uuid, text, text, text, text, text, text, numeric, uuid, jsonb, jsonb) TO service_role;