
ALTER FUNCTION public.compute_product_content_hash(text, text, text) SET search_path = public;
ALTER FUNCTION public.compute_text_hash(text) SET search_path = public;
ALTER FUNCTION public.tg_products_content_hash() SET search_path = public;
ALTER FUNCTION public.tg_categories_content_hash() SET search_path = public;
ALTER FUNCTION public.tg_countries_content_hash() SET search_path = public;
