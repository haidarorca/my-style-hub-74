import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Store } from "lucide-react";
import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ProductCard } from "@/components/product/ProductCard";
import { QuickAddSheet } from "@/components/product/QuickAddSheet";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/shop/$vendorId")({
  component: ShopPage,
});

function ShopPage() {
  const { vendorId } = Route.useParams();
  const [quickAdd, setQuickAdd] = useState<string | null>(null);

  const { data: vendor } = useQuery({
    queryKey: ["vendor", vendorId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, shop_name, address")
        .eq("id", vendorId)
        .maybeSingle();
      return data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["vendor-products", vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, code, product_images(url)")
        .eq("vendor_id", vendorId)
        .eq("status", "approved")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const shopName = vendor?.shop_name || vendor?.full_name || "Boutique";

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-3 pb-safe">
        <Link to="/" className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <ChevronLeft className="h-3 w-3" /> Accueil
        </Link>

        <section className="mt-3 flex items-center gap-3 rounded-2xl gradient-flash p-4 text-primary-foreground shadow-pink">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
            <Store className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-extrabold">{shopName}</h1>
            <p className="text-xs opacity-90">
              {products?.length ?? 0} produit{(products?.length ?? 0) > 1 ? "s" : ""}
            </p>
          </div>
        </section>

        <section className="mt-5">
          <h2 className="mb-3 text-base font-bold">Tous les produits</h2>
          {products && products.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} onQuickAdd={setQuickAdd} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Cette boutique n'a aucun produit pour l'instant.
            </p>
          )}
        </section>
      </main>
      <QuickAddSheet
        productId={quickAdd}
        open={!!quickAdd}
        onOpenChange={(o) => !o && setQuickAdd(null)}
      />
    </div>
  );
}
