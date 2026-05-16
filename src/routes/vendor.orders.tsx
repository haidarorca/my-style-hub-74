import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Package, ImageIcon, Phone, MapPin, Search, MessageCircle, Clock, CheckCircle2,
  ChefHat, Truck, PackageCheck, Ban, RotateCcw, History,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/vendor/orders")({
  component: VendorOrders,
});

type OrderStatus =
  | "new" | "confirmed" | "preparing" | "shipped" | "delivered" | "cancelled" | "refunded";

const STATUS_FLOW: OrderStatus[] = [
  "new", "confirmed", "preparing", "shipped", "delivered", "cancelled", "refunded",
];

const STATUS_META: Record<OrderStatus, { label: string; icon: any; cls: string; dot: string }> = {
  new:       { label: "En attente",  icon: Clock,        cls: "bg-amber-500/15 text-amber-700 border-amber-500/30",    dot: "bg-amber-500" },
  confirmed: { label: "Confirmée",   icon: CheckCircle2, cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30", dot: "bg-emerald-500" },
  preparing: { label: "Préparation", icon: ChefHat,      cls: "bg-indigo-500/15 text-indigo-700 border-indigo-500/30",  dot: "bg-indigo-500" },
  shipped:   { label: "Expédiée",    icon: Truck,        cls: "bg-sky-500/15 text-sky-700 border-sky-500/30",            dot: "bg-sky-500" },
  delivered: { label: "Livrée",      icon: PackageCheck, cls: "bg-blue-500/15 text-blue-700 border-blue-500/30",         dot: "bg-blue-500" },
  cancelled: { label: "Annulée",     icon: Ban,          cls: "bg-destructive/15 text-destructive border-destructive/30",dot: "bg-destructive" },
  refunded:  { label: "Remboursée",  icon: RotateCcw,    cls: "bg-muted text-foreground border-border",                  dot: "bg-muted-foreground" },
};

function PAGE_SIZE() { return 20; }

function VendorOrders() {
  const { user, isAdmin } = useAuth();
  const { lang } = useI18n();
  const qc = useQueryClient();
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const [historyOrderId, setHistoryOrderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [page, setPage] = useState(0);
  const localeMap: Record<string, string> = { fr: "fr-FR", en: "en-US", ar: "ar" };
  const locale = localeMap[lang] ?? "fr-FR";

  useEffect(() => { setPage(0); }, [search, statusFilter]);

  // Counts per status (HEAD requests, scoped to vendor via orders join)
  const { data: counts } = useQuery({
    queryKey: ["vendor-orders", "counts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: itemRows } = await supabase
        .from("order_items").select("order_id").eq("vendor_id", user!.id);
      const ids = Array.from(new Set((itemRows ?? []).map((r: any) => r.order_id)));
      if (ids.length === 0) return { all: 0 } as Record<string, number>;
      const entries = await Promise.all(
        (["all", ...STATUS_FLOW] as const).map(async (s) => {
          let q = supabase.from("orders").select("id", { count: "exact", head: true }).in("id", ids);
          if (s !== "all") q = q.eq("status", s);
          const { count } = await q;
          return [s, count ?? 0] as const;
        })
      );
      return Object.fromEntries(entries) as Record<string, number>;
    },
    staleTime: 15_000,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["vendor-orders", "page", user?.id, { search: search.trim(), statusFilter, page }],
    enabled: !!user,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      // 1) Vendor's order ids
      const { data: itemRows, error: e1 } = await supabase
        .from("order_items").select("order_id").eq("vendor_id", user!.id);
      if (e1) throw e1;
      const orderIds = Array.from(new Set((itemRows ?? []).map((r: any) => r.order_id)));
      if (orderIds.length === 0) return { orders: [], total: 0 };

      // 2) Paginated orders query
      const q = search.trim();
      let oq = supabase
        .from("orders")
        .select("id, status, created_at, customer_name, customer_phone, address, city, note, total", { count: "exact" })
        .in("id", orderIds)
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") oq = oq.eq("status", statusFilter);
      if (q) {
        const esc = q.replace(/[%,()]/g, " ");
        oq = oq.or(`customer_name.ilike.%${esc}%,customer_phone.ilike.%${esc}%,address.ilike.%${esc}%,city.ilike.%${esc}%,id.eq.${/^[0-9a-f-]{8,}$/i.test(q) ? q : "00000000-0000-0000-0000-000000000000"}`);
      }
      const from = page * PAGE_SIZE();
      const to = from + PAGE_SIZE() - 1;
      const { data: ords, count, error: e2 } = await oq.range(from, to);
      if (e2) throw e2;

      const pageIds = (ords ?? []).map((o: any) => o.id);
      if (pageIds.length === 0) return { orders: [], total: count ?? 0 };

      const { data: items } = await supabase
        .from("order_items")
        .select("*")
        .eq("vendor_id", user!.id)
        .in("order_id", pageIds)
        .order("created_at", { ascending: false });

      return {
        orders: (ords ?? []).map((o: any) => ({
          ...o,
          items: (items ?? []).filter((i: any) => i.order_id === o.id),
        })),
        total: count ?? 0,
      };
    },
  });

  const updateStatus = async (orderId: string, status: OrderStatus) => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
    if (error) return toast.error(error.message);
    toast.success("Statut mis à jour");
    qc.invalidateQueries({ queryKey: ["vendor-orders"] });
  };

  const orders = data?.orders ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE()));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Mes commandes</h1>
        <span className="text-xs text-muted-foreground">{total} résultat{total > 1 ? "s" : ""}{isFetching && !isLoading ? " · …" : ""}</span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher client, téléphone, ville…"
          className="pl-8"
        />
      </div>

      {/* Status filter chips (scrollable) */}
      <div className="-mx-3 overflow-x-auto px-3">
        <div className="flex gap-2">
          {(["all", ...STATUS_FLOW] as const).map((s) => {
            const meta = s === "all" ? null : STATUS_META[s];
            const active = statusFilter === s;
            const n = counts?.[s] ?? 0;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s as any)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent"
                )}
              >
                {meta ? <meta.icon className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
                {s === "all" ? "Toutes" : meta!.label}
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  active ? "bg-primary-foreground/20" : "bg-muted"
                )}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
          Aucune commande dans cette catégorie.
        </div>
      ) : (
        <ul className="space-y-4">
          {orders.map((o: any) => {
            const meta = STATUS_META[o.status as OrderStatus] ?? STATUS_META.new;
            const myItemsTotal = o.items.reduce(
              (s: number, i: any) => s + Number(i.unit_price) * i.quantity, 0,
            );
            const waNum = (o.customer_phone ?? "").replace(/\D/g, "");
            const waText = encodeURIComponent(`Bonjour ${o.customer_name ?? ""}, à propos de votre commande #${o.id.slice(0, 8)}.`);
            return (
              <li key={o.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-accent/30 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold">Commande #{o.id.slice(0, 8)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(o.created_at).toLocaleString(locale)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={cn("gap-1 border", meta.cls)}>
                      <meta.icon className="h-3 w-3" />{meta.label}
                    </Badge>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setHistoryOrderId(o.id)} aria-label="Historique">
                      <History className="h-3.5 w-3.5" />
                    </Button>
                    <Select value={o.status} onValueChange={(v) => updateStatus(o.id, v as OrderStatus)}>
                      <SelectTrigger className="h-7 w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_FLOW.map((v) => (
                          <SelectItem key={v} value={v}>{STATUS_META[v].label}</SelectItem>
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
                            {Number(it.unit_price).toLocaleString(locale)} FCFA
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
                                      <span className="inline-block h-3 w-3 rounded-full border" style={{ backgroundColor: c.color }} />
                                      <span className="font-mono">{c.color}</span>
                                    </div>
                                  )}
                                  <div className="mt-1 rounded bg-background p-2 text-base"
                                       style={{ fontFamily: c.font || undefined, color: c.color || undefined }}>
                                    {c.text}
                                  </div>
                                </div>
                              )}
                              {c.image_url && (
                                <div className="mt-2">
                                  <button onClick={() => setZoomImg(c.image_url)}
                                          className="group relative block h-24 w-24 overflow-hidden rounded border bg-muted">
                                    <img src={c.image_url} alt="" className="h-full w-full object-contain" />
                                    <span className="absolute inset-0 hidden items-center justify-center bg-black/40 text-white group-hover:flex">
                                      <ImageIcon className="h-4 w-4" />
                                    </span>
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/10 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">
                    {isAdmin ? "Total commande" : "Sous-total mes articles"}
                  </span>
                  <span className="font-bold text-primary">
                    {(isAdmin ? Number(o.total) : myItemsTotal).toLocaleString(locale)} FCFA
                  </span>
                </div>

                {waNum && (
                  <a href={`https://wa.me/${waNum}?text=${waText}`} target="_blank" rel="noreferrer"
                     className="flex items-center justify-center gap-2 border-t bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20">
                    <MessageCircle className="h-4 w-4" /> Contacter le client sur WhatsApp
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">Page {page + 1} / {totalPages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Préc.</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Suiv.</Button>
          </div>
        </div>
      )}

      {/* Status history dialog */}
      <Dialog open={!!historyOrderId} onOpenChange={(o) => !o && setHistoryOrderId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Historique des statuts</DialogTitle>
          </DialogHeader>
          {historyOrderId && <StatusHistory orderId={historyOrderId} locale={locale} />}
        </DialogContent>
      </Dialog>

      {/* Image zoom */}
      <Dialog open={!!zoomImg} onOpenChange={(o) => !o && setZoomImg(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Aperçu</DialogTitle></DialogHeader>
          {zoomImg && (
            <div className="space-y-3">
              <img src={zoomImg} alt="" className="max-h-[70vh] w-full object-contain" />
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

function StatusHistory({ orderId, locale }: { orderId: string; locale: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["order-status-history", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_status_history")
        .select("id, from_status, to_status, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">Aucun historique.</p>;
  return (
    <ol className="relative space-y-3 border-l pl-4">
      {data.map((h: any) => {
        const meta = STATUS_META[h.to_status as OrderStatus] ?? STATUS_META.new;
        return (
          <li key={h.id} className="relative">
            <span className={cn("absolute -left-[22px] top-1 h-3 w-3 rounded-full ring-2 ring-background", meta.dot)} />
            <div className="text-sm font-semibold">{meta.label}</div>
            <div className="text-xs text-muted-foreground">
              {h.from_status ? `Depuis ${STATUS_META[h.from_status as OrderStatus]?.label ?? h.from_status} · ` : ""}
              {new Date(h.created_at).toLocaleString(locale)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
