SET statement_timeout = '300s';

-- Clé de comparaison souple : minuscules, sans accents parasites, sans ponctuation, sans pluriel
CREATE OR REPLACE FUNCTION public.cat_match_key(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(
           regexp_replace(
             lower(btrim(replace(replace(replace(_name, '&amp;', '&'), '，', ','), '·', ''))),
             '[^a-z0-9]+', '', 'g'),
           '(ies|s)$', '', 'g')
$$;

-- Grands rayons CJ -> familles KawZone existantes
CREATE OR REPLACE FUNCTION public.cj_root_family(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE public.cat_match_key(_name)
    WHEN 'menclothing' THEN 'Mode Homme'
    WHEN 'womenclothing' THEN 'Mode Femme'
    WHEN 'toykidbaby' THEN 'Enfants & Bébé'
    WHEN 'toykidbabie' THEN 'Enfants & Bébé'
    WHEN 'petsupplie' THEN 'Animaux'
    WHEN 'petsupply' THEN 'Animaux'
    WHEN 'sportoutdoor' THEN 'Sport & Fitness'
    WHEN 'homeimprovement' THEN 'Bricolage & Jardin'
    WHEN 'homegardenfurniture' THEN 'Maison & Décoration'
    WHEN 'healthbeautyhair' THEN 'Beauté & Santé'
    WHEN 'consumerelectronic' THEN 'Électronique'
    WHEN 'computeroffice' THEN 'Électronique'
    WHEN 'phoneaccessorie' THEN 'Électronique'
    WHEN 'phoneaccessory' THEN 'Électronique'
    WHEN 'automobilemotorcycle' THEN 'Auto & Moto'
    WHEN 'bagshoe' THEN 'Bagagerie & Voyage'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.ensure_cj_category_path(_path text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE parts text[]; seg text; parent uuid := NULL; cur uuid; lvl int := 0; s text; alias text;
BEGIN
  IF _path IS NULL OR btrim(_path) = '' THEN RETURN NULL; END IF;
  parts := regexp_split_to_array(_path, '\s*(>|›|/)\s*');
  FOREACH seg IN ARRAY parts LOOP
    -- nettoyage du libellé CJ
    seg := btrim(regexp_replace(replace(replace(seg, '&amp;', '&'), '，', ','), '\s+', ' ', 'g'));
    CONTINUE WHEN seg = '';
    lvl := lvl + 1;
    EXIT WHEN lvl > 3;

    -- les grands rayons CJ rejoignent les familles KawZone existantes
    IF lvl = 1 THEN
      alias := public.cj_root_family(seg);
      IF alias IS NOT NULL THEN
        SELECT id INTO cur FROM categories WHERE level = 1 AND parent_id IS NULL AND name = alias LIMIT 1;
        IF cur IS NOT NULL THEN parent := cur; cur := NULL; CONTINUE; END IF;
      END IF;
    END IF;

    SELECT id INTO cur FROM categories
      WHERE level = lvl AND parent_id IS NOT DISTINCT FROM parent
        AND public.cat_match_key(name) = public.cat_match_key(seg)
      LIMIT 1;

    IF cur IS NULL THEN
      s := trim(both '-' from regexp_replace(lower(seg), '[^a-z0-9]+', '-', 'g'));
      IF s = '' THEN s := 'cat'; END IF;
      IF EXISTS (SELECT 1 FROM categories WHERE slug = s AND parent_id IS NOT DISTINCT FROM parent) THEN
        SELECT id INTO cur FROM categories WHERE slug = s AND parent_id IS NOT DISTINCT FROM parent LIMIT 1;
      ELSE
        INSERT INTO categories(name, slug, level, parent_id) VALUES (seg, s, lvl, parent)
          ON CONFLICT DO NOTHING RETURNING id INTO cur;
        IF cur IS NULL THEN
          SELECT id INTO cur FROM categories WHERE slug = s AND parent_id IS NOT DISTINCT FROM parent AND level = lvl LIMIT 1;
        END IF;
      END IF;
    END IF;

    parent := cur; cur := NULL;
  END LOOP;
  RETURN parent;
END $function$;

REVOKE ALL ON FUNCTION public.cat_match_key(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cj_root_family(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cat_match_key(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cj_root_family(text) TO service_role;