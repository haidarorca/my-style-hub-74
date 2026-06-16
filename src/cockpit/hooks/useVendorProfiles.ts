// ═══════════════════════════════════════════════════════════════
// useVendorProfiles — Charge en batch les profils-boutiques visibles
// pour fournir : nom boutique, pays vendeur, marchés autorisés.
//
// Tout est dérivé de `profiles` (modèle profil-boutique unifié).
// Utilisé par le moteur de filtrage Cockpit pour distinguer :
//   - Pays vendeur (source_country_id)
//   - Marchés autorisés (allowed_destination_country_ids)
//   - Nom boutique (shop_name) pour la recherche texte
// ═══════════════════════════════════════════════════════════════

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VendorProfile {
  vendor_id: string;
  shop_name: string | null;
  source_country_id: string | null;
  source_country_name: string | null;
  allowed_destination_country_ids: string[];
}

export type VendorProfileMap = Map<string, VendorProfile>;

export function useVendorProfiles(vendorIds: string[]) {
  const ids = [...new Set(vendorIds.filter(v => v && v !== "unknown"))].sort();

  return useQuery({
    queryKey: ["cockpit-vendor-profiles", ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<VendorProfileMap> => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, shop_name, source_country_id, allowed_destination_country_ids")
        .in("id", ids);
      if (error) throw error;

      const countryIds = new Set<string>();
      for (const p of profiles ?? []) {
        if (p.source_country_id) countryIds.add(p.source_country_id as string);
        for (const c of (p.allowed_destination_country_ids ?? []) as string[]) {
          if (c) countryIds.add(c);
        }
      }
      let names = new Map<string, string>();
      if (countryIds.size > 0) {
        const { data: countries } = await supabase
          .from("countries")
          .select("id, name")
          .in("id", [...countryIds]);
        for (const c of countries ?? []) {
          if (c.id && c.name) names.set(c.id as string, c.name as string);
        }
      }

      const map: VendorProfileMap = new Map();
      for (const p of profiles ?? []) {
        map.set(p.id as string, {
          vendor_id: p.id as string,
          shop_name: (p.shop_name as string | null) ?? null,
          source_country_id: (p.source_country_id as string | null) ?? null,
          source_country_name: p.source_country_id ? names.get(p.source_country_id as string) ?? null : null,
          allowed_destination_country_ids: (p.allowed_destination_country_ids as string[] | null) ?? [],
        });
      }
      return map;
    },
  });
}
