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
  const { countryId, ready } = useDeliveryCountry();

  const { data, isLoading } = useQuery({
    queryKey: ["deliverable-vendors", countryId],
    enabled: !!countryId,
    staleTime: 60_000,
    queryFn: async () => {
      // A vendor delivers to `countryId` when:
      //  - their source country IS the selected country (delivers in own country), OR
      //  - they ship internationally AND the country is in their allowed list.
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, source_country_id, ships_internationally, allowed_destination_country_ids");
      if (error) throw error;
      return ((data ?? []) as Array<{
        id: string;
        source_country_id: string | null;
        ships_internationally: boolean | null;
        allowed_destination_country_ids: string[] | null;
      }>)
        .filter((v) =>
          v.source_country_id === countryId ||
          (v.ships_internationally === true && (v.allowed_destination_country_ids ?? []).includes(countryId!)),
        )
        .map((r) => r.id);
    },
  });

  return {
    countryId,
    vendorIds: countryId ? (data ?? null) : null,
    ready: ready && (!countryId || !isLoading),
  };
}
