import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Package, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/vendor/orders")({
  component: VendorOrders,
});

interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  product_code: string;
  product_image_url: string | null;
  size: string | null;
  color: string | null;
  unit_price: number;
  quantity: number;
  customization: any;
  created_at: string;
  buyer_id: string;
}

function VendorOrders() {
  const { user } = useAuth();
  const [zoomImg, setZoomImg] = useState<string | null>(null);

  const { data: itemsRaw } = useQuery({
    queryKey: ["vendor-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("*")
        .eq("vendor_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrderItem[];
    },
  });

  const items = itemsRaw ?? [];

  // Fetch buyer profiles
  const buyerIds = Array.from(new Set(items.map((i) => i.buyer_id)));
  const { data: buyers } = useQuery({
    queryKey: ["vendor-orders-buyers", buyerIds.sort().join(",")],
    enabled: buyerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", buyerIds);
      const map: Record<string, { full_name: string | null; phone: string | null }> = {};
      for (const b of data ?? []) map[b.id] = { full_name: b.full_name, phone: b.phone };
      return map;
    },
  });

  // Group items by order_id
  const orders = new Map<string, OrderItem[]>();
  for (const it of items) {
    if (!orders.has(it.order_id)) orders.set(it.order_id, []);
    orders.get(it.order_id)!.push(it);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Commandes reçues</h1>

      {orders.size === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
          Aucune commande pour le moment.
        </div>
      ) : (
        <ul className="space-y-4">
          {Array.from(orders.entries()).map(([orderId, list]) => {
            const total = list.reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0);
            const date = new Date(list[0].created_at);
            const buyer = buyers?.[list[0].buyer_id];
            return (
              <li key={orderId} className="overflow-hidden rounded-xl border bg-card">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-accent/30 px-3 py-2">
                  <div>
                    <div className="text-xs font-semibold">Commande #{orderId.slice(0, 8)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {date.toLocaleString("fr-FR")}
                      {buyer?.full_name && <> · {buyer.full_name}</>}
                      {buyer?.phone && <> · {buyer.phone}</>}
                    </div>
                  </div>
                  <Badge variant="default">{total.toLocaleString("fr-FR")} FCFA</Badge>
                </header>
                <ul>
                  {list.map((it) => {
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
                                <div className="space-y-1">
                                  <div>Texte : <span className="font-medium">{c.text}</span></div>
                                  {c.font && <div>Police : <span className="font-medium">{c.font}</span></div>}
                                  {c.color && (
                                    <div className="flex items-center gap-1">
                                      Couleur :
                                      <span
                                        className="inline-block h-3 w-3 rounded-full border"
                                        style={{ backgroundColor: c.color }}
                                      />
                                      <span className="font-mono">{c.color}</span>
                                    </div>
                                  )}
                                  <div
                                    className="mt-1 rounded bg-background p-2 text-base"
                                    style={{ fontFamily: c.font || undefined, color: c.color || undefined }}
                                  >
                                    {c.text}
                                  </div>
                                </div>
                              )}
                              {c.image_url && (
                                <div className="mt-2">
                                  <button
                                    onClick={() => setZoomImg(c.image_url)}
                                    className="group relative block h-24 w-24 overflow-hidden rounded border bg-muted"
                                  >
                                    <img src={c.image_url} alt="logo client" className="h-full w-full object-contain" />
                                    <span className="absolute inset-0 hidden items-center justify-center bg-black/40 text-white group-hover:flex">
                                      <ImageIcon className="h-4 w-4" />
                                    </span>
                                  </button>
                                  <div className="mt-1">
                                    <a
                                      href={c.image_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[11px] text-primary underline"
                                    >
                                      Ouvrir / télécharger
                                    </a>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
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
                <Button variant="outline" className="w-full">Ouvrir dans un nouvel onglet</Button>
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
