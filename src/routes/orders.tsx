import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Package, MapPin, ShoppingBag } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/orders")({
  component: OrdersPage,
});

const STATUS_LABEL: Record<string, string> = {
  new: "En attente de validation",
  confirmed: "Confirmée",
  delivered: "Livrée",
  cancelled: "Annulée",
};

const statusVariant = (s: string) =>
  s === "delivered" ? "default" : s === "cancelled" ? "destructive" : s === "confirmed" ? "secondary" : "outline";

function OrdersPage() {
  const { user } = useAuth();

  const { data: orders, isLoading } = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: ords, error } = await supabase
        .from("orders")
        .select("*")
        .eq("buyer_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (ords ?? []).map((o: any) => o.id);
      if (ids.length === 0) return [];
      const { data: items } = await supabase
        .from("order_items")
        .select("*")
        .in("order_id", ids);
      return (ords ?? []).map((o: any) => ({
        ...o,
        items: (items ?? []).filter((i: any) => i.order_id === o.id),
      }));
    },
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-bold">Connectez-vous</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pour voir vos commandes.</p>
          <Link to="/login">
            <Button className="mt-4 rounded-full">Se connecter</Button>
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-safe">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-3 py-3">
        <BackButton fallbackTo="/" />
        <h1 className="mb-3 mt-2 text-lg font-bold">Mes commandes</h1>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : !orders || orders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
            Aucune commande pour le moment.
          </div>
        ) : (
          <ul className="space-y-3">
            {orders.map((o: any) => (
              <li key={o.id} className="overflow-hidden rounded-xl border bg-card shadow-soft">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-accent/30 px-3 py-2">
                  <div>
                    <div className="text-xs font-semibold">Commande #{o.id.slice(0, 8)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(o.created_at).toLocaleString("fr-FR")}
                    </div>
                  </div>
                  <Badge variant={statusVariant(o.status) as any}>
                    {STATUS_LABEL[o.status] ?? o.status}
                  </Badge>
                </header>

                <div className="border-b bg-muted/20 px-3 py-2 text-xs">
                  <div className="font-semibold">{o.customer_name ?? "—"}</div>
                  {(o.address || o.city) && (
                    <div className="mt-0.5 inline-flex items-center gap-1 text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {[o.address, o.city].filter(Boolean).join(", ")}
                    </div>
                  )}
                  {o.note && <div className="mt-1 italic text-muted-foreground">Note : {o.note}</div>}
                </div>

                <ul>
                  {o.items.map((it: any) => (
                    <li key={it.id} className="flex gap-3 border-b p-3 last:border-0">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {it.product_image_url && (
                          <img src={it.product_image_url} alt={it.product_name} className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-sm font-semibold">{it.product_name}</div>
                        <div className="text-xs text-muted-foreground">
                          Qté {it.quantity} · {Number(it.unit_price).toLocaleString("fr-FR")} FCFA
                        </div>
                        {(it.size || it.color) && (
                          <div className="text-xs text-muted-foreground">
                            {it.size && <>Taille : {it.size}</>}
                            {it.size && it.color && " · "}
                            {it.color && <>Couleur : {it.color}</>}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="flex items-center justify-between border-t bg-muted/10 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-bold text-primary">
                    {Number(o.total).toLocaleString("fr-FR")} FCFA
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
