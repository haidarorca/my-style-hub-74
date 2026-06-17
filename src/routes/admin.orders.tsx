// @ts-nocheck
/**
 * admin.orders.tsx — ORDER HUB
 *
 * Architecture: Centre de commandes unifié qui fusionne :
 * - /admin/orders (commandes)
 * - /admin/logistics (logistique)
 * - /admin/shipments (expéditions)
 * - /admin/commission-orders (commission)
 *
 * En une seule page avec :
 * - Tabs intelligents (Toutes | À traiter | Logistique | Commission)
 * - Tableau unifié avec statuts combinés
 * - Drawer latéral pour les détails (pas de page séparée)
 * - Actions inline (statut, évaluation, paiement, tracking)
 * - Filtres contextuels par tab
 */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ShoppingBag, Search, X, Package, Truck, Scale, DollarSign,
  Percent, Eye, ChevronRight, ChevronLeft, Loader2, Filter,
  Box, Receipt, Phone, Ban, CheckCircle, AlertCircle, Globe,
  MapPin, Layers, Zap, Clock, RefreshCw, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  listAdminOrders, updateAdminOrderStatus,
} from "@/lib/admin-orders.functions";
import {
  listLogisticsOrders, confirmShipmentPayment,
  getLogisticsStats, type LogisticsOrderRow,
} from "@/lib/admin-logistics.functions";
import { getOrCreateShipmentAssessment } from "@/lib/shipment-assessments.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/admin/orders")({
  component: OrderHub,
});

/* ═══════════════════════════════════════════════════════════
   TYPES & CONFIGS
   ═══════════════════════════════════════════════════════════ */

type TabId = "all" | "action" | "logistics" | "commission";

interface TabConfig {
  id: TabId;
  label: string;
  icon: typeof ShoppingBag;
  description: string;
}

const TABS: TabConfig[] = [
  { id: "all", label: "Toutes", icon: ShoppingBag, description: "Toutes les commandes" },
  { id: "action", label: "À traiter", icon: Zap, description: "Nouvelles et en attente" },
  { id: "logistics", label: "Logistique", icon: Truck, description: "Import et expédition" },
  { id: "commission", label: "Commission", icon: Percent, description: "Commandes commission" },
];

const PAGE_SIZE = 25;

/* ═══════════════════════════════════════════════════════════
   STATUTS CONFIGS — Avec fallbacks
   ═══════════════════════════════════════════════════════════ */

const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  new: { label: "Nouvelle", color: "bg-amber-100 text-amber-700 border-amber-300" },
  confirmed: { label: "Confirmée", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  processing: { label: "En cours", color: "bg-purple-100 text-purple-700 border-purple-300" },
  shipped: { label: "Expédiée", color: "bg-violet-100 text-violet-700 border-violet-300" },
  delivered: { label: "Livrée", color: "bg-blue-100 text-blue-700 border-blue-300" },
  cancelled: { label: "Annulée", color: "bg-red-100 text-red-700 border-red-300" },
  refunded: { label: "Remboursée", color: "bg-gray-100 text-gray-600 border-gray-300" },
};

function safeOrderStatus(s: string | null | undefined) {
  return ORDER_STATUS[s ?? ""] ?? { label: s ?? "?", color: "bg-gray-100 text-gray-500 border-gray-300" };
}

