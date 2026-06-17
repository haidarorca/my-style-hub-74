import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDeliveryCountry } from "@/hooks/use-delivery-country";

/**
 * Returns the list of vendor IDs whose products can be delivered to the
 * currently selected delivery country.
 *
 * A vendor is considered deliverable when at least one of:
 *  - ships_internationally = true
 *  - the country is listed in allowed_destination_country_ids
 *  - the vendor's source_country_id matches (delivers in own country)
 *
 * When no country is selected, returns `null` → no filtering (show everything).
 */
export function useDeliverableVendorIds(): {
  countryId: string | null;
  vendorIds: string[] | null;
  ready: boolean;
} {
  const { countryId, ready, isManual } = useDeliveryCountry();

  const { data, isLoading } = useQuery({
    queryKey: ["deliverable-vendors", countryId],
    enabled: !!countryId,
    staleTime: 60_000,
    queryFn: async () => {
      // Optimisation: une seule RPC indexée côté DB renvoie directement
      // les vendor ids livrables. Logique identique à l'ancienne version
      // (source country OR ships_internationally + allowed list).
      const { data, error } = await (supabase as any).rpc("get_deliverable_vendor_ids", {
        _country_id: countryId,
      });
      if (error) throw error;
      return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
    },
  });

  // Strict filtering only when the visitor explicitly picked a country.
  // For auto-detected country (geo-IP / default address), if no vendor
  // delivers there we fall back to no filter rather than hide the entire
  // catalogue — otherwise a wrong IP geo-location ("Aucun produit publié")
  // makes the site look empty even though products exist.
  let vendorIds: string[] | null = null;
  if (countryId) {
    const list = data ?? null;
    if (isManual) {
      vendorIds = list; // strict when user chose the country
    } else {
      vendorIds = list && list.length > 0 ? list : null; // graceful fallback
    }
  }

  return {
    countryId,
    vendorIds,
    ready: ready && (!countryId || !isLoading),
  };
}
