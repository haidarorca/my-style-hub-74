import { useQuery } from "@tanstack/react-query";
import { listShippingServices } from "@/lib/shipping-services.functions";
import type { ShippingService } from "@/lib/shipping-services.functions";

export function useShippingServices() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["shipping-services"],
    queryFn: async () => {
      const result = await listShippingServices({ data: {} });
      return result as ShippingService[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes — services changent rarement
  });

  const findById = (id: string | null): ShippingService | undefined => {
    if (!id || !data) return undefined;
    return data.find((s) => s.id === id);
  };

  return {
    services: data ?? [],
    findById,
    isLoading,
    error,
  };
}