const LOGISTICS_STATUS: Record<string, { label: string; color: string }> = {
  pending_arrival: { label: "Attente", color: "bg-gray-100 text-gray-600 border-gray-300" },
  awaiting_weighing: { label: "À peser", color: "bg-orange-100 text-orange-700 border-orange-300" },
  fees_calculated: { label: "Frais calc.", color: "bg-sky-100 text-sky-700 border-sky-300" },
  awaiting_client_validation: { label: "Client", color: "bg-purple-100 text-purple-700 border-purple-300" },
  validated: { label: "Validée", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  rejected: { label: "Rejetée", color: "bg-red-100 text-red-700 border-red-300" },
  ready_to_ship: { label: "Prête", color: "bg-cyan-100 text-cyan-700 border-cyan-300" },
  shipped: { label: "Expédiée", color: "bg-violet-100 text-violet-700 border-violet-300" },
};

function safeLogisticsStatus(s: string | null | undefined) {
  return LOGISTICS_STATUS[s ?? ""] ?? { label: s ?? "?", color: "bg-gray-100 text-gray-500 border-gray-300" };
}

const PAYMENT_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "À payer", color: "bg-amber-100 text-amber-700 border-amber-300" },
  partial: { label: "Partiel", color: "bg-orange-100 text-orange-700 border-orange-300" },
  paid: { label: "Payé", color: "bg-blue-100 text-blue-700 border-blue-300" },
  confirmed: { label: "Confirmé", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  waived: { label: "Gratuit", color: "bg-gray-100 text-gray-500 border-gray-300" },
};

function safePaymentStatus(s: string | null | undefined) {
  return PAYMENT_STATUS[s ?? ""] ?? { label: s ?? "?", color: "bg-gray-100 text-gray-500 border-gray-300" };
}

const ORDER_TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof Globe }> = {
  local: { label: "LOCAL", color: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: MapPin },
  import: { label: "IMPORT", color: "bg-sky-100 text-sky-700 border-sky-300", icon: Globe },
  mixed: { label: "MIXTE", color: "bg-amber-100 text-amber-700 border-amber-300", icon: Layers },
};

/* ═══════════════════════════════════════════════════════════
   ORDER HUB — Composant principal
   ═══════════════════════════════════════════════════════════ */

