import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Flame, Truck, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const { data: categories } = useQuery({
    queryKey: ["categories", "level1"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, logo_url")
        .eq("level", 1)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products", "approved"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, code, product_images(url)")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(24);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-3 pb-safe">
        {/* Hero promo banner */}
        <section className="mt-3 overflow-hidden rounded-2xl gradient-flash p-5 text-primary-foreground shadow-pink">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider opacity-90">
            <Flame className="h-4 w-4" /> Nouveautés
          </div>
          <h1 className="mt-2 text-2xl font-extrabold leading-tight md:text-4xl">
            Vos produits préférés,<br />personnalisés à votre image
          </h1>
          <p className="mt-2 max-w-md text-sm opacity-90">
            Ajoutez votre nom, votre logo, votre photo. Commande envoyée directement sur WhatsApp.
          </p>
        </section>

        {/* Trust strip */}
        <section className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-card p-3 shadow-soft">
            <Sparkles className="mx-auto mb-1 h-5 w-5 text-primary" />
            Personnalisation
          </div>
          <div className="rounded-xl bg-card p-3 shadow-soft">
            <Truck className="mx-auto mb-1 h-5 w-5 text-primary" />
            Livraison rapide
          </div>
          <div className="rounded-xl bg-card p-3 shadow-soft">
            <ShieldCheck className="mx-auto mb-1 h-5 w-5 text-primary" />
            Produits vérifiés
          </div>
        </section>

        {/* Categories */}
        <section className="mt-6">
          <h2 className="mb-3 text-base font-bold">Catégories</h2>
          {categories && categories.length > 0 ? (
            <div className="grid grid-cols-4 gap-3 md:grid-cols-6">
              {categories.map((c) => (
                <div key={c.id} className="flex flex-col items-center gap-1.5 text-center">
                  <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-accent">
                    {c.logo_url ? (
                      <img src={c.logo_url} alt={c.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-lg font-bold text-primary">{c.name[0]}</span>
                    )}
                  </div>
                  <span className="line-clamp-1 text-xs">{c.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Aucune catégorie pour le moment. L'admin pourra les créer depuis l'espace admin.
            </p>
          )}
        </section>

        {/* Products grid */}
        <section className="mt-6">
          <h2 className="mb-3 text-base font-bold">Tendances</h2>
          {products && products.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
              {products.map((p) => {
                const img = (p.product_images as { url: string }[] | null)?.[0]?.url;
                return (
                  <div
                    key={p.id}
                    className="group overflow-hidden rounded-xl bg-card shadow-soft transition-shadow hover:shadow-card"
                  >
                    <div className="aspect-[3/4] overflow-hidden bg-muted">
                      {img ? (
                        <img src={img} alt={p.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                      ) : null}
                    </div>
                    <div className="p-2">
                      <p className="line-clamp-2 text-xs">{p.name}</p>
                      <p className="mt-1 text-sm font-bold text-primary">{p.price} FCFA</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Aucun produit publié pour l'instant.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
