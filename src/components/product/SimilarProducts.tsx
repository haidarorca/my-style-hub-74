import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ProductCard } from "./ProductCard";
import { ProductPricesProvider } from "./ProductPricesProvider";
import { QuickAddSheet } from "./QuickAddSheet";
import { supabase } from "@/integrations/supabase/client";
import { useDeliverableVendorIds } from "@/hooks/use-deliverable-vendors";
import { Link } from "@tanstack/react-router";

export function SimilarProducts({
  productId,
  categoryId,
}: {
  productId: string;
  categoryId: string | null;
}) {
  const [quickAdd, setQuickAdd] = useState<string | null>(null);
  const { countryId, vendorIds: deliverableVendorIds, ready: deliveryReady } = useDeliverableVendorIds();

  const { data: products, isPending } = useQuery({
    queryKey: ["similar", productId, categoryId, countryId, deliverableVendorIds],
    enabled: deliveryReady,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (deliverableVendorIds?.length === 0) return [];
      const fetchBranch = async (ids?: string[]) => {
        let q = supabase.from("products")
          .select("id, name, name_i18n, price, code, category_id, weight_kg, length_cm, width_cm, height_cm, warranty_days, material, material_composition_items, min_order_qty, has_size_guide, origin_country:countries!products_origin_country_id_fkey(name, flag_emoji), profiles!products_vendor_id_profiles_fkey(source_country_id), product_images(url)")
          .limit(1, { referencedTable: "product_images" })
          .eq("status", "approved").neq("id", productId).limit(10);
        if (ids?.length) q = q.in("category_id", ids);
        if (deliverableVendorIds) q = q.in("vendor_id", deliverableVendorIds);
        const { data, error } = await q;
        if (error) throw error;
        return data ?? [];
      };
      const selected = new Map<string, Awaited<ReturnType<typeof fetchBranch>>[number]>();
      const add = async (ids?: string[]) => {
        for (const item of await fetchBranch(ids)) selected.set(item.id, item);
      };
      if (categoryId) {
        await add([categoryId]);
        if (selected.size < 10) {
          const { data: current } = await supabase.from("categories").select("parent_id").eq("id", categoryId).maybeSingle();
          const familyId = current?.parent_id ?? categoryId;
          const { data: siblings } = await supabase.from("categories").select("id").eq("parent_id", familyId);
          await add([familyId, ...(siblings ?? []).map((c) => c.id)]);
          if (!current?.parent_id && selected.size < 4) {
            const childIds = (siblings ?? []).map((c) => c.id);
            if (childIds.length) {
              const { data: leaves } = await supabase.from("categories").select("id").in("parent_id", childIds);
              await add((leaves ?? []).map((c) => c.id));
            }
          }
          if (selected.size < 4 && current?.parent_id) {
            const { data: parent } = await supabase.from("categories").select("parent_id").eq("id", familyId).maybeSingle();
            if (parent?.parent_id) {
              const { data: branches } = await supabase.from("categories").select("id").eq("parent_id", parent.parent_id);
              const branchIds = (branches ?? []).map((c) => c.id);
              const { data: leaves } = await supabase.from("categories").select("id").in("parent_id", branchIds.length ? branchIds : [parent.parent_id]);
              await add([parent.parent_id, ...branchIds, ...(leaves ?? []).map((c) => c.id)]);
            }
          }
        }
      }
      // Dernier recours : ne jamais laisser la rangée vide si la famille est isolée.
      if (selected.size < 4) await add();
      return [...selected.values()].slice(0, 10);
    },
  });

  if (isPending) return <section className="min-h-40"><h2 className="mb-2 text-sm font-bold">Vous aimerez aussi</h2></section>;
  if (!products || products.length === 0) return <section><h2 className="mb-2 text-sm font-bold">Vous aimerez aussi</h2><Link to="/catalogue" className="text-sm text-primary underline">Découvrir le catalogue →</Link></section>;

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
