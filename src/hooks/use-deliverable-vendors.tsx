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
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id")
        .or(
          `ships_internationally.eq.true,source_country_id.eq.${countryId},allowed_destination_country_ids.cs.{${countryId}}`,
        );
      if (error) throw error;
      return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
    },
  });

  return {
    countryId,
    vendorIds: countryId ? (data ?? null) : null,
    ready: ready && (!countryId || !isLoading),
  };
}
