DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('user_roles', 'user_roles_user_id_profiles_fkey', 'user_id', 'profiles', 'CASCADE'),
      ('products', 'products_vendor_id_profiles_fkey', 'vendor_id', 'profiles', 'CASCADE'),
      ('products', 'products_category_id_categories_fkey', 'category_id', 'categories', 'SET NULL'),
      ('product_images', 'product_images_product_id_fkey', 'product_id', 'products', 'CASCADE'),
      ('product_variants', 'product_variants_product_id_fkey', 'product_id', 'products', 'CASCADE'),
      ('product_customizations', 'product_customizations_product_id_fkey', 'product_id', 'products', 'CASCADE'),
      ('product_reviews', 'product_reviews_product_id_fkey', 'product_id', 'products', 'CASCADE'),
      ('product_reviews', 'product_reviews_user_id_profiles_fkey', 'user_id', 'profiles', 'CASCADE'),
      ('cart_items', 'cart_items_product_id_fkey', 'product_id', 'products', 'CASCADE'),
      ('cart_items', 'cart_items_variant_id_fkey', 'variant_id', 'product_variants', 'SET NULL'),
      ('cart_items', 'cart_items_user_id_profiles_fkey', 'user_id', 'profiles', 'CASCADE'),
      ('product_reports', 'product_reports_product_id_fkey', 'product_id', 'products', 'CASCADE'),
      ('product_reports', 'product_reports_reporter_id_profiles_fkey', 'reporter_id', 'profiles', 'CASCADE')
    ) AS t(tbl, cname, col, ref_tbl, on_del)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = rec.tbl AND c.conname = rec.cname
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) ON DELETE %s',
        rec.tbl, rec.cname, rec.col, rec.ref_tbl, rec.on_del
      );
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
