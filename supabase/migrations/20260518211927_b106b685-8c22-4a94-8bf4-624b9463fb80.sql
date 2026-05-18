-- Optimisation: filtre pays/livraison
-- 1) Index GIN sur allowed_destination_country_ids pour accélérer le filtre
CREATE INDEX IF NOT EXISTS idx_profiles_allowed_dest_countries
  ON public.profiles USING GIN (allowed_destination_country_ids);

-- Index B-tree sur source_country_id (filtre simple égalité)
CREATE INDEX IF NOT EXISTS idx_profiles_source_country
  ON public.profiles (source_country_id);

-- 2) RPC: retourne uniquement les ids vendeurs livrables vers un pays
--    Réplique exactement la logique actuelle côté client (use-deliverable-vendors):
--    - source_country_id = pays choisi (le vendeur livre dans son propre pays), OU
--    - ships_internationally = true ET pays dans allowed_destination_country_ids
--    Filtré aussi à la visibilité publique (mêmes contraintes que public_vendor_profiles).
CREATE OR REPLACE FUNCTION public.get_deliverable_vendor_ids(_country_id uuid)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.profiles p
  WHERE _country_id IS NOT NULL
    AND public.vendor_publicly_visible(p.id)
    AND (
      p.source_country_id = _country_id
      OR (
        COALESCE(p.ships_internationally, false) = true
        AND p.allowed_destination_country_ids @> ARRAY[_country_id]::uuid[]
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_deliverable_vendor_ids(uuid) TO anon, authenticated;