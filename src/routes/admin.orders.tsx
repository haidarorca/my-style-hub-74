import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Package, Phone, MapPin, Search, X, History } from "lucide-react";
import { toast } from "sonner";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useCountries, useCountryLabel } from "@/hooks/use-countries";
import {
  listAdminOrders,
  updateAdminOrderStatus,
  type AdminOrderRow,
} from "@/lib/admin-orders.functions";

const STATUSES = [
  { value: "new", label: "En attente de validation" },
  { value: "confirmed", label: "Confirmée" },
  { value: "delivered", label: "Livrée" },
  { value: "cancelled", label: "Annulée" },
] as const;

const searchSchema = z.object({
  page: fallback(z.number().int().min(1), 1).default(1),
  q: fallback(z.string(), "").default(""),
  status: fallback(z.enum(["all", "new", "confirmed", "delivered", "cancelled"]), "all").default("all"),
  country: fallback(z.string(), "all").default("all"),
  commission: fallback(z.enum(["all", "yes", "no"]), "all").default("all"),
  show_history: fallback(z.boolean(), false).default(false),
});
type SearchState = z.infer<typeof searchSchema>;

const PAGE_SIZE = 25;

export const Route = createFileRoute("/admin/orders")({
  validateSearch: zodValidator(searchSchema),
  component: () => (
    <PermissionGate perm="orders">
      <AdminOrders />
    </PermissionGate>
  ),
});

const statusVariant = (s: string) =>
  s === "delivered"
    ? "default"
    : s === "cancelled"
    ? "destructive"
    : s === "confirmed"
    ? "secondary"
    : "outline";

