import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Package, ImageIcon, Phone, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/orders")({
  component: AdminOrders,
});

const STATUSES = [
  { value: "new", label: "En attente de validation" },
  { value: "confirmed", label: "Confirmée" },
  { value: "delivered", label: "Livrée" },
  { value: "cancelled", label: "Annulée" },
];

const statusVariant = (s: string) =>
  s === "delivered" ? "default" : s === "cancelled" ? "destructive" : s === "confirmed" ? "secondary" : "outline";

function AdminOrders() {
  const qc = useQueryClient();
  const [zoomImg, setZoomImg] = useState<string | null>(null);

  const { data: orders } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data: ords, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (ords ?? []).map((o: any) => o.id);
      if (ids.length === 0) return [];
      const { data: items } = await supabase.from("order_items").select("*").in("order_id", ids);
      return (ords ?? []).map((o: any) => ({
        ...o,
        items: (items ?? []).filter((i: any) => i.order_id === o.id),
      }));
    },
  });

  const updateStatus = async (orderId: string, status: string) => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
    if (error) return toast.error("Erreur");
    toast.success("Statut mis à jour");
    qc.invalidateQueries({ queryKey: ["admin-orders"] });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Toutes les commandes</h1>

      {!orders || orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
          Aucune commande.
        </div>
      ) : (
        <ul className="space-y-4">
          {orders.map((o: any) => (
            <li key={o.id} className="overflow-hidden rounded-xl border bg-card">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-accent/30 px-3 py-2">
                <div>
                  <div className="text-xs font-semibold">Commande #{o.id.slice(0, 8)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(o.created_at).toLocaleString("fr-FR")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(o.status) as any}>
                    {STATUSES.find((s) => s.value === o.status)?.label ?? o.status}
                  </Badge>
                  <Select value={o.status} onValueChange={(v) => updateStatus(o.id, v)}>
                    <SelectTrigger className="h-7 w-[130px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </header>

              <div className="border-b bg-muted/20 px-3 py-2 text-xs">
                <div className="font-semibold">{o.customer_name ?? "—"}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground">
                  {o.customer_phone && (
                    <a href={`tel:${o.customer_phone}`} className="inline-flex items-center gap-1 hover:text-primary">
                      <Phone className="h-3 w-3" /> {o.customer_phone}
                    </a>
                  )}
                  {(o.address || o.city) && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {[o.address, o.city].filter(Boolean).join(", ")}
                    </span>
                  )}
                </div>
                {o.note && <div className="mt-1 italic text-muted-foreground">Note : {o.note}</div>}
              </div>

              <ul>
                {o.items.map((it: any) => {
                  const c = it.customization || {};
                  return (
                    <li key={it.id} className="flex gap-3 border-b p-3 last:border-0">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {it.product_image_url && (
                          <img src={it.product_image_url} alt={it.product_name} className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="text-sm font-semibold">{it.product_name}</div>
                        <div className="text-xs text-muted-foreground">
                          Code {it.product_code} · Qté {it.quantity} ·{" "}
                          {Number(it.unit_price).toLocaleString("fr-FR")} FCFA
                        </div>
                        {(it.size || it.color) && (
                          <div className="text-xs text-muted-foreground">
                            {it.size && <>Taille : {it.size}</>}
                            {it.size && it.color && " · "}
                            {it.color && <>Couleur : {it.color}</>}
                          </div>
                        )}
                        {(c.text || c.image_url) && (
                          <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs">
                            <div className="mb-1 font-semibold text-primary">Personnalisation</div>
                            {c.text && (
                              <div
                                className="rounded bg-background p-2 text-base"
                                style={{ fontFamily: c.font || undefined, color: c.color || undefined }}
                              >
                                {c.text}
                              </div>
                            )}
                            {c.image_url && (
                              <button
                                onClick={() => setZoomImg(c.image_url)}
                                className="mt-2 block h-20 w-20 overflow-hidden rounded border bg-muted"
                              >
                                <img src={c.image_url} alt="logo" className="h-full w-full object-contain" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
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

      <Dialog open={!!zoomImg} onOpenChange={(o) => !o && setZoomImg(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Image de personnalisation</DialogTitle>
          </DialogHeader>
          {zoomImg && (
            <div className="space-y-3">
              <img src={zoomImg} alt="zoom" className="max-h-[70vh] w-full object-contain" />
              <a href={zoomImg} target="_blank" rel="noreferrer">
                <Button variant="outline" className="w-full">
                  Ouvrir dans un nouvel onglet
                </Button>
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
