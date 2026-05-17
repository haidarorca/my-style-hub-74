-- Test: la contrainte d'unicité (vendor_id, code) existe BIEN au niveau de la base.
--
-- Ce test ne dépend d'aucune logique applicative : il interroge le catalogue
-- système Postgres pour vérifier qu'un UNIQUE INDEX sur (vendor_id, code)
-- protège la table public.products. Si quelqu'un supprime accidentellement la
-- contrainte, ce test échoue immédiatement.
--
-- Exécution :
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/product_code_unique_constraint.sql

DO $$
DECLARE
  idx_name text;
  is_unique boolean;
  cols text;
  has_global_unique_on_code boolean;
BEGIN
  -- 1. Trouver un index UNIQUE qui couvre EXACTEMENT (vendor_id, code)
  SELECT i.relname,
         ix.indisunique,
         string_agg(a.attname, ',' ORDER BY array_position(ix.indkey::int[], a.attnum))
    INTO idx_name, is_unique, cols
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (ix.indkey)
   WHERE n.nspname = 'public'
     AND t.relname = 'products'
     AND ix.indisunique = true
   GROUP BY i.relname, ix.indisunique, ix.indkey
  HAVING string_agg(a.attname, ',' ORDER BY array_position(ix.indkey::int[], a.attnum))
       IN ('vendor_id,code', 'code,vendor_id')
   LIMIT 1;

  IF idx_name IS NULL THEN
    RAISE EXCEPTION '❌ ÉCHEC : aucun index UNIQUE sur (vendor_id, code) trouvé sur public.products';
  END IF;

  IF NOT is_unique THEN
    RAISE EXCEPTION '❌ ÉCHEC : l''index % existe mais n''est pas UNIQUE', idx_name;
  END IF;

  RAISE NOTICE '✅ OK : contrainte UNIQUE "%(%)" présente sur public.products', idx_name, cols;

  -- 2. Vérifier qu'AUCUN index UNIQUE global sur "code" seul ne subsiste
  --    (sinon l'unicité redeviendrait globale au site).
  SELECT EXISTS (
    SELECT 1
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (ix.indkey)
     WHERE n.nspname = 'public'
       AND t.relname = 'products'
       AND ix.indisunique = true
     GROUP BY i.relname, ix.indkey
    HAVING string_agg(a.attname, ',' ORDER BY array_position(ix.indkey::int[], a.attnum)) = 'code'
  ) INTO has_global_unique_on_code;

  IF has_global_unique_on_code THEN
    RAISE EXCEPTION '❌ ÉCHEC : un index UNIQUE global sur "code" seul existe encore — l''unicité ne doit être que par boutique';
  END IF;

  RAISE NOTICE '✅ OK : aucun index UNIQUE global sur "code" — l''unicité est bien par boutique uniquement';

  -- 3. Vérifier qu'aucune contrainte CHECK ne re-impose l'unicité globale
  --    (le seul moyen d'imposer l'unicité côté base reste un UNIQUE INDEX).
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'products'
      AND c.contype = 'u'
      AND ARRAY(SELECT attname::text FROM pg_attribute WHERE attrelid = t.oid AND attnum = ANY (c.conkey)) = ARRAY['code']::text[]
  ) THEN
    RAISE EXCEPTION '❌ ÉCHEC : contrainte UNIQUE résiduelle sur la colonne "code" seule';
  END IF;

  RAISE NOTICE '🎉 La contrainte d''unicité par boutique est garantie au niveau base de données.';
END $$;
