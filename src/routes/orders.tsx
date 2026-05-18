import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Package,
  MapPin,
  ShoppingBag,
  Clock,
  CheckCircle2,
  PackageCheck,
  Truck,
  Home,
  XCircle,
  RefreshCcw,
  MessageCircle,
  Phone,
  Star,
  ChevronRight,
  ExternalLink,
  StickyNote,
  X,
  Flag,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { cn } from "@/lib/utils";
import { ReviewDialog } from "@/components/orders/ReviewDialog";
import { ReportDialog } from "@/components/orders/ReportDialog";
import { ContactActions } from "@/components/support/ContactActions";

export const Route = createFileRoute("/orders")({
  component: OrdersPage,
});

type StatusKey =
  | "new"
  | "confirmed"
  | "preparing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

const STATUS_META: Record<
  StatusKey,
  { label: string; short: string; icon: any; tone: string; dot: string }
> = {
  new:        { label: "En attente",   short: "En attente", icon: Clock,        tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20", dot: "bg-amber-500" },
  confirmed:  { label: "Confirmée",    short: "Confirmée",  icon: CheckCircle2, tone: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",     dot: "bg-blue-500" },
  preparing:  { label: "Préparation",  short: "Prépa.",     icon: PackageCheck, tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20", dot: "bg-violet-500" },
  shipped:    { label: "Expédiée",     short: "Expédiée",   icon: Truck,        tone: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20",     dot: "bg-cyan-500" },
  delivered:  { label: "Livrée",       short: "Livrée",     icon: Home,         tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20", dot: "bg-emerald-500" },
  cancelled:  { label: "Annulée",      short: "Annulée",    icon: XCircle,      tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",     dot: "bg-rose-500" },
  refunded:   { label: "Remboursée",   short: "Rembour.",   icon: RefreshCcw,   tone: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20", dot: "bg-slate-500" },
};

const TIMELINE: StatusKey[] = ["new", "confirmed", "preparing", "shipped", "delivered"];

const normalizeStatus = (s: string): StatusKey => {
  const k = (s ?? "").toLowerCase();
  if (k in STATUS_META) return k as StatusKey;
  if (k === "pending") return "new";
  if (k === "processing") return "preparing";
  if (k === "shipped_out") return "shipped";
  return "new";
};

const fmtFcfa = (n: number) =>
  `${Math.round(Number(n) || 0).toLocaleString("fr-FR")} FCFA`;

const cleanPhone = (p: string) => p.replace(/[^\d+]/g, "").replace(/^00/, "+");

function StatusPill({ status, size = "sm" }: { status: StatusKey; size?: "sm" | "md" }) {
  const m = STATUS_META[status];
  const Icon = m.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold",
        m.tone,
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
      )}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {m.short}
    </span>
  );
}

function Timeline({ status }: { status: StatusKey }) {
  if (status === "cancelled" || status === "refunded") {
    const m = STATUS_META[status];
    const Icon = m.icon;
    return (
      <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium", m.tone)}>
        <Icon className="h-4 w-4" />
        Commande {m.label.toLowerCase()}
      </div>
    );
  }
  const currentIdx = TIMELINE.indexOf(status);
  return (
    <div className="flex items-center gap-1">
      {TIMELINE.map((s, i) => {
        const m = STATUS_META[s];
        const Icon = m.icon;
        const done = i <= currentIdx;
        const active = i === currentIdx;
        return (
          <div key={s} className="flex flex-1 items-center gap-1">
            <div className="flex flex-1 flex-col items-center gap-1">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border-2 transition",
                  done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground",
                  active && "ring-2 ring-primary/30",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <span className={cn("text-[9px] leading-tight", done ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {m.short}
              </span>
            </div>
            {i < TIMELINE.length - 1 && (
              <div className={cn("h-0.5 flex-1 rounded -mt-4", i < currentIdx ? "bg-primary" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const FILTERS: { key: "all" | StatusKey; label: string }[] = [
  { key: "all", label: "Toutes" },
  { key: "new", label: "En attente" },
  { key: "confirmed", label: "Confirmées" },
  { key: "preparing", label: "Préparation" },
  { key: "shipped", label: "Expédiées" },
  { key: "delivered", label: "Livrées" },
  { key: "cancelled", label: "Annulées" },
  { key: "refunded", label: "Remboursées" },
];

function OrdersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const settings = useSiteSettings();
  const [filter, setFilter] = useState<"all" | StatusKey>("all");
  const [openOrder, setOpenOrder] = useState<any | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    null | { kind: "cancel" | "received"; orderId: string }
  >(null);
  const [reviewTarget, setReviewTarget] = useState<null | { productId: string; productName: string; orderId: string }>(null);
  const [reportTarget, setReportTarget] = useState<
    null
    | { type: "product"; productId: string; orderId: string; name: string }
    | { type: "vendor"; vendorId: string; orderId: string; name: string }
  >(null);

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
      const vendorIds = Array.from(new Set((items ?? []).map((i: any) => i.vendor_id))).filter(Boolean);
      const vendorsMap = new Map<string, any>();
      if (vendorIds.length > 0) {
        const { data: vendors } = await supabase
          .from("profiles")
          .select("id, shop_name, full_name, shop_whatsapp, phone, hide_contact_publicly, shop_logo_url")
          .in("id", vendorIds as string[]);
        (vendors ?? []).forEach((v: any) => vendorsMap.set(v.id, v));
      }
      return (ords ?? []).map((o: any) => {
        const myItems = (items ?? []).filter((i: any) => i.order_id === o.id);
        const itemsWithVendor = myItems.map((it: any) => ({
          ...it,
          vendor: vendorsMap.get(it.vendor_id) ?? null,
        }));
        const commission = itemsWithVendor.reduce(
          (s: number, it: any) => s + Number(it.commission_amount ?? 0),
          0,
        );
        return { ...o, items: itemsWithVendor, _commission: commission };
      });
    },
  });

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: 0 };
    (orders ?? []).forEach((o: any) => {
      const s = normalizeStatus(o.status);
      map.all++;
      map[s] = (map[s] ?? 0) + 1;
    });
    return map;
  }, [orders]);

  const filtered = useMemo(() => {
    if (!orders) return [];
    if (filter === "all") return orders;
    return orders.filter((o: any) => normalizeStatus(o.status) === filter);
  }, [orders, filter]);

  const updateStatus = async (orderId: string, status: string) => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
    if (error) {
      toast.error(error.message);
      return false;
    }
    qc.invalidateQueries({ queryKey: ["my-orders"] });
    setOpenOrder((prev: any) => (prev && prev.id === orderId ? { ...prev, status } : prev));
    return true;
  };

  const handleCancel = async () => {
    if (!confirmAction) return;
    const ok = await updateStatus(confirmAction.orderId, "cancelled");
    if (ok) toast.success("Commande annulée");
    setConfirmAction(null);
  };
  const handleConfirmReceived = async () => {
    if (!confirmAction) return;
    const ok = await updateStatus(confirmAction.orderId, "delivered");
    if (ok) toast.success("Réception confirmée. Merci !");
    setConfirmAction(null);
  };

  const buildWa = (phone: string, orderId: string, vendorName?: string) => {
    const clean = cleanPhone(phone);
    const msg = encodeURIComponent(
      `Bonjour${vendorName ? ` ${vendorName}` : ""}, je vous contacte au sujet de ma commande #${orderId.slice(0, 8)}.`,
    );
    return `https://wa.me/${clean.replace("+", "")}?text=${msg}`;
  };

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
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-[var(--page-px)] py-3">
        <BackButton fallbackTo="/" />
        <div className="mb-3 mt-2 flex items-end justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold leading-tight">Mes commandes</h1>
            <p className="text-xs text-muted-foreground">
              {counts.all ?? 0} commande{(counts.all ?? 0) > 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Filtres scrollables */}
        <div className="-mx-[var(--page-px)] mb-3 overflow-x-auto px-[var(--page-px)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-2 pb-1">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              const n = counts[f.key] ?? 0;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-soft"
                      : "border-border bg-card text-foreground hover:bg-accent",
                  )}
                >
                  {f.label}
                  {n > 0 && (
                    <span
                      className={cn(
                        "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                        active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : !filtered || filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
            <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-60" />
            <p className="text-sm font-semibold">Aucune commande</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {filter === "all"
                ? "Vous n'avez pas encore passé commande."
                : "Aucune commande dans cette catégorie."}
            </p>
            {filter === "all" && (
              <Link to="/">
                <Button className="mt-4 rounded-full" size="sm">
                  Découvrir les produits
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((o: any) => {
              const status = normalizeStatus(o.status);
              const firstItem = o.items[0];
              const extra = o.items.length - 1;
              return (
                <li key={o.id}>
                  <button
                    onClick={() => setOpenOrder(o)}
                    className="group block w-full overflow-hidden rounded-2xl border bg-card text-left shadow-soft transition hover:border-primary/40 hover:shadow-md active:scale-[0.995]"
                  >
                    <div className="flex items-center justify-between gap-2 border-b bg-gradient-to-r from-accent/40 to-transparent px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-[11px] font-mono text-muted-foreground">
                          #{o.id.slice(0, 8).toUpperCase()}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(o.created_at).toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      </div>
                      <StatusPill status={status} />
                    </div>

                    <div className="flex items-center gap-3 p-3">
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border">
                        {firstItem?.product_image_url ? (
                          <img
                            src={firstItem.product_image_url}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Package className="m-auto mt-5 h-6 w-6 text-muted-foreground" />
                        )}
                        {extra > 0 && (
                          <span className="absolute bottom-0 right-0 rounded-tl-md bg-foreground/85 px-1.5 py-0.5 text-[10px] font-bold text-background">
                            +{extra}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-sm font-semibold">
                          {firstItem?.product_name ?? "Produit"}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {o.items.reduce((s: number, i: any) => s + i.quantity, 0)} article(s)
                        </div>
                        <div className="mt-1 text-sm font-bold text-primary">
                          {fmtFcfa(o.total)}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {/* Détail commande */}
      <Sheet open={!!openOrder} onOpenChange={(v) => !v && setOpenOrder(null)}>
        <SheetContent side="bottom" className="h-[92vh] overflow-y-auto rounded-t-2xl p-0 sm:max-w-2xl sm:mx-auto">
          {openOrder && (() => {
            const status = normalizeStatus(openOrder.status);
            const canCancel = status === "new" || status === "confirmed";
            const canConfirmReceipt = status === "shipped";
            const canReview = status === "delivered";
            const subTotal = openOrder.items.reduce(
              (s: number, i: any) => s + Number(i.unit_price) * i.quantity,
              0,
            );
            const vendorWa = (v: any) => {
              if (!v) return "";
              if (v.hide_contact_publicly) return "";
              return (v.shop_whatsapp as string) || (v.phone as string) || "";
            };
            const supportWa = settings?.whatsapp_number || "";
            const uniqueVendors = Array.from(
              new Map(openOrder.items.map((i: any) => [i.vendor_id, i.vendor])).values(),
            ).filter(Boolean);

            return (
              <>
                <SheetHeader className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 backdrop-blur">
                  <div className="flex items-center justify-between">
                    <SheetTitle className="text-left text-base">
                      Commande #{openOrder.id.slice(0, 8).toUpperCase()}
                    </SheetTitle>
                    <button onClick={() => setOpenOrder(null)} className="rounded-full p-1 hover:bg-accent">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(openOrder.created_at).toLocaleString("fr-FR")}
                    </span>
                    <StatusPill status={status} size="md" />
                  </div>
                </SheetHeader>

                <div className="space-y-4 px-4 pb-8 pt-4">
                  {/* Timeline */}
                  <section className="rounded-xl border bg-card p-3">
                    <Timeline status={status} />
                  </section>

                  {/* Actions rapides */}
                  <section className="grid grid-cols-2 gap-2">
                    {canConfirmReceipt && (
                      <Button
                        onClick={() => setConfirmAction({ kind: "received", orderId: openOrder.id })}
                        className="col-span-2 rounded-xl"
                      >
                        <Home className="mr-1.5 h-4 w-4" /> Confirmer la réception
                      </Button>
                    )}
                    {/* Avis et signalements visibles UNIQUEMENT après livraison, par article */}
                    {canCancel && (
                      <Button
                        variant="outline"
                        onClick={() => setConfirmAction({ kind: "cancel", orderId: openOrder.id })}
                        className="rounded-xl border-rose-500/40 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700"
                      >
                        <XCircle className="mr-1.5 h-4 w-4" /> Annuler
                      </Button>
                    )}
                    <div className={cn("col-span-2 flex flex-wrap gap-2")}>
                      <ContactActions
                        vendorId={openOrder.items[0]?.vendor_id ?? ""}
                        orderId={openOrder.id}
                        productName={`Commande #${openOrder.id.slice(0, 8)}`}
                      />
                    </div>
                  </section>

                  {/* Articles groupés par vendeur */}
                  <section className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Articles ({openOrder.items.length})
                    </h3>
                    {uniqueVendors.map((v: any) => {
                      const vendorItems = openOrder.items.filter((i: any) => i.vendor_id === v.id);
                      return (
                        <div key={v.id} className="overflow-hidden rounded-xl border bg-card">
                          <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                            <Link
                              to="/shop/$vendorId"
                              params={{ vendorId: v.id }}
                              className="flex min-w-0 items-center gap-2 hover:text-primary"
                            >
                              <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-background ring-1 ring-border">
                                {v.shop_logo_url ? (
                                  <img src={v.shop_logo_url} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-muted-foreground">
                                    {(v.shop_name ?? v.full_name ?? "?")[0]?.toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-xs font-semibold">
                                  {v.shop_name ?? v.full_name ?? "Boutique"}
                                </div>
                                <div className="text-[10px] text-muted-foreground">Voir la boutique</div>
                              </div>
                              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                            </Link>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <ContactActions vendorId={v.id} orderId={openOrder.id} productName={v.shop_name ?? "Boutique"} className="flex flex-wrap gap-1" />
                              {canReview && (
                                <button
                                  onClick={() =>
                                    setReportTarget({
                                      type: "vendor",
                                      vendorId: v.id,
                                      orderId: openOrder.id,
                                      name: v.shop_name ?? v.full_name ?? "Boutique",
                                    })
                                  }
                                  className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"
                                  title="Signaler ce vendeur"
                                >
                                  <Flag className="h-3 w-3" /> Signaler
                                </button>
                              )}
                            </div>
                          </div>
                          <ul>
                            {vendorItems.map((it: any) => (
                              <li key={it.id} className="flex gap-3 border-b p-3 last:border-0">
                                <Link
                                  to="/product/$productId"
                                  params={{ productId: it.product_id }}
                                  className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border"
                                >
                                  {it.product_image_url ? (
                                    <img src={it.product_image_url} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <Package className="m-auto mt-5 h-6 w-6 text-muted-foreground" />
                                  )}
                                </Link>
                                <div className="min-w-0 flex-1">
                                  <Link
                                    to="/product/$productId"
                                    params={{ productId: it.product_id }}
                                    className="line-clamp-2 text-sm font-semibold hover:text-primary"
                                  >
                                    {it.product_name}
                                  </Link>
                                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                                    Réf. {it.product_code}
                                  </div>
                                  {(it.size || it.color) && (
                                    <div className="mt-0.5 flex flex-wrap gap-1">
                                      {it.size && (
                                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                                          Taille : {it.size}
                                        </span>
                                      )}
                                      {it.color && (
                                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                                          {it.color}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  <div className="mt-1 flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground">
                                      × {it.quantity}
                                    </span>
                                    <span className="text-sm font-bold">
                                      {fmtFcfa(Number(it.unit_price) * it.quantity)}
                                    </span>
                                  </div>
                                  {canReview && (
                                    <div className="mt-2 flex gap-1.5">
                                      <button
                                        onClick={() =>
                                          setReviewTarget({
                                            productId: it.product_id,
                                            productName: it.product_name,
                                            orderId: openOrder.id,
                                          })
                                        }
                                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
                                      >
                                        <Star className="h-3 w-3" /> Laisser un avis
                                      </button>
                                      <button
                                        onClick={() =>
                                          setReportTarget({
                                            type: "product",
                                            productId: it.product_id,
                                            orderId: openOrder.id,
                                            name: it.product_name,
                                          })
                                        }
                                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:border-rose-500/40 hover:text-rose-600"
                                        title="Signaler ce produit"
                                      >
                                        <Flag className="h-3 w-3" /> Signaler
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </section>

                  {/* Adresse */}
                  <section className="rounded-xl border bg-card p-3">
                    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" /> Livraison
                    </h3>
                    <div className="text-sm font-semibold">{openOrder.customer_name ?? "—"}</div>
                    {openOrder.customer_phone && (
                      <a
                        href={`tel:${openOrder.customer_phone}`}
                        className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                      >
                        <Phone className="h-3 w-3" /> {openOrder.customer_phone}
                      </a>
                    )}
                    {(openOrder.address || openOrder.city) && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {[openOrder.address, openOrder.city].filter(Boolean).join(", ")}
                      </div>
                    )}
                    {openOrder.note && (
                      <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-muted/40 p-2 text-xs italic text-muted-foreground">
                        <StickyNote className="mt-0.5 h-3 w-3 shrink-0" />
                        {openOrder.note}
                      </div>
                    )}
                  </section>

                  {/* Récapitulatif */}
                  <section className="rounded-xl border bg-card p-3">
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Récapitulatif
                    </h3>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Sous-total articles</span>
                        <span>{fmtFcfa(subTotal)}</span>
                      </div>
                      {openOrder._commission > 0 && (
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>dont commission/logistique</span>
                          <span>{fmtFcfa(openOrder._commission)}</span>
                        </div>
                      )}
                      <div className="my-1 h-px bg-border" />
                      <div className="flex items-center justify-between font-bold">
                        <span>Total payé</span>
                        <span className="text-primary">{fmtFcfa(openOrder.total)}</span>
                      </div>
                      <div className="pt-1 text-[11px] text-muted-foreground">
                        Paiement : à la livraison
                      </div>
                    </div>
                  </section>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!confirmAction} onOpenChange={(v) => !v && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.kind === "cancel" ? "Annuler cette commande ?" : "Confirmer la réception ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.kind === "cancel"
                ? "Cette action est définitive. Le vendeur sera notifié."
                : "Confirmez seulement si vous avez bien reçu votre commande. Vous pourrez ensuite laisser un avis."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Retour</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAction?.kind === "cancel" ? handleCancel : handleConfirmReceived}
              className={confirmAction?.kind === "cancel" ? "bg-rose-600 hover:bg-rose-700" : ""}
            >
              {confirmAction?.kind === "cancel" ? "Oui, annuler" : "Oui, j'ai reçu"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {reviewTarget && (
        <ReviewDialog
          open={!!reviewTarget}
          onOpenChange={(v) => !v && setReviewTarget(null)}
          productId={reviewTarget.productId}
          productName={reviewTarget.productName}
          orderId={reviewTarget.orderId}
          userId={user.id}
          onSuccess={() => qc.invalidateQueries({ queryKey: ["my-orders"] })}
        />
      )}

      {reportTarget && (
        <ReportDialog
          open={!!reportTarget}
          onOpenChange={(v) => !v && setReportTarget(null)}
          type={reportTarget.type}
          productId={reportTarget.type === "product" ? reportTarget.productId : undefined}
          vendorId={reportTarget.type === "vendor" ? reportTarget.vendorId : undefined}
          orderId={reportTarget.orderId}
          targetName={reportTarget.name}
          reporterId={user.id}
        />
      )}
    </div>
  );
}