function AdminOrders() {
  const qc = useQueryClient();
  const navigate = useNavigate({ from: "/admin/orders" });
  const search = Route.useSearch();

  const fetchList = useServerFn(listAdminOrders);
  const updateStatus = useServerFn(updateAdminOrderStatus);

  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState(search.q);
  const debouncedQ = useDebouncedValue(queryInput, 300);

  useEffect(() => {
    if (debouncedQ !== search.q) {
      navigate({
        search: (prev: SearchState) => ({ ...prev, q: debouncedQ, page: 1 }),
        replace: true,
      });
    }
  }, [debouncedQ, navigate, search.q]);

  // Par defaut : masquer les commandes delivered > 30j et cancelled
  const defaultDateFrom = useMemo(() => {
    if (search.show_history || search.status !== "all") return null;
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  }, [search.show_history, search.status]);

  const params = useMemo(
    () => ({
      page: search.page,
      pageSize: PAGE_SIZE,
      q: search.q,
      status: search.status,
      country_id: search.country === "all" ? null : search.country,
      is_commission: search.commission,
      date_from: defaultDateFrom,
      date_to: null,
    }),
    [search.page, search.q, search.status, search.country, search.commission, defaultDateFrom],
  );

  const { data, isFetching, isLoading } = useQuery({
    queryKey: ["admin", "orders", params],
    queryFn: () => fetchList({ data: params }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const { data: countries } = useCountries({ onlyEnabled: true });
  const labelOf = useCountryLabel();

  const onStatusChange = useCallback(
    async (orderId: string, status: string) => {
      try {
        await updateStatus({ data: { order_id: orderId, status: status as any } });
        toast.success("Statut mis à jour");
        qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [qc, updateStatus],
  );

  const onPage = useCallback(
    (next: number) => navigate({ search: (prev: SearchState) => ({ ...prev, page: next }) }),
    [navigate],
  );

  const onReset = useCallback(() => {
    setQueryInput("");
    navigate({ search: { page: 1, q: "", status: "all", country: "all", commission: "all", show_history: false } });
  }, [navigate]);

  const toggleHistory = useCallback(() => {
    navigate({
      search: (prev: SearchState) => ({ ...prev, show_history: !prev.show_history, page: 1 }),
    });
  }, [navigate]);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totals = data?.totals;

  const filtersActive =
    search.q || search.status !== "all" || search.country !== "all" || search.commission !== "all" || search.show_history;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Toutes les commandes</h1>
        <p className="text-xs text-muted-foreground">
          {total} commande{total > 1 ? "s" : ""}
          {isFetching ? " · …" : ""}
          {totals
            ? ` · Revenus ${new Intl.NumberFormat("fr-FR").format(totals.revenue)} FCFA`
            : ""}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3 p-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Client, téléphone, adresse…"
                className="pl-8"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
              />
            </div>
            <Select
              value={search.status}
              onValueChange={(v) =>
                navigate({
                  search: (prev: SearchState) => ({ ...prev, status: v as any, page: 1 }),
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={search.country}
              onValueChange={(v) =>
                navigate({ search: (prev: SearchState) => ({ ...prev, country: v, page: 1 }) })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Pays" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les pays</SelectItem>
                {(countries ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.flag_emoji ?? "🏳️"} {labelOf(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={search.commission}
              onValueChange={(v) =>
                navigate({
                  search: (prev: SearchState) => ({ ...prev, commission: v as any, page: 1 }),
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Commission" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="yes">Commission uniquement</SelectItem>
                <SelectItem value="no">Sans commission</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-primary accent-primary"
                checked={search.show_history}
                onChange={toggleHistory}
              />
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <History className="h-3.5 w-3.5" />
                Afficher l&apos;historique (livrees &gt; 30j, annulees)
              </span>
            </label>
            {filtersActive ? (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onReset}>
                <X className="mr-1 h-3 w-3" /> Reinitialiser
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Chargement…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
          Aucune commande.
        </div>
      ) : (
        <ul className="space-y-4">
          {rows.map((o) => (
            <OrderCard key={o.id} order={o} onStatus={onStatusChange} onZoom={setZoomImg} />
          ))}
        </ul>
      )}

      <PaginationBar page={search.page} pageSize={PAGE_SIZE} total={total} onPageChange={onPage} />

      <Dialog open={!!zoomImg} onOpenChange={(o) => !o && setZoomImg(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Image de personnalisation</DialogTitle>
          </DialogHeader>
          {zoomImg && (
            <div className="space-y-3">
              <img
                src={zoomImg}
                alt="zoom"
                loading="lazy"
                decoding="async"
                className="max-h-[70vh] w-full object-contain"
              />
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

type OrderCardProps = {
  order: AdminOrderRow;
  onStatus: (id: string, status: string) => void;
  onZoom: (url: string) => void;
};

const OrderCard = memo(function OrderCard({ order: o, onStatus, onZoom }: OrderCardProps) {
  const commission = o.items.reduce((s, it) => s + Number(it.commission_amount ?? 0), 0);
  return (
    <li className="overflow-hidden rounded-xl border bg-card">
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
          <Select value={o.status} onValueChange={(v) => onStatus(o.id, v)}>
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
        {o.items.map((it) => {
          const c = (it.customization ?? {}) as Record<string, any>;
          return (
            <li key={it.id} className="flex gap-3 border-b p-3 last:border-0">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                {it.product_image_url && (
                  <img
                    src={it.product_image_url}
                    alt={it.product_name}
                    loading="lazy"
                    decoding="async"
                    width={64}
                    height={64}
                    className="h-full w-full object-cover"
                  />
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
                {it.source_url && (
                  <div className="mt-1 flex items-center gap-1 text-xs">
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-700 dark:text-amber-400">
                      Source admin
                    </span>
                    <a
                      href={it.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-primary underline"
                      title={it.source_url}
                    >
                      {it.source_url}
                    </a>
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
                        onClick={() => onZoom(c.image_url)}
                        className="mt-2 block h-20 w-20 overflow-hidden rounded border bg-muted"
                      >
                        <img
                          src={c.image_url}
                          alt="logo"
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-contain"
                        />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="space-y-1 border-t bg-muted/10 px-3 py-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Total</span>
          <span className="font-bold text-primary">
            {Number(o.total).toLocaleString("fr-FR")} FCFA
          </span>
        </div>
        {commission > 0 && (
          <div className="flex items-center justify-between text-emerald-700">
            <span>Commission plateforme</span>
            <span className="font-semibold">{commission.toLocaleString("fr-FR")} FCFA</span>
          </div>
        )}
      </div>
    </li>
  );
});
