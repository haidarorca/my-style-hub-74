import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ProductCard } from "./ProductCard";
import { QuickAddSheet } from "./QuickAddSheet";
import { supabase } from "@/integrations/supabase/client";

export function SimilarProducts({
  productId,
  categoryId,
}: {
  productId: string;
  categoryId: string | null;
}) {
  const [quickAdd, setQuickAdd] = useState<string | null>(null);

  const { data: products } = useQuery({
    queryKey: ["similar", productId, categoryId],
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id, name, price, code, product_images(url)")
        .eq("status", "approved")
        .neq("id", productId)
        .limit(10);
      if (categoryId) q = q.eq("category_id", categoryId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!products || products.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 text-sm font-bold">Vous aimerez aussi</h2>
      <div className="grid-products">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} onQuickAdd={setQuickAdd} />
        ))}
      </div>
      <QuickAddSheet
        productId={quickAdd}
        open={!!quickAdd}
        onOpenChange={(o) => !o && setQuickAdd(null)}
      />
    </section>
  );
}
