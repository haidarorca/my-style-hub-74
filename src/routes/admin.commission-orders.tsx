import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  Briefcase, Phone, MapPin, Search, MessageCircle, Send, Clock, CheckCircle2,
  ChefHat, Truck, PackageCheck, Ban, RotateCcw, Store, CheckCheck, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/hooks/use-i18n";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { buildVendorForwardMessage, type WhatsAppLine } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { Send as SendIcon, X } from "lucide-react";

export const Route = createFileRoute("/admin/commission-orders")({
  component: () => <PermissionGate perm="orders"><CommissionOrders /></PermissionGate>,
});

type OrderStatus =
  | "new" | "confirmed" | "preparing" | "shipped" | "delivered" | "cancelled" | "refunded";

const STATUS_FLOW: OrderStatus[] = [
  "new", "confirmed", "preparing", "shipped", "delivered", "cancelled", "refunded",
];

const STATUS_META: Record<OrderStatus, { label: string; icon: any; cls: string }> = {
  new:       { label: "En attente",  icon: Clock,        cls: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  confirmed: { label: "Confirmée",   icon: CheckCircle2, cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  preparing: { label: "Préparation", icon: ChefHat,      cls: "bg-indigo-500/15 text-indigo-700 border-indigo-500/30" },
  shipped:   { label: "Expédiée",    icon: Truck,        cls: "bg-sky-500/15 text-sky-700 border-sky-500/30" },
  delivered: { label: "Livrée",      icon: PackageCheck, cls: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
  cancelled: { label: "Annulée",     icon: Ban,          cls: "bg-destructive/15 text-destructive border-destructive/30" },
  refunded:  { label: "Remboursée",  icon: RotateCcw,    cls: "bg-muted text-foreground border-border" },
};

const PAGE_SIZE = 20;

function CommissionOrders() {
  const qc = useQueryClient();
  const { lang } = useI18n();
  const localeMap: Record<string, string> = { fr: "fr-FR", en: "en-US", ar: "ar" };
  const locale = localeMap[lang] ?? "fr-FR";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  useEffect(() => { setPage(0); }, [search, statusFilter, vendorFilter]);

  // Vendors that have at least one commission order item
  const { data: vendorsList } = useQuery({
    queryKey: ["admin-commission-orders", "vendors"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: ords } = await supabase
        .from("orders").select("id").eq("is_commission", true).limit(2000);
      const ids = (ords ?? []).map((o: any) => o.id);
      if (ids.length === 0) return [] as { id: string; name: string }[];
      const { data: its } = await supabase
        .from("order_items").select("vendor_id").in("order_id", ids);
      const vIds = Array.from(new Set((its ?? []).map((i: any) => i.vendor_id))).filter(Boolean);
      if (vIds.length === 0) return [];
      const { data: profs } = await supabase
        .from("profiles").select("id, shop_name, full_name").in("id", vIds);
      return (profs ?? [])
        .map((p: any) => ({ id: p.id, name: p.shop_name || p.full_name || "Boutique" }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleOne = (id: string) =>
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearSelection = () => setSelected(new Set());

  const { data: counts } = useQuery({
    queryKey: ["admin-commission-orders", "counts"],
    queryFn: async () => {
      const entries = await Promise.all(
        (["all", ...STATUS_FLOW] as const).map(async (s) => {
          let q = supabase.from("orders").select("id", { count: "exact", head: true }).eq("is_commission", true);
          if (s !== "all") q = q.eq("status", s);
          const { count } = await q;
          return [s, count ?? 0] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, number>;
    },
    staleTime: 15_000,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-commission-orders", "page", { search: search.trim(), statusFilter, vendorFilter, page }],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const q = search.trim();

      // If a vendor is selected, restrict to order_ids that have an item from this vendor
      let restrictIds: string[] | null = null;
      if (vendorFilter !== "all") {
        const { data: vIts } = await supabase
          .from("order_items").select("order_id").eq("vendor_id", vendorFilter);
        restrictIds = Array.from(new Set((vIts ?? []).map((i: any) => i.order_id)));
        if (restrictIds.length === 0) return { orders: [], total: 0 };
      }

      let oq = supabase
        .from("orders")
        .select("id, status, created_at, customer_name, customer_phone, address, city, note, total, forwarded_to_vendor_at", { count: "exact" })
        .eq("is_commission", true)
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") oq = oq.eq("status", statusFilter);
      if (restrictIds) oq = oq.in("id", restrictIds);
      if (q) {
        const esc = q.replace(/[%,()]/g, " ");
        oq = oq.or(`customer_name.ilike.%${esc}%,customer_phone.ilike.%${esc}%,address.ilike.%${esc}%,city.ilike.%${esc}%,id.eq.${/^[0-9a-f-]{8,}$/i.test(q) ? q : "00000000-0000-0000-0000-000000000000"}`);
      }
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data: ords, count, error } = await oq.range(from, to);
      if (error) throw error;
      const ids = (ords ?? []).map((o: any) => o.id);
      if (ids.length === 0) return { orders: [], total: count ?? 0 };

      const { data: items } = await supabase
        .from("order_items")
        .select("*")
        .in("order_id", ids)
        .order("created_at", { ascending: false });

      const vendorIds = Array.from(new Set((items ?? []).map((i: any) => i.vendor_id))).filter(Boolean);
      const { data: vendors } = vendorIds.length
        ? await supabase
            .from("profiles")
            .select("id, shop_name, full_name, shop_whatsapp, phone")
            .in("id", vendorIds)
        : { data: [] as any[] };
      const vendorMap = new Map<string, any>((vendors ?? []).map((v: any) => [v.id, v]));

      const enriched = (ords ?? []).map((o: any) => {
        const oItems = (items ?? []).filter((i: any) => i.order_id === o.id);
        const primaryVendorId = oItems[0]?.vendor_id ?? null;
        const primaryVendor = primaryVendorId ? vendorMap.get(primaryVendorId) : null;
        const primaryVendorName = primaryVendor?.shop_name || primaryVendor?.full_name || "—";
        return { ...o, items: oItems, vendorMap, primaryVendorId, primaryVendorName };
      });

      // Sort: group by vendor name, then by created_at desc within each vendor
      enriched.sort((a: any, b: any) => {
        const n = a.primaryVendorName.localeCompare(b.primaryVendorName);
        if (n !== 0) return n;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      return { orders: enriched, total: count ?? 0 };
    },
  });

  const updateStatus = async (orderId: string, status: OrderStatus) => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
    if (error) return toast.error(error.message);
    toast.success("Statut mis à jour");
    qc.invalidateQueries({ queryKey: ["admin-commission-orders"] });
  };

  const forwardToVendor = async (
    orderId: string,
    vendorId: string,
    vendor: any,
    items: any[],
  ) => {
    const num = (vendor?.shop_whatsapp || vendor?.phone || "").replace(/\D/g, "");
    if (!num) {
      return toast.error("Ce vendeur n'a pas de numéro WhatsApp configuré.");
    }
    const lines: WhatsAppLine[] = items.map((it) => ({
      shopName: vendor?.shop_name || vendor?.full_name || "Boutique",
      code: it.product_code ?? "",
      name: it.product_name,
      size: it.size,
      color: it.color,
      customization: customizationToString(it.customization),
      quantity: it.quantity,
      unitPrice: Number(it.unit_price),
    }));
    const msg = buildVendorForwardMessage(orderId.slice(0, 8), lines);
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank");

    await supabase.from("orders").update({ forwarded_to_vendor_at: new Date().toISOString() }).eq("id", orderId);
    qc.invalidateQueries({ queryKey: ["admin-commission-orders"] });
    void vendorId;
  };

  const orders = data?.orders ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const sendGroupedForSelection = async () => {
    const picked = orders.filter((o: any) => selected.has(o.id));
    if (picked.length === 0) return;
    // Group items per vendor across all selected orders
    const byVendor = new Map<string, { vendor: any; entries: Array<{ orderId: string; items: any[] }> }>();
    for (const o of picked) {
      for (const it of o.items as any[]) {
        const v = o.vendorMap.get(it.vendor_id);
        if (!byVendor.has(it.vendor_id)) byVendor.set(it.vendor_id, { vendor: v, entries: [] });
        const bucket = byVendor.get(it.vendor_id)!;
        let entry = bucket.entries.find((e) => e.orderId === o.id);
        if (!entry) { entry = { orderId: o.id, items: [] }; bucket.entries.push(entry); }
        entry.items.push(it);
      }
    }
    const missing: string[] = [];
    const orderIdsToMark = new Set<string>();
    for (const [, { vendor, entries }] of byVendor) {
      const num = (vendor?.shop_whatsapp || vendor?.phone || "").replace(/\D/g, "");
      if (!num) { missing.push(vendor?.shop_name || vendor?.full_name || "Boutique"); continue; }
      // Build cumulative message: one section per order
      const fmt = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;
      let msg = `📦 *${entries.length} commande${entries.length > 1 ? "s" : ""} à préparer*\n`;
      msg += `_(commandes plateforme — infos client gérées par l'admin)_\n\n`;
      let grand = 0;
      for (const e of entries) {
        const lines: WhatsAppLine[] = e.items.map((it) => ({
          shopName: vendor?.shop_name || "Boutique",
          code: it.product_code ?? "",
          name: it.product_name,
          size: it.size, color: it.color,
          customization: customizationToString(it.customization),
          quantity: it.quantity,
          unitPrice: Number(it.unit_price),
        }));
        const sub = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
        grand += sub;
        msg += `━━━━━━━━━━━━━━\n*N° ${e.orderId.slice(0, 8)}*\n`;
        for (const l of lines) {
          msg += `\n• Code : ${l.code}\n  Article : ${l.name}\n`;
          if (l.size) msg += `  Taille : ${l.size}\n`;
          if (l.color) msg += `  Couleur : ${l.color}\n`;
          if (l.customization) msg += `  Personnalisation : ${l.customization}\n`;
          msg += `  Quantité : ${l.quantity}\n  Prix unitaire : ${fmt(l.unitPrice)}\n`;
        }
        msg += `\nSous-total commande : ${fmt(sub)}\n\n`;
        orderIdsToMark.add(e.orderId);
      }
      msg += `━━━━━━━━━━━━━━\n💰 *TOTAL À PRÉPARER : ${fmt(grand)}*\n\nMerci de préparer ces commandes. La livraison est gérée par la plateforme.`;
      window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank");
    }
    if (orderIdsToMark.size > 0) {
      await supabase.from("orders")
        .update({ forwarded_to_vendor_at: new Date().toISOString() })
        .in("id", Array.from(orderIdsToMark));
    }
    if (missing.length > 0) {
      toast.warning(`WhatsApp manquant pour : ${missing.join(", ")}`);
    } else {
      toast.success(`Envoi groupé préparé pour ${byVendor.size} vendeur${byVendor.size > 1 ? "s" : ""}.`);
    }
    clearSelection();
    qc.invalidateQueries({ queryKey: ["admin-commission-orders"] });
    // silence unused import warnings if any
    void buildVendorForwardMessage;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Briefcase className="h-5 w-5 text-primary" /> Commandes commission
        </h1>
        <span className="text-xs text-muted-foreground">
          {total} résultat{total > 1 ? "s" : ""}{isFetching && !isLoading ? " · …" : ""}
        </span>
      </div>

      <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-foreground">
        Ces commandes proviennent de vendeurs <strong>avec commission</strong>. Vous traitez le client et transmettez la préparation au vendeur par WhatsApp (sans partager les coordonnées du client).
      </p>

      {selected.size > 0 && (
        <div className="sticky top-2 z-30 flex flex-wrap items-center gap-2 rounded-xl border bg-primary/10 px-3 py-2 shadow-md backdrop-blur">
          <span className="text-sm font-semibold text-primary">
            {selected.size} sélectionnée{selected.size > 1 ? "s" : ""}
          </span>
          <Button asChild size="sm" className="ml-auto gap-1">
            <Link to="/admin/preparation" search={{ ids: Array.from(selected).join(",") }}>
              <ClipboardList className="h-4 w-4" /> Préparation groupée
            </Link>
          </Button>
          <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={sendGroupedForSelection}>
            <SendIcon className="h-4 w-4" /> Envoyer aux vendeurs
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher client, téléphone, ville, n° commande…"
            className="pl-8"
          />
        </div>
        <Select value={vendorFilter} onValueChange={setVendorFilter}>
          <SelectTrigger className="sm:w-[220px]">
            <Store className="h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="Tous les vendeurs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les vendeurs</SelectItem>
            {(vendorsList ?? []).map((v) => (
              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="-mx-3 overflow-x-auto px-3">
        <div className="flex gap-2">
          {(["all", ...STATUS_FLOW] as const).map((s) => {
            const meta = s === "all" ? null : STATUS_META[s];
            const active = statusFilter === s;
            const n = counts?.[s] ?? 0;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent",
                )}
              >
                {meta ? <meta.icon className="h-3.5 w-3.5" /> : <Briefcase className="h-3.5 w-3.5" />}
                {s === "all" ? "Toutes" : meta!.label}
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", active ? "bg-primary-foreground/20" : "bg-muted")}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          <Briefcase className="mx-auto mb-2 h-8 w-8 opacity-50" />
          Aucune commande commission dans cette catégorie.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={orders.length > 0 && orders.every((o: any) => selected.has(o.id))}
                onCheckedChange={(c) => {
                  if (c) setSelected((s) => { const n = new Set(s); orders.forEach((o: any) => n.add(o.id)); return n; });
                  else setSelected((s) => { const n = new Set(s); orders.forEach((o: any) => n.delete(o.id)); return n; });
                }}
              />
              <span className="text-muted-foreground">Tout sélectionner sur cette page</span>
            </label>
            {selected.size > 0 && (
              <button onClick={clearSelection} className="text-muted-foreground hover:text-foreground">
                <X className="inline h-3 w-3" /> Effacer ({selected.size})
              </button>
            )}
          </div>
        <ul className="space-y-4">
          {orders.map((o: any) => {
            const meta = STATUS_META[o.status as OrderStatus] ?? STATUS_META.new;
            const waClient = (o.customer_phone ?? "").replace(/\D/g, "");
            const itemsByVendor = new Map<string, any[]>();
            for (const it of o.items) {
              if (!itemsByVendor.has(it.vendor_id)) itemsByVendor.set(it.vendor_id, []);
              itemsByVendor.get(it.vendor_id)!.push(it);
            }
            const isSel = selected.has(o.id);
            return (
              <li key={o.id} className={cn("overflow-hidden rounded-xl border bg-card shadow-sm", isSel && "ring-2 ring-primary")}>
                <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-accent/30 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Checkbox checked={isSel} onCheckedChange={() => toggleOne(o.id)} aria-label="Sélectionner" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold">Commande #{o.id.slice(0, 8)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(o.created_at).toLocaleString(locale)}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {o.forwarded_to_vendor_at && (
                      <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 text-[10px]">
                        <CheckCheck className="h-3 w-3" />
                        Envoyée
                      </Badge>
                    )}
                    <Badge variant="outline" className={cn("gap-1 border", meta.cls)}>
                      <meta.icon className="h-3 w-3" /> {meta.label}
                    </Badge>
                    <Select value={o.status} onValueChange={(v) => updateStatus(o.id, v as OrderStatus)}>
                      <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue /></SelectTrigger>
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

                {Array.from(itemsByVendor.entries()).map(([vendorId, items]) => {
                  const vendor = o.vendorMap.get(vendorId);
                  const subTotal = items.reduce((s: number, i: any) => s + Number(i.unit_price) * i.quantity, 0);
                  return (
                    <div key={vendorId} className="border-b last:border-0">
                      <div className="flex items-center justify-between gap-2 bg-accent/20 px-3 py-1.5 text-xs">
                        <span className="inline-flex items-center gap-1 font-semibold">
                          <Store className="h-3 w-3 text-primary" />
                          {vendor?.shop_name || vendor?.full_name || "Boutique"}
                        </span>
                        <Button
                          size="sm"
                          className="h-7 gap-1 bg-emerald-600 px-2 text-[11px] text-white hover:bg-emerald-700"
                          onClick={() => forwardToVendor(o.id, vendorId, vendor, items)}
                        >
                          <Send className="h-3 w-3" /> Envoyer au vendeur
                        </Button>
                      </div>
                      <ul>
                        {items.map((it: any) => {
                          const c = it.customization || {};
                          return (
                            <li key={it.id} className="flex gap-3 p-3">
                              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                                {it.product_image_url && (
                                  <img src={it.product_image_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1 space-y-0.5 text-xs">
                                <div className="font-semibold">{it.product_name}</div>
                                <div className="text-muted-foreground">
                                  Code {it.product_code} · Qté {it.quantity} ·{" "}
                                  {Number(it.unit_price).toLocaleString(locale)} FCFA
                                </div>
                                {(it.size || it.color) && (
                                  <div className="text-muted-foreground">
                                    {it.size && <>Taille : {it.size}</>}
                                    {it.size && it.color && " · "}
                                    {it.color && <>Couleur : {it.color}</>}
                                  </div>
                                )}
                                {Number(it.commission_amount) > 0 && (
                                  <div className="text-primary">
                                    Commission : {Number(it.commission_amount).toLocaleString(locale)} FCFA
                                  </div>
                                )}
                                {(c.text || c.image_url) && (
                                  <div className="mt-1 rounded border border-primary/30 bg-primary/5 p-1.5 text-[11px]">
                                    {c.text && <div>Texte : <span className="font-medium">{c.text}</span></div>}
                                    {c.image_url && (
                                      <a href={c.image_url} target="_blank" rel="noreferrer" className="text-primary underline">
                                        Voir image
                                      </a>
                                    )}
                                  </div>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="flex items-center justify-between border-t bg-muted/10 px-3 py-1.5 text-[11px]">
                        <span className="text-muted-foreground">Sous-total boutique</span>
                        <span className="font-semibold">{subTotal.toLocaleString(locale)} FCFA</span>
                      </div>
                    </div>
                  );
                })}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/10 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Total commande</span>
                  <span className="font-bold text-primary">
                    {Number(o.total).toLocaleString(locale)} FCFA
                  </span>
                </div>

                {waClient && (
                  <a
                    href={`https://wa.me/${waClient}?text=${encodeURIComponent(`Bonjour ${o.customer_name ?? ""}, à propos de votre commande #${o.id.slice(0, 8)}.`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 border-t bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20"
                  >
                    <MessageCircle className="h-4 w-4" /> Contacter le client sur WhatsApp
                  </a>
                )}

                {o.forwarded_to_vendor_at && (
                  <div className="border-t bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
                    Envoyée au vendeur le {new Date(o.forwarded_to_vendor_at).toLocaleString(locale)}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        </>
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
    </div>
  );
}

function customizationToString(c: any): string | null {
  if (!c) return null;
  const parts: string[] = [];
  if (c.text) parts.push(`texte « ${c.text} »`);
  if (c.font) parts.push(`police ${c.font}`);
  if (c.color) parts.push(`couleur ${c.color}`);
  if (c.image_url) parts.push("image fournie");
  return parts.length ? parts.join(", ") : null;
}
