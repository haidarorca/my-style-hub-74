import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDisplayPrices, type DisplayPrice } from "@/lib/pricing.functions";
import { useDeliveryCountry } from "@/hooks/use-delivery-country";

/**
 * Resolve the buyer-facing prices (commission applied when the vendor is
 * configured with commission mode) for the given product ids. The result is
 * a Map<productId, finalPrice>.
 */
export function useDisplayPrices(productIds: string[]) {
  const { countryId } = useDeliveryCountry();
  const fetcher = useServerFn(getDisplayPrices);
  // Stable, sorted, deduped list of ids → stable react-query key
  const ids = useMemo(() => Array.from(new Set(productIds)).filter(Boolean).sort(), [productIds]);

  const { data } = useQuery({
    queryKey: ["display-prices", countryId, ids],
    enabled: ids.length > 0,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const rows = await fetcher({ data: { productIds: ids, destinationCountryId: countryId ?? null } });
      return rows as DisplayPrice[];
    },
  });

  return useMemo(() => {
    const map = new Map<string, DisplayPrice>();
    (data ?? []).forEach((r) => map.set(r.product_id, r));
    return map;
  }, [data]);
}

/** Convenience: returns just the final price for a single product. */
export function useDisplayPrice(productId: string | null | undefined) {
  const map = useDisplayPrices(productId ? [productId] : []);
  return productId ? map.get(productId) ?? null : null;
}
