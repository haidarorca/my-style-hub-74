-- Test: le code produit est unique PAR boutique (vendor_id), pas globalement.
--
-- Exécution :
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/product_code_unique_per_shop.sql
--
-- Tout le test s'exécute dans une transaction qui est annulée à la fin,
-- aucune donnée n'est conservée. Les deux premières boutiques existantes
-- (profiles) sont utilisées comme cobayes ; sinon le test est ignoré.

BEGIN;

DO $$
DECLARE
  shop_a uuid;
  shop_b uuid;
  test_code text := 'TEST-UNIQ-' || substr(gen_random_uuid()::text, 1, 8);
  duplicate_raised boolean := false;
BEGIN
  SELECT id INTO shop_a FROM public.profiles ORDER BY created_at LIMIT 1;
  SELECT id INTO shop_b FROM public.profiles WHERE id <> shop_a ORDER BY created_at LIMIT 1;

  IF shop_a IS NULL OR shop_b IS NULL THEN
    RAISE NOTICE '⚠️  Test ignoré : il faut au moins 2 profils en base.';
    RETURN;
  END IF;

  RAISE NOTICE 'Boutiques utilisées : A=% / B=% / code=%', shop_a, shop_b, test_code;

  -- 1. Même code dans deux boutiques différentes => AUTORISÉ
  INSERT INTO public.products (vendor_id, code, name, price, status)
  VALUES (shop_a, test_code, 'Produit A', 10, 'approved');

  INSERT INTO public.products (vendor_id, code, name, price, status)
  VALUES (shop_b, test_code, 'Produit B', 20, 'approved');

  RAISE NOTICE '✅ OK : même code accepté dans deux boutiques différentes';

  -- 2. Même code dans la MÊME boutique => REFUSÉ
  BEGIN
    INSERT INTO public.products (vendor_id, code, name, price, status)
    VALUES (shop_a, test_code, 'Produit A doublon', 30, 'approved');
  EXCEPTION WHEN unique_violation THEN
    duplicate_raised := true;
  END;

  IF NOT duplicate_raised THEN
    RAISE EXCEPTION '❌ ÉCHEC : un doublon de code dans la même boutique aurait dû être refusé';
  END IF;
  RAISE NOTICE '✅ OK : doublon refusé dans la même boutique';

  -- 3. Suppression puis recréation du même code dans la même boutique => AUTORISÉ
  DELETE FROM public.products WHERE vendor_id = shop_a AND code = test_code;

  INSERT INTO public.products (vendor_id, code, name, price, status)
  VALUES (shop_a, test_code, 'Produit A recréé', 40, 'approved');

  RAISE NOTICE '✅ OK : code réutilisable après suppression définitive';

  -- 4. Codes différents dans la même boutique => AUTORISÉ
  INSERT INTO public.products (vendor_id, code, name, price, status)
  VALUES (shop_a, test_code || '-bis', 'Produit A bis', 50, 'approved');

  RAISE NOTICE '✅ OK : codes distincts coexistent dans la même boutique';

  RAISE NOTICE '🎉 Tous les tests d''unicité du code produit sont passés.';
END $$;

ROLLBACK;
