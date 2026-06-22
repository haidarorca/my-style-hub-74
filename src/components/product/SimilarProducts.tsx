import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ProductCard } from "./ProductCard";
import { ProductPricesProvider } from "./ProductPricesProvider";
import { QuickAddSheet } from "./QuickAddSheet";
import { supabase } from "@/integrations/supabase/client";
import { useDeliverableVendorIds } from "@/hooks/use-deliverable-vendors";

export function SimilarProducts({
  productId,
  categoryId,
}: {
  productId: string;
  categoryId: string | null;
}) {
  const [quickAdd, setQuickAdd] = useState<string | null>(null);
  const { countryId, vendorIds: deliverableVendorIds } = useDeliverableVendorIds();

  const { data: products } = useQuery({
    queryKey: ["similar", productId, categoryId, countryId, deliverableVendorIds],
    enabled: !countryId || deliverableVendorIds !== null,
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id, name, price, code, weight_kg, length_cm, width_cm, height_cm, warranty_days, material, material_composition_items, min_order_qty, origin_country:countries!products_origin_country_id_fkey(name, flag_emoji), profiles!products_vendor_id_profiles_fkey(source_country_id), product_images(url), product_variants(measurements)")
        .eq("status", "approved")
        .neq("id", productId)
        .limit(10);
      if (categoryId) q = q.eq("category_id", categoryId);
      if (deliverableVendorIds) {
        if (deliverableVendorIds.length === 0) return [];
        q = q.in("vendor_id", deliverableVendorIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!products || products.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 text-sm font-bold">Vous aimerez aussi</h2>
      <ProductPricesProvider productIds={products.map((p) => p.id)}>
        <div className="grid-products">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} onQuickAdd={setQuickAdd} />
          ))}
        </div>
      </ProductPricesProvider>
      <QuickAddSheet
        productId={quickAdd}
        open={!!quickAdd}
        onOpenChange={(o) => !o && setQuickAdd(null)}
      />
    </section>
  );
}
