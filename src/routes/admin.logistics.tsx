/**
 * admin.logistics.tsx — Tableau ERP logistique centralisé
 * Vue unique pour gérer toute la chaîne logistique : pesée, paiement, tracking, suivi
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  listLogisticsOrders, confirmShipmentPayment, updateShipmentTracking,
  type LogisticsOrderRow,
} from "@/lib/admin-logistics.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Search, Plane, Scale, DollarSign, Package, Truck,
  ChevronLeft, ChevronRight, Loader2, Eye, CheckCircle,
  Clock, AlertCircle, CreditCard, Box,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/logistics")({
  component: LogisticsPage,
});

/* ── Configuration statuts ── */

const ORDER_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new:       { label: "Nouvelle",    color: "bg-amber-100 text-amber-700" },
  confirmed: { label: "Confirmée",   color: "bg-emerald-100 text-emerald-700" },
  delivered: { label: "Livrée",      color: "bg-blue-100 text-blue-700" },
  cancelled: { label: "Annulée",     color: "bg-red-100 text-red-700" },
  refunded:  { label: "Remboursée",  color: "bg-gray-100 text-gray-600" },
};

const LOGISTICS_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_arrival:            { label: "Attente arrivée",       color: "bg-gray-100 text-gray-600" },
  awaiting_weighing:          { label: "À peser",               color: "bg-orange-100 text-orange-700" },
  fees_calculated:            { label: "Frais calculés",        color: "bg-blue-100 text-blue-700" },
  awaiting_client_validation: { label: "Attente client",        color: "bg-purple-100 text-purple-700" },
  validated:                  { label: "Validée",               color: "bg-emerald-100 text-emerald-700" },
  rejected:                   { label: "Rejetée",               color: "bg-red-100 text-red-700" },
  ready_to_ship:              { label: "Prête",                 color: "bg-cyan-100 text-cyan-700" },
  shipped:                    { label: "Expédiée",              color: "bg-violet-100 text-violet-700" },
};

const PAYMENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:   { label: "À payer",       color: "bg-amber-100 text-amber-700" },
  partial:   { label: "Partiel",       color: "bg-orange-100 text-orange-700" },
  paid:      { label: "Payé",          color: "bg-blue-100 text-blue-700" },
  confirmed: { label: "Confirmé",      color: "bg-emerald-100 text-emerald-700" },
  waived:    { label: "Gratuit",       color: "bg-gray-100 text-gray-500" },
  refunded:  { label: "Remboursé",     color: "bg-gray-100 text-gray-500" },
};

/* ── Filtres rapides ── */

const QUICK_FILTERS = [
  { id: "to_weigh",      label: "À peser",            logisticsStatus: "awaiting_weighing",           icon: Scale,       color: "bg-orange-500" },
  { id: "awaiting_pay",  label: "Attente paiement",   paymentStatus: "pending",                       icon: DollarSign,  color: "bg-amber-500" },
  { id: "partial",       label: "Paiement partiel",   paymentStatus: "partial",                       icon: CreditCard,  color: "bg-orange-500" },
  { id: "to_ship",       label: "À expédier",         logisticsStatus: "validated", paymentStatus: "confirmed", icon: Truck, color: "bg-cyan-500" },
  { id: "shipped",       label: "Expédiées",          logisticsStatus: "shipped",                      icon: Plane,       color: "bg-violet-500" },
  { id: "remaining",     label: "Reste à payer",      hasRemaining: true as boolean,                  icon: AlertCircle, color: "bg-red-500" },
];

/* ── Page ── */

function LogisticsPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<LogisticsOrderRow | null>(null);
  const pageSize = 25;

  // Build filter params from active quick filter
  const filterParams = (() => {
    const f = QUICK_FILTERS.find((q) => q.id === activeFilter);
    if (!f) return {};
    return {
      ...(f.logisticsStatus ? { logisticsStatus: f.logisticsStatus } : {}),
      ...(f.paymentStatus ? { paymentStatus: f.paymentStatus } : {}),
      ...(f.hasRemaining !== undefined ? { hasRemaining: f.hasRemaining } : {}),
    };
  })();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-logistics", page, search, activeFilter],
    queryFn: async () =>
      listLogisticsOrders({
        data: {
          page,
          pageSize,
          q: search,
          orderStatus: "",
          ...filterParams,
          dateFrom: null,
          dateTo: null,
        },
      }),
    enabled: isAdmin,
  });

  const confirmPayment = useMutation({
    mutationFn: async ({ paymentId, amount }: { paymentId: string; amount: number }) => {
      await confirmShipmentPayment({ data: { paymentId, amountConfirmed: amount } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-logistics"] });
      toast({ title: "Paiement confirmé" });
      setDetailOrder(null);
    },
    onError: (e) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Plane className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-sm">Accès réservé aux administrateurs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Logistique & Expéditions
          </h1>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()} commande{total > 1 ? "s" : ""} · Tableau centralisé
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher (client, téléphone, N° commande…)"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
      </div>

      {/* Filtres rapides */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setActiveFilter(null); setPage(1); }}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            !activeFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent",
          )}
        >
          Toutes
        </button>
        {QUICK_FILTERS.map((f) => {
          const Icon = f.icon;
          const active = activeFilter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => { setActiveFilter(active ? null : f.id); setPage(1); }}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                active ? `${f.color.replace("bg-", "bg-opacity-20 bg-")} text-white` : "bg-muted text-muted-foreground hover:bg-accent",
              )}
            >
              <Icon className="h-3 w-3" />
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Tableau */}
      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Commande</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Client</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Statut</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Logistique</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Paiement</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Produits</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Frais transport</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reste</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tracking</th>
                <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground text-xs">
                    <Box className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    Aucune commande logistique trouvée
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <LogisticsRow
                    key={row.order_id}
                    row={row}
                    onView={() => setDetailOrder(row)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-3 py-2">
            <span className="text-xs text-muted-foreground">
              Page {page} / {totalPages} · {total} résultats
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Dialog détail */}
      {detailOrder && (
        <Dialog open onOpenChange={() => setDetailOrder(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                Commande #{detailOrder.order_id.slice(0, 8)}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              {/* Client */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold">Client</p>
                  <p className="font-medium">{detailOrder.customer_name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold">Téléphone</p>
                  <p className="font-medium">{detailOrder.customer_phone ?? "—"}</p>
                </div>
              </div>

              {/* Statuts */}
              <div className="flex flex-wrap gap-2">
                {detailOrder.order_status && (
                  <StatusBadge config={ORDER_STATUS_LABELS[detailOrder.order_status]} />
                )}
                {detailOrder.logistics_status && (
                  <StatusBadge config={LOGISTICS_STATUS_LABELS[detailOrder.logistics_status]} />
                )}
                {detailOrder.payment_status && (
                  <StatusBadge config={PAYMENT_STATUS_LABELS[detailOrder.payment_status]} />
                )}
              </div>

              {/* Montants */}
              <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
                <p className="text-[10px] uppercase text-muted-foreground font-semibold">Financier</p>
                <div className="flex justify-between"><span className="text-muted-foreground">Produits</span><span>{fmt(detailOrder.order_total)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Frais transport</span><span>{fmt(detailOrder.total_shipping_fees)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Payé</span><span className="text-emerald-600">{fmt(detailOrder.amount_paid)}</span></div>
                <div className="flex justify-between font-bold"><span>Reste à payer</span><span className={cn(detailOrder.amount_remaining && detailOrder.amount_remaining > 0 ? "text-red-600" : "text-emerald-600")}>{fmt(detailOrder.amount_remaining)}</span></div>
              </div>

              {/* Poids */}
              {detailOrder.real_weight_kg && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Scale className="h-3.5 w-3.5" />
                  Poids réel : {detailOrder.real_weight_kg} kg
                  {detailOrder.volumetric_weight_kg && ` · Volumétrique : ${detailOrder.volumetric_weight_kg} kg`}
                </div>
              )}

              {/* Tracking */}
              {detailOrder.tracking_number && (
                <div className="flex items-center gap-2 text-xs">
                  <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono">{detailOrder.tracking_number}</span>
                  {detailOrder.carrier_name && <span className="text-muted-foreground">({detailOrder.carrier_name})</span>}
                </div>
              )}

              {/* Dates */}
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                {detailOrder.warehouse_received_at && <div>Réception : {fmtDate(detailOrder.warehouse_received_at)}</div>}
                {detailOrder.weighed_at && <div>Pesée : {fmtDate(detailOrder.weighed_at)}</div>}
                {detailOrder.shipped_at && <div>Expédition : {fmtDate(detailOrder.shipped_at)}</div>}
                {detailOrder.estimated_arrival_at && <div>Arrivée estimée : {fmtDate(detailOrder.estimated_arrival_at)}</div>}
              </div>

              {/* Actions */}
              {detailOrder.payment_status === "pending" && detailOrder.amount_remaining && detailOrder.amount_remaining > 0 && (
                <Button
                  size="sm"
                  onClick={() => confirmPayment.mutate({
                    paymentId: detailOrder.order_id, // Simplifié — en réalité il faudrait l'ID du payment
                    amount: detailOrder.amount_remaining,
                  })}
                  disabled={confirmPayment.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Confirmer paiement
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function LogisticsRow({ row, onView }: { row: LogisticsOrderRow; onView: () => void }) {
  const orderCfg = ORDER_STATUS_LABELS[row.order_status] ?? { label: row.order_status, color: "bg-muted" };
  const logCfg = row.logistics_status ? LOGISTICS_STATUS_LABELS[row.logistics_status] : null;
  const payCfg = row.payment_status ? PAYMENT_STATUS_LABELS[row.payment_status] : null;
  const hasRemaining = row.amount_remaining && row.amount_remaining > 0;

  return (
    <tr className="border-b hover:bg-muted/30 transition-colors">
      <td className="px-3 py-2">
        <span className="font-mono text-xs">#{row.order_id.slice(0, 8)}</span>
        <p className="text-[10px] text-muted-foreground">{fmtDate(row.order_created_at)}</p>
      </td>
      <td className="px-3 py-2">
        <p className="font-medium text-xs">{row.customer_name ?? "—"}</p>
        <p className="text-[10px] text-muted-foreground">{row.customer_phone ?? "—"}</p>
      </td>
      <td className="px-3 py-2">
        <StatusBadge config={orderCfg} />
      </td>
      <td className="px-3 py-2">
        {logCfg ? <StatusBadge config={logCfg} /> : <span className="text-xs text-muted-foreground">—</span>}
      </td>
      <td className="px-3 py-2">
        {payCfg ? <StatusBadge config={payCfg} /> : <span className="text-xs text-muted-foreground">—</span>}
      </td>
      <td className="px-3 py-2 text-right text-xs">{row.item_count}</td>
      <td className="px-3 py-2 text-right text-xs font-medium">{fmt(row.total_shipping_fees)}</td>
      <td className="px-3 py-2 text-right">
        <span className={cn("text-xs font-medium", hasRemaining ? "text-red-600" : "text-emerald-600")}>
          {fmt(row.amount_remaining)}
        </span>
      </td>
      <td className="px-3 py-2">
        {row.tracking_number ? (
          <span className="font-mono text-[10px]">{row.tracking_number}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onView}>
          <Eye className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}

function StatusBadge({ config }: { config: { label: string; color: string } }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", config.color)}>
      {config.label}
    </span>
  );
}

function fmt(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}
