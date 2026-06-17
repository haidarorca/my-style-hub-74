import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDisplayPriceLines, getDisplayPrices, type DisplayPrice } from "@/lib/pricing.functions";
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
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
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

export function useDisplayPriceLines(lines: Array<{ productId: string; variantId?: string | null }>) {
  const { countryId } = useDeliveryCountry();
  const fetcher = useServerFn(getDisplayPriceLines);
  const stableLines = useMemo(
    () => lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, variantId: l.variantId ?? null })),
    [lines],
  );
  const key = useMemo(
    () => stableLines.map((l) => `${l.productId}:${l.variantId ?? ""}`).sort(),
    [stableLines],
  );

  const { data, isFetched } = useQuery({
    queryKey: ["display-price-lines", countryId, key],
    enabled: stableLines.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const rows = await fetcher({ data: { lines: stableLines, destinationCountryId: countryId ?? null } });
      return rows as DisplayPrice[];
    },
  });

  const map = useMemo(() => {
    const m = new Map<string, DisplayPrice>();
    (data ?? []).forEach((r) => m.set(`${r.product_id}:${r.variant_id ?? ""}`, r));
    return m;
  }, [data]);

  // Backward-compat: behave like a Map for existing callers, but also expose
  // `isReady` so the cart can avoid flicker between raw price and final price.
  return Object.assign(map, {
    isReady: stableLines.length === 0 || isFetched,
  }) as Map<string, DisplayPrice> & { isReady: boolean };
}
