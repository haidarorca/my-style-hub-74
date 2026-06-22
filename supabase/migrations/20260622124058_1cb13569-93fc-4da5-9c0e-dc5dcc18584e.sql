-- Fix duplicate foreign key on products(category_id) that breaks PostgREST embeds
-- (PGRST201: "Could not embed because more than one relationship was found").
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_category_id_categories_fkey;