CREATE OR REPLACE FUNCTION public.cat_match_key(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT regexp_replace(
           regexp_replace(
             lower(
               translate(
                 btrim(replace(replace(replace(coalesce(_name, ''), '&amp;', '&'), '，', ','), '·', '')),
                 'áàâäãåçéèêëíìîïñóòôöõúùûüýÿœæ’''',
                 'aaaaaaceeeeiiiinooooouuuuyyoa  '
               )
             ),
             '[^a-z0-9]+', '', 'g'
           ),
           '(ies|s)$', '', 'g'
         )
$$;

CREATE OR REPLACE FUNCTION public.cj_root_family(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE public.cat_match_key(_name)
    WHEN 'menclothing' THEN 'Mode Homme'
    WHEN 'mensclothing' THEN 'Mode Homme'
    WHEN 'womenclothing' THEN 'Mode Femme'
    WHEN 'womensclothing' THEN 'Mode Femme'
    WHEN 'toykidbaby' THEN 'Enfants & Bébé'
    WHEN 'toyskidsbaby' THEN 'Enfants & Bébé'
    WHEN 'toykidsbab' THEN 'Enfants & Bébé'
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

REVOKE ALL ON FUNCTION public.cat_match_key(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cj_root_family(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_match_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cj_root_family(text) TO authenticated, service_role;