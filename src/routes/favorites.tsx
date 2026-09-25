import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFavorites } from "@/hooks/use-favorites";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/favorites")({
  head: () => ({
    meta: [
      { title: "Mes favoris — KawZone" },
      { name: "description", content: "Retrouvez les produits que vous avez enregistrés en favori sur KawZone." },
      { property: "og:title", content: "Mes favoris — KawZone" },
      { property: "og:description", content: "Vos produits favoris KawZone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FavoritesPage,
});

type Row = { id: string; name: string; price: number; product_images: { url: string; position: number }[] | null };

function FavoritesPage() {
  const { user } = useAuth();
  const { ids, toggle } = useFavorites();

  const { data, isLoading } = useQuery({
    queryKey: ["favorites-products", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, product_images(url, position)")
        .in("id", ids);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Row[];
      return ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean) as Row[];
    },
  });

  if (!user) {
    return (
      <div className="mx-auto max-w-md p-6 text-center space-y-3">
        <Heart className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Connectez-vous pour voir vos favoris.</p>
        <Link to="/login"><Button>Se connecter</Button></Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 space-y-4">
      <h1 className="flex items-center gap-2 text-xl font-bold"><Heart className="h-5 w-5 text-primary" /> Mes favoris</h1>
      {ids.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Aucun favori pour le moment. Touchez le cœur sur un produit pour l'enregistrer ici.</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {(data ?? []).map((p) => {
            const img = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position)[0]?.url;
            return (
              <div key={p.id} className="overflow-hidden rounded-xl border bg-card">
                <Link to="/product/$productId" params={{ productId: p.id }}>
                  {img ? <img src={img} alt={p.name} loading="lazy" className="aspect-square w-full object-cover" /> : <div className="aspect-square bg-muted" />}
                  <div className="p-2">
                    <p className="line-clamp-2 text-sm">{p.name}</p>
                    <p className="text-sm font-bold text-primary">{Math.round(Number(p.price)).toLocaleString("fr-FR")} FCFA</p>
                  </div>
                </Link>
                <button onClick={() => toggle(p.id)} className="flex w-full items-center justify-center gap-1 border-t py-1.5 text-xs text-destructive">
                  <Trash2 className="h-3.5 w-3.5" /> Retirer
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
