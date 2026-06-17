import { createContext, useContext, type ReactNode } from "react";
import { useDisplayPrices } from "@/hooks/use-display-prices";
import type { DisplayPrice } from "@/lib/pricing.functions";

const PricesContext = createContext<Map<string, DisplayPrice> | null>(null);

/**
 * Wraps a list of products and fetches their final (commission-included)
 * prices for the current delivery country. Children can call
 * `useProductDisplayPrice(id)` to read the resolved price.
 */
export function ProductPricesProvider({
  productIds,
  children,
}: {
  productIds: string[];
  children: ReactNode;
}) {
  const map = useDisplayPrices(productIds);
  return <PricesContext.Provider value={map}>{children}</PricesContext.Provider>;
}

export function useProductDisplayPrice(productId: string): DisplayPrice | null {
  const ctx = useContext(PricesContext);
  return ctx?.get(productId) ?? null;
}
