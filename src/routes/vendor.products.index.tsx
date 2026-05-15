import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/vendor/products/")({
  component: VendorProductsList,
});

function VendorProductsList() {
  const { user } = useAuth();
  const { data: products } = useQuery({
    queryKey: ["vendor-products", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, code, price, status, rejection_reason, product_images(url)")
        .eq("vendor_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Mes produits</h1>
        <Link to="/vendor/products/new">
          <Button size="sm" className="rounded-full">
            <Plus className="mr-1 h-4 w-4" /> Ajouter
          </Button>
        </Link>
      </div>

      {!products || products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Aucun produit pour le moment. Cliquez sur « Ajouter » pour créer votre premier produit.
        </div>
      ) : (
        <ul className="space-y-2">
          {products.map((p) => {
            const img = (p.product_images as { url: string }[] | null)?.[0]?.url;
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {img && <img src={img} alt={p.name} className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Code {p.code} • {Number(p.price).toLocaleString("fr-FR")} FCFA
                  </div>
                  {p.rejection_reason && (
                    <div className="mt-1 text-xs text-destructive">Motif : {p.rejection_reason}</div>
                  )}
                </div>
                <Badge
                  variant={
                    p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "secondary"
                  }
                >
                  {p.status === "approved" ? "Publié" : p.status === "rejected" ? "Rejeté" : "En attente"}
                </Badge>
                <Link to="/vendor/products/$productId/edit" params={{ productId: p.id }}>
                  <Button size="icon" variant="ghost" className="h-8 w-8" title="Modifier">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
