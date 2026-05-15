import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Store, BadgeCheck, Clock, MapPin, Phone } from "lucide-react";
import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { ProductCard } from "@/components/product/ProductCard";
import { QuickAddSheet } from "@/components/product/QuickAddSheet";
import { supabase } from "@/integrations/supabase/client";
import { normalizeSchedule, summarizeSchedule, isOpenNow } from "@/lib/shop-hours";

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
        .select("*")
        .eq("id", vendorId)
        .maybeSingle();
      return data as Record<string, unknown> | null;
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

  const v = vendor ?? {};
  const shopName = (v.shop_name as string) || (v.full_name as string) || "Boutique";
  const desc = v.shop_description as string | undefined;
  const hours = v.shop_hours as string | undefined;
  const address = v.address as string | undefined;
  const logo = v.shop_logo_url as string | undefined;
  const banner = v.shop_banner_url as string | undefined;
  const whatsapp = (v.shop_whatsapp as string) || (v.phone as string) || "";
  const verified = !!v.is_verified;
  const productCount = products?.length ?? 0;

  const waLink = whatsapp
    ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Bonjour, je vous contacte au sujet de votre boutique ${shopName}.`)}`
    : null;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-3 pb-safe">
        <div className="mt-2"><BackButton fallbackTo="/" /></div>

        {/* Banner + logo */}
        <section className="mt-2 overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div
            className="relative h-32 w-full bg-gradient-to-br from-primary/60 to-accent/60 sm:h-40"
            style={banner ? { backgroundImage: `url(${banner})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
          />
          <div className="px-4 pb-4">
            <div className="-mt-10 flex items-end gap-3">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-muted shadow">
                {logo ? (
                  <img src={logo} alt={shopName} className="h-full w-full object-cover" />
                ) : (
                  <Store className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex items-center gap-1.5">
                  <h1 className="truncate text-lg font-extrabold">{shopName}</h1>
                  {verified && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      <BadgeCheck className="h-3 w-3" /> Vérifié
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{productCount} produit{productCount > 1 ? "s" : ""}</p>
              </div>
            </div>

            {desc && <p className="mt-3 text-sm text-foreground/80">{desc}</p>}

            <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
              {address && <div className="flex items-start gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{address}</span></div>}
            </div>

            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] text-sm font-semibold text-white shadow active:scale-[0.99]"
              >
                <Phone className="h-4 w-4" /> Contacter sur WhatsApp
              </a>
            )}
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
