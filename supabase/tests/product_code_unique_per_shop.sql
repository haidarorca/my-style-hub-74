-- Test: le code produit est unique PAR boutique (vendor_id), pas globalement.
--
-- Exécution :
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/product_code_unique_per_shop.sql
--
-- Tout le test s'exécute dans une transaction qui est annulée à la fin,
-- aucune donnée n'est conservée.

BEGIN;

DO $$
DECLARE
  shop_a uuid := gen_random_uuid();
  shop_b uuid := gen_random_uuid();
  duplicate_raised boolean := false;
BEGIN
  -- 1. Même code dans deux boutiques différentes => AUTORISÉ
  INSERT INTO public.products (vendor_id, code, name, price, status)
  VALUES (shop_a, 'TEST-CODE-1', 'Produit A', 10, 'approved');

  INSERT INTO public.products (vendor_id, code, name, price, status)
  VALUES (shop_b, 'TEST-CODE-1', 'Produit B', 20, 'approved');

  RAISE NOTICE '✅ OK : même code "TEST-CODE-1" accepté dans deux boutiques différentes';

  -- 2. Même code dans la MÊME boutique => REFUSÉ
  BEGIN
    INSERT INTO public.products (vendor_id, code, name, price, status)
    VALUES (shop_a, 'TEST-CODE-1', 'Produit A doublon', 30, 'approved');
  EXCEPTION WHEN unique_violation THEN
    duplicate_raised := true;
  END;

  IF NOT duplicate_raised THEN
    RAISE EXCEPTION '❌ ÉCHEC : un doublon de code dans la même boutique aurait dû être refusé';
  END IF;
  RAISE NOTICE '✅ OK : doublon "TEST-CODE-1" refusé dans la même boutique';

  -- 3. Suppression puis recréation du même code dans la même boutique => AUTORISÉ
  DELETE FROM public.products WHERE vendor_id = shop_a AND code = 'TEST-CODE-1';

  INSERT INTO public.products (vendor_id, code, name, price, status)
  VALUES (shop_a, 'TEST-CODE-1', 'Produit A recréé', 40, 'approved');

  RAISE NOTICE '✅ OK : code réutilisable après suppression dans la même boutique';

  -- 4. Codes différents dans la même boutique => AUTORISÉ
  INSERT INTO public.products (vendor_id, code, name, price, status)
  VALUES (shop_a, 'TEST-CODE-2', 'Produit A bis', 50, 'approved');

  RAISE NOTICE '✅ OK : codes distincts coexistent dans la même boutique';

  RAISE NOTICE '🎉 Tous les tests d''unicité du code produit sont passés.';
END $$;

ROLLBACK;