function OrderHub() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [detailOrder, setDetailOrder] = useState<LogisticsOrderRow | null>(null);

  const fetchOrders = useServerFn(listAdminOrders);
  const fetchLogistics = useServerFn(listLogisticsOrders);
  const fetchLogisticsStats = useServerFn(getLogisticsStats);
  const updateStatus = useServerFn(updateAdminOrderStatus);
  const confirmPay = useServerFn(confirmShipmentPayment);
  const createAssessmentFn = useServerFn(getOrCreateShipmentAssessment);

  /* ── Query : Commandes admin ── */
  const adminOrders = useQuery({
    queryKey: ["admin-orders", page, search, activeTab],
    queryFn: () => fetchOrders({
      data: {
        page, pageSize: PAGE_SIZE,
        status: activeTab === "action" ? "new" : "all",
        q: search, country: "all", commission: activeTab === "commission" ? "yes" : "all",
        show_history: false,
      },
    }),
    enabled: isAdmin && activeTab !== "logistics",
  });

  /* ── Query : Commandes logistique ── */
  const logisticsOrders = useQuery({
    queryKey: ["admin-logistics", page, search, activeTab],
    queryFn: () => fetchLogistics({
      data: { page, pageSize: PAGE_SIZE, q: search, orderStatus: "", logisticsStatus: "", paymentStatus: "", orderType: "", hasRemaining: null, dateFrom: null, dateTo: null },
    }),
    enabled: isAdmin && activeTab === "logistics",
  });

  /* ── Query : Stats logistique ── */
  const logisticsStats = useQuery({
    queryKey: ["admin-logistics-stats"],
    queryFn: () => fetchLogisticsStats({ data: {} }),
    enabled: isAdmin,
  });

  /* ── Mutation : Changer statut ── */
  const statusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      updateStatus({ data: { orderId, status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries({ queryKey: ["admin-logistics"] });
      toast.success("Statut mis à jour");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* ── Mutation : Confirmer paiement ── */
  const paymentMutation = useMutation({
    mutationFn: ({ assessmentId, amount }: { assessmentId: string; amount: number }) =>
      confirmPay({ data: { assessmentId, amountConfirmed: amount } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-logistics"] });
      qc.invalidateQueries({ queryKey: ["admin-logistics-stats"] });
      toast.success("Paiement confirmé");
      setDetailOrder(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* ── Mutation : Créer évaluation ── */
  const assessmentMutation = useMutation({
    mutationFn: (orderId: string) => createAssessmentFn({ data: { order_id: orderId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-logistics"] });
      qc.invalidateQueries({ queryKey: ["admin-logistics-stats"] });
      toast.success("Évaluation créée");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <ShoppingBag className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-sm">Accès réservé aux administrateurs.</p>
      </div>
    );
  }

  const rows = activeTab === "logistics"
    ? (logisticsOrders.data?.rows ?? []) as unknown as Array<Record<string, unknown>>
    : (adminOrders.data?.rows ?? []);
  const total = activeTab === "logistics"
    ? (logisticsOrders.data?.total ?? 0)
    : (adminOrders.data?.total ?? 0);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const isLoading = activeTab === "logistics" ? logisticsOrders.isLoading : adminOrders.isLoading;
  const ls = logisticsStats.data;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Order Hub
          </h1>
          <p className="text-xs text-muted-foreground">
            {total.toLocaleString("fr-FR")} commande{total > 1 ? "s" : ""} · Centre de traitement unifié
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Client, téléphone, N° commande..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
          {search && (
            <Button variant="ghost" size="sm" className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0" onClick={() => setSearch("")}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* KPI Logistique rapide (visible sur tab logistics) */}
      {activeTab === "logistics" && ls && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "À peser", value: ls.to_weigh, icon: Scale, color: "text-orange-600", bg: "bg-orange-50" },
            { label: "Attente paiement", value: ls.awaiting_payment, icon: DollarSign, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "À expédier", value: ls.to_ship, icon: Truck, color: "text-cyan-600", bg: "bg-cyan-50" },
            { label: "Expédiées", value: ls.shipped, icon: Package, color: "text-violet-600", bg: "bg-violet-50" },
          ].map((kpi) => (
            <Card key={kpi.label} className={kpi.bg}>
              <CardContent className="flex items-center gap-2 p-2">
                <kpi.icon className={cn("h-4 w-4", kpi.color)} />
                <div>
                  <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                  <p className="text-lg font-bold">{(kpi.value ?? 0).toLocaleString("fr-FR")}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide border-b">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setPage(1); }}
            className={cn(
              "shrink-0 flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-xs font-medium transition-all",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tableau */}
      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/60">
                {activeTab === "logistics" ? (
                  <>
                    <th className="px-2 py-2 text-left font-semibold uppercase text-[10px]">Type</th>
                    <th className="px-2 py-2 text-left font-semibold uppercase text-[10px]">Commande</th>
                    <th className="px-2 py-2 text-left font-semibold uppercase text-[10px]">Client</th>
                    <th className="px-2 py-2 text-left font-semibold uppercase text-[10px]">Statut</th>
                    <th className="px-2 py-2 text-left font-semibold uppercase text-[10px]">Logistique</th>
                    <th className="px-2 py-2 text-left font-semibold uppercase text-[10px]">Paiement</th>
                    <th className="px-2 py-2 text-right font-semibold uppercase text-[10px]">Total</th>
                    <th className="px-2 py-2 text-right font-semibold uppercase text-[10px]">Frais</th>
                    <th className="px-2 py-2 text-right font-semibold uppercase text-[10px]">Reste</th>
                    <th className="px-2 py-2 text-left font-semibold uppercase text-[10px]">Actions</th>
                  </>
                ) : (
                  <>
                    <th className="px-2 py-2 text-left font-semibold uppercase text-[10px]">Commande</th>
                    <th className="px-2 py-2 text-left font-semibold uppercase text-[10px]">Client</th>
                    <th className="px-2 py-2 text-left font-semibold uppercase text-[10px]">Statut</th>
                    <th className="px-2 py-2 text-left font-semibold uppercase text-[10px]">Type</th>
                    <th className="px-2 py-2 text-right font-semibold uppercase text-[10px]">Total</th>
                    <th className="px-2 py-2 text-left font-semibold uppercase text-[10px]">Date</th>
                    <th className="px-2 py-2 text-left font-semibold uppercase text-[10px]">Actions</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={activeTab === "logistics" ? 10 : 7} className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={activeTab === "logistics" ? 10 : 7} className="py-8 text-center text-muted-foreground"><Box className="h-8 w-8 mx-auto mb-2 opacity-30" />Aucune commande</td></tr>
              ) : (
                rows.map((row: any) => (
                  <OrderRow
                    key={row.id ?? row.order_id}
                    row={row}
                    isLogistics={activeTab === "logistics"}
                    onView={() => setDetailOrder(row as unknown as LogisticsOrderRow)}
                    onStatusChange={(status) => statusMutation.mutate({ orderId: row.id ?? row.order_id, status })}
                    onCreateAssessment={() => assessmentMutation.mutate(row.id ?? row.order_id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-3 py-2">
            <span className="text-xs text-muted-foreground">Page {page}/{totalPages} · {total} résultats</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <Button variant="outline" size="sm" className="h-7" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Dialog détail */}
      {detailOrder && (
        <OrderDetailDialog
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
          onConfirmPayment={(assessmentId, amount) => paymentMutation.mutate({ assessmentId, amount })}
          onCreateAssessment={() => assessmentMutation.mutate(detailOrder.order_id)}
          isCreatingAssessment={assessmentMutation.isPending}
          isConfirmingPayment={paymentMutation.isPending}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ORDER ROW — Ligne de tableau
   ═══════════════════════════════════════════════════════════ */

function OrderRow({
  row,
  isLogistics,
  onView,
  onStatusChange,
  onCreateAssessment,
}: {
  row: any;
  isLogistics: boolean;
  onView: () => void;
  onStatusChange: (status: string) => void;
  onCreateAssessment: () => void;
}) {
  const orderId = row.id ?? row.order_id ?? "?";
  const status = row.status ?? row.order_status ?? "new";
  const logStatus = row.logistics_status ?? null;
  const payStatus = row.payment_status ?? null;
  const total = row.total ?? row.order_total ?? 0;
  const customerName = row.customer_name ?? "—";
  const customerPhone = row.customer_phone ?? null;
  const isCommission = row.is_commission ?? false;
  const orderType = row.order_type ?? (isCommission ? "import" : "local");
  const assessmentId = row.assessment_id ?? null;
  const remaining = row.amount_remaining ?? 0;
  const shippingFees = row.total_shipping_fees ?? 0;

  if (isLogistics) {
    const typeConfig = ORDER_TYPE_CONFIG[orderType] ?? ORDER_TYPE_CONFIG.local;
    const TypeIcon = typeConfig.icon;

    return (
      <tr className="border-b hover:bg-muted/20 transition-colors">
        <td className="px-2 py-1.5">
          <span className={cn("inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-medium", typeConfig.color)}>
            <TypeIcon className="h-2.5 w-2.5" /> {typeConfig.label}
          </span>
        </td>
        <td className="px-2 py-1.5"><span className="font-mono">#{String(orderId).slice(0, 8)}</span></td>
        <td className="px-2 py-1.5">
          <p className="font-medium truncate max-w-[100px]">{customerName}</p>
          {customerPhone && <p className="text-[9px] text-muted-foreground">{customerPhone}</p>}
        </td>
        <td className="px-2 py-1.5"><StatusBadge config={safeOrderStatus(status)} /></td>
        <td className="px-2 py-1.5">
          {assessmentId ? <StatusBadge config={safeLogisticsStatus(logStatus)} /> : <span className="text-[9px] text-gray-400">Non évaluée</span>}
        </td>
        <td className="px-2 py-1.5">
          {payStatus ? <StatusBadge config={safePaymentStatus(payStatus)} /> : <span className="text-gray-400">—</span>}
        </td>
        <td className="px-2 py-1.5 text-right font-medium">{fmtN(total)}</td>
        <td className="px-2 py-1.5 text-right">{shippingFees > 0 ? fmtN(shippingFees) : "—"}</td>
        <td className="px-2 py-1.5 text-right">
          <span className={cn("font-medium", remaining > 0 ? "text-red-600" : "text-emerald-600")}>
            {shippingFees > 0 ? fmtN(remaining) : "—"}
          </span>
        </td>
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onView} title="Détails">
              <Eye className="h-3 w-3" />
            </Button>
            {!assessmentId && (
              <Button size="sm" variant="outline" className="h-6 text-[9px] px-1.5" onClick={onCreateAssessment}>
                <Scale className="h-3 w-3 mr-0.5" /> Évaluer
              </Button>
            )}
            {customerPhone && (
              <a href={`https://wa.me/${customerPhone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="h-6 w-6 flex items-center justify-center rounded hover:bg-emerald-50 text-emerald-600" title="WhatsApp">
                <Phone className="h-3 w-3" />
              </a>
            )}
          </div>
        </td>
      </tr>
    );
  }

  // Mode non-logistics (all, action, commission)
  const typeConfig = ORDER_TYPE_CONFIG[orderType] ?? ORDER_TYPE_CONFIG.local;
  const TypeIcon = typeConfig.icon;

  return (
    <tr className="border-b hover:bg-muted/20 transition-colors">
      <td className="px-2 py-1.5"><span className="font-mono">#{String(orderId).slice(0, 8)}</span></td>
      <td className="px-2 py-1.5">
        <p className="font-medium truncate max-w-[120px]">{customerName}</p>
        {customerPhone && <p className="text-[9px] text-muted-foreground">{customerPhone}</p>}
      </td>
      <td className="px-2 py-1.5"><StatusBadge config={safeOrderStatus(status)} /></td>
      <td className="px-2 py-1.5">
        <span className={cn("inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-medium", typeConfig.color)}>
          <TypeIcon className="h-2.5 w-2.5" /> {typeConfig.label}
        </span>
      </td>
      <td className="px-2 py-1.5 text-right font-medium">{fmtN(total)}</td>
      <td className="px-2 py-1.5 text-[9px] text-muted-foreground">
        {row.created_at ? fmtD(row.created_at) : row.order_created_at ? fmtD(row.order_created_at) : "—"}
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onView}><Eye className="h-3 w-3" /></Button>
          {status === "new" && (
            <Button size="sm" variant="outline" className="h-6 text-[9px] px-1.5" onClick={() => onStatusChange("confirmed")}>
              <CheckCircle className="h-3 w-3 mr-0.5" /> Confirmer
            </Button>
          )}
          {customerPhone && (
            <a href={`https://wa.me/${customerPhone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="h-6 w-6 flex items-center justify-center rounded hover:bg-emerald-50 text-emerald-600">
              <Phone className="h-3 w-3" />
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════════
   ORDER DETAIL DIALOG — Drawer de détails
   ═══════════════════════════════════════════════════════════ */

function OrderDetailDialog({
  order,
  onClose,
  onConfirmPayment,
  onCreateAssessment,
  isCreatingAssessment,
  isConfirmingPayment,
}: {
  order: LogisticsOrderRow;
  onClose: () => void;
  onConfirmPayment: (assessmentId: string, amount: number) => void;
  onCreateAssessment: () => void;
  isCreatingAssessment: boolean;
  isConfirmingPayment: boolean;
}) {
  const daysPending = order.days_pending ?? 0;
  const isUrgent = daysPending > 14;
  const isBlocked = daysPending > 7 && (order.logistics_status ?? "") !== "shipped";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto gap-0 p-0">
        <DialogHeader className="p-4 pb-3 border-b">
          <DialogTitle className="text-base flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" />
            Commande #{order.order_id.slice(0, 8)}
          </DialogTitle>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-xs text-muted-foreground">{order.customer_name} · {order.customer_phone}</p>
            <StatusBadge config={safeOrderStatus(order.order_status)} />
            {order.order_type && (
              <span className={cn("inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-medium",
                ORDER_TYPE_CONFIG[order.order_type]?.color ?? ORDER_TYPE_CONFIG.local.color)}>
                {(ORDER_TYPE_CONFIG[order.order_type]?.icon ?? MapPin)({ className: "h-2.5 w-2.5" })}
                {ORDER_TYPE_CONFIG[order.order_type]?.label ?? "?"}
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="p-4 space-y-4">
          {/* Urgence */}
          {(isUrgent || isBlocked) && (
            <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
              isUrgent ? "bg-red-50 border-red-200 text-red-700" : "bg-orange-50 border-orange-200 text-orange-700")}>
              {isUrgent ? <Zap className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
              {daysPending} jours d'attente
            </div>
          )}

          {/* Statuts */}
          <div className="flex flex-wrap gap-2">
            <StatusBadge config={safeOrderStatus(order.order_status)} />
            {order.logistics_status && <StatusBadge config={safeLogisticsStatus(order.logistics_status)} />}
            {order.payment_status && <StatusBadge config={safePaymentStatus(order.payment_status)} />}
          </div>

          {/* Financier */}
          <section className="rounded-xl border bg-muted/30 p-3 space-y-2">
            <p className="text-[10px] uppercase font-semibold text-muted-foreground">Financier</p>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Produits</span><span>{fmtN(order.order_total)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Frais transport</span><span>{fmtN(order.total_shipping_fees)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Payé</span><span className="text-emerald-600">{fmtN(order.amount_paid)}</span></div>
            <div className="border-t pt-1 flex justify-between font-bold text-sm">
              <span>Reste</span>
              <span className={(order.amount_remaining ?? 0) > 0 ? "text-red-600" : "text-emerald-600"}>{fmtN(order.amount_remaining)}</span>
            </div>
          </section>

          {/* Poids */}
          {(order.real_weight_kg || order.volumetric_weight_kg) && (
            <section className="rounded-xl border bg-muted/30 p-3 space-y-1">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground">Poids</p>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Réel</span><span>{order.real_weight_kg ?? "—"} kg</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Volumétrique</span><span>{order.volumetric_weight_kg ?? "—"} kg</span></div>
              <div className="flex justify-between text-xs font-medium"><span>Facturable</span><span>{order.chargeable_weight_kg ?? "—"} kg</span></div>
            </section>
          )}

          {/* Tracking */}
          {order.tracking_number && (
            <section className="rounded-xl border bg-muted/30 p-3 space-y-1">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground">Tracking</p>
              <div className="flex items-center gap-2 text-xs">
                <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-mono">{order.tracking_number}</span>
              </div>
              {order.carrier_name && <p className="text-xs text-muted-foreground">Transporteur: {order.carrier_name}</p>}
            </section>
          )}

          {/* Actions */}
          <section className="flex flex-wrap gap-2 pt-2 border-t">
            {!order.assessment_id && (
              <Button size="sm" onClick={onCreateAssessment} disabled={isCreatingAssessment}>
                <Scale className="h-4 w-4 mr-1" /> Créer évaluation
              </Button>
            )}
            {order.assessment_id && (order.payment_status === "pending" || order.payment_status === "partial") && (order.amount_remaining ?? 0) > 0 && (
              <Button size="sm" onClick={() => onConfirmPayment(order.assessment_id!, order.amount_remaining ?? 0)} disabled={isConfirmingPayment}>
                <Receipt className="h-4 w-4 mr-1" /> Confirmer paiement
              </Button>
            )}
            {order.customer_phone && (
              <Button size="sm" variant="outline" asChild>
                <a href={`https://wa.me/${order.customer_phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                  <Phone className="h-4 w-4 mr-1" /> WhatsApp
                </a>
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onClose}><Ban className="h-4 w-4 mr-1" /> Fermer</Button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

function StatusBadge({ config }: { config?: { label: string; color: string } | null }) {
  const safe = config ?? { label: "?", color: "bg-gray-100 text-gray-500 border-gray-300" };
  return <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium border", safe.color)}>{safe.label}</span>;
}

function fmtN(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
}

function fmtD(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}
