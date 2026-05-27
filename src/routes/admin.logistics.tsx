/**
 * admin.logistics.tsx — Centre de Contrôle Logistique ERP Kawzone
 * 
 * Blueprint: Dashboard professionnel avec:
 * - Header intelligent (alertes bloquées, urgentes)
 * - KPI Cards (compteur + montant FCFA + poids + urgence)
 * - Séparation LOCAL / IMPORT / MIXED
 * - Tableau ERP dense avec actions rapides
 * - Mobile: cards compactes + filtres horizontaux
 * - Dialog timeline + actions workflow
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  listLogisticsOrders,
  confirmShipmentPayment,
  getLogisticsStats,
  type LogisticsOrderRow,
  type LogisticsStats,
  type OrderType,
} from "@/lib/admin-logistics.functions";
import { getOrCreateShipmentAssessment } from "@/lib/shipment-assessments.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Scale,
  DollarSign,
  Package,
  Truck,
  Plane,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Eye,
  CheckCircle,
  AlertCircle,
  CreditCard,
  Box,
  Phone,
  ArrowRight,
  Warehouse,
  UserCheck,
  Ship,
  Ban,
  Banknote,
  Receipt,
  Globe,
  MapPin,
  Clock,
  Zap,
  AlertTriangle,
  TrendingUp,
  Filter,
  X,
  BarChart3,
  ShoppingBag,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/logistics")({
  component: LogisticsControlCenter,
});

/* ═══════════════════════════════════════════════════════════
   CONFIGURATION STATUTS
   ═══════════════════════════════════════════════════════════ */

const OSL = (label: string, color: string) => ({ label, color });
const ORDER_S: Record<string, ReturnType<typeof OSL>> = {
  new: OSL("Nouvelle", "bg-amber-100 text-amber-700 border-amber-300"),
  confirmed: OSL("Confirmée", "bg-emerald-100 text-emerald-700 border-emerald-300"),
  delivered: OSL("Livrée", "bg-blue-100 text-blue-700 border-blue-300"),
  cancelled: OSL("Annulée", "bg-red-100 text-red-700 border-red-300"),
  refunded: OSL("Remboursée", "bg-gray-100 text-gray-600 border-gray-300"),
};
const LOG_S: Record<string, ReturnType<typeof OSL>> = {
  pending_arrival: OSL("Attente arrivée", "bg-gray-100 text-gray-600 border-gray-300"),
  awaiting_weighing: OSL("À peser", "bg-orange-100 text-orange-700 border-orange-300"),
  fees_calculated: OSL("Frais calc.", "bg-sky-100 text-sky-700 border-sky-300"),
  awaiting_client_validation: OSL("Attente client", "bg-purple-100 text-purple-700 border-purple-300"),
  validated: OSL("Validée", "bg-emerald-100 text-emerald-700 border-emerald-300"),
  rejected: OSL("Rejetée", "bg-red-100 text-red-700 border-red-300"),
  ready_to_ship: OSL("Prête", "bg-cyan-100 text-cyan-700 border-cyan-300"),
  shipped: OSL("Expédiée", "bg-violet-100 text-violet-700 border-violet-300"),
};
const PAY_S: Record<string, ReturnType<typeof OSL>> = {
  pending: OSL("À payer", "bg-amber-100 text-amber-700 border-amber-300"),
  partial: OSL("Partiel", "bg-orange-100 text-orange-700 border-orange-300"),
  paid: OSL("Payé", "bg-blue-100 text-blue-700 border-blue-300"),
  confirmed: OSL("Confirmé", "bg-emerald-100 text-emerald-700 border-emerald-300"),
  waived: OSL("Gratuit", "bg-gray-100 text-gray-500 border-gray-300"),
};

const ORDER_TYPE_CONFIG: Record<
  OrderType,
  { label: string; color: string; icon: typeof Globe }
> = {
  local: { label: "LOCAL", color: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: MapPin },
  import: { label: "IMPORT", color: "bg-sky-100 text-sky-700 border-sky-300", icon: Globe },
  mixed: { label: "MIXTE", color: "bg-amber-100 text-amber-700 border-amber-300", icon: Layers },
};

/* ═══════════════════════════════════════════════════════════
   KPI CARDS CONFIG
   ═══════════════════════════════════════════════════════════ */

interface KPICard {
  id: string;
  label: string;
  icon: typeof Scale;
  bg: string;
  border: string;
  iconColor: string;
  statKey: keyof LogisticsStats;
  valueKey?: keyof LogisticsStats;
  suffix?: string;
  filterStatus?: string;
  filterPayment?: string;
}

const KPI_CARDS: KPICard[] = [
  {
    id: "to_weigh",
    label: "À peser",
    icon: Scale,
    bg: "bg-orange-50",
    border: "border-orange-200",
    iconColor: "text-orange-600",
    statKey: "to_weigh",
    valueKey: "to_weigh_value",
    suffix: "FCFA",
    filterStatus: "awaiting_weighing",
  },
  {
    id: "awaiting_pay",
    label: "Attente paiement",
    icon: DollarSign,
    bg: "bg-amber-50",
    border: "border-amber-200",
    iconColor: "text-amber-600",
    statKey: "awaiting_payment",
    valueKey: "awaiting_payment_value",
    suffix: "FCFA",
    filterPayment: "pending",
  },
  {
    id: "to_ship",
    label: "À expédier",
    icon: Truck,
    bg: "bg-cyan-50",
    border: "border-cyan-200",
    iconColor: "text-cyan-600",
    statKey: "to_ship",
    valueKey: "to_ship_destinations",
    suffix: "dest.",
    filterStatus: "validated",
  },
  {
    id: "shipped",
    label: "Expédiées",
    icon: Plane,
    bg: "bg-violet-50",
    border: "border-violet-200",
    iconColor: "text-violet-600",
    statKey: "shipped",
    valueKey: "shipped_destinations",
    suffix: "dest.",
    filterStatus: "shipped",
  },
];

/* ═══════════════════════════════════════════════════════════
   TIMELINE WORKFLOW
   ═══════════════════════════════════════════════════════════ */

const WORKFLOW_STEPS = [
  { key: "order", label: "Commande", icon: Package, color: "bg-amber-500" },
  { key: "warehouse", label: "Entrepôt", icon: Warehouse, color: "bg-gray-500" },
  { key: "weighing", label: "Pesée", icon: Scale, color: "bg-orange-500" },
  { key: "sent", label: "Envoyé client", icon: ArrowRight, color: "bg-purple-500" },
  { key: "payment", label: "Paiement", icon: Banknote, color: "bg-emerald-500" },
  { key: "validation", label: "Validé", icon: UserCheck, color: "bg-cyan-500" },
  { key: "shipping", label: "Expédié", icon: Ship, color: "bg-violet-500" },
  { key: "delivered", label: "Livré", icon: CheckCircle, color: "bg-blue-500" },
];

function WorkflowTimeline({ row }: { row: LogisticsOrderRow }) {
  const getStepState = (stepKey: string): "done" | "active" | "pending" => {
    const ls = row.logistics_status;
    const ps = row.payment_status;
    const os = row.order_status;
    switch (stepKey) {
      case "order":
        return "done";
      case "warehouse":
        return ls && ls !== "pending_arrival"
          ? "done"
          : os === "confirmed"
            ? "active"
            : "pending";
      case "weighing":
        return ls &&
          ["fees_calculated", "awaiting_client_validation", "validated", "ready_to_ship", "shipped"].includes(ls)
          ? "done"
          : ls === "awaiting_weighing"
            ? "active"
            : "pending";
      case "sent":
        return ls && ["awaiting_client_validation", "validated", "ready_to_ship", "shipped"].includes(ls)
          ? "done"
          : ls === "fees_calculated"
            ? "active"
            : "pending";
      case "payment":
        return ps === "confirmed"
          ? "done"
          : ps === "paid" || ps === "partial"
            ? "active"
            : "pending";
      case "validation":
        return ls && ["validated", "ready_to_ship", "shipped"].includes(ls)
          ? "done"
          : ls === "awaiting_client_validation"
            ? "active"
            : "pending";
      case "shipping":
        return ls === "shipped" ? "done" : ls === "ready_to_ship" ? "active" : "pending";
      case "delivered":
        return os === "delivered" ? "done" : ls === "shipped" ? "active" : "pending";
      default:
        return "pending";
    }
  };

  return (
    <div className="relative overflow-x-auto pb-2">
      <div className="flex items-center justify-between min-w-[600px]">
        {WORKFLOW_STEPS.map((step, i) => {
          const state = getStepState(step.key);
          const Icon = step.icon;
          return (
            <div key={step.key} className="flex flex-col items-center gap-1 relative z-10 flex-1">
              <div
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all shrink-0",
                  state === "done"
                    ? `${step.color} text-white border-transparent`
                    : state === "active"
                      ? `bg-white ${step.color.replace("bg-", "border-")} ${step.color.replace("bg-", "text-")}`
                      : "bg-gray-100 border-gray-300 text-gray-400",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <span
                className={cn(
                  "text-[9px] font-medium text-center w-14 leading-tight",
                  state === "done"
                    ? "text-gray-900"
                    : state === "active"
                      ? "text-gray-700"
                      : "text-gray-400",
                )}
              >
                {step.label}
              </span>
              {i < WORKFLOW_STEPS.length - 1 && (
                <div
                  className={cn(
                    "absolute top-4 left-1/2 w-full h-0.5 -z-10",
                    state === "done" ? "bg-emerald-400" : "bg-gray-200",
                  )}
                  style={{ width: "calc(100% - 16px)", left: "calc(50% + 16px)" }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   COMPONENT PRINCIPAL
   ═══════════════════════════════════════════════════════════ */

function LogisticsControlCenter() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [detailRow, setDetailRow] = useState<LogisticsOrderRow | null>(null);
  const [orderTypeFilter, setOrderTypeFilter] = useState<OrderType | "">("");
  const [showFilters, setShowFilters] = useState(false);
  const pageSize = 25;

  // Build filters from active stat card
  const extraFilters = (() => {
    const c = KPI_CARDS.find((s) => s.id === activeCard);
    if (!c) return {};
    return {
      ...(c.filterStatus ? { logisticsStatus: c.filterStatus } : {}),
      ...(c.filterPayment ? { paymentStatus: c.filterPayment } : {}),
    };
  })();

  // Query principale
  const { data, isLoading } = useQuery({
    queryKey: ["admin-logistics", page, search, activeCard, orderTypeFilter],
    queryFn: async () =>
      listLogisticsOrders({
        data: {
          page,
          pageSize,
          q: search,
          orderStatus: "",
          ...extraFilters,
          orderType: orderTypeFilter,
          dateFrom: null,
          dateTo: null,
        },
      }),
    enabled: isAdmin,
  });

  // Stats globales
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin-logistics-stats"],
    queryFn: () => getLogisticsStats({ data: {} }),
    enabled: isAdmin,
  });

  // Mutations
  const confirmPay = useMutation({
    mutationFn: async ({
      paymentId,
      assessmentId,
      amount,
    }: {
      paymentId?: string;
      assessmentId?: string;
      amount: number;
    }) => {
      await confirmShipmentPayment({
        data: { paymentId, assessmentId, amountConfirmed: amount },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-logistics"] });
      qc.invalidateQueries({ queryKey: ["admin-logistics-stats"] });
      toast.success("Paiement confirmé");
      setDetailRow(null);
    },
    onError: (e: Error) => toast.error(e.message || "Erreur"),
  });

  const createAssessment = useMutation({
    mutationFn: async (orderId: string) => {
      const result = await getOrCreateShipmentAssessment({
        data: { order_id: orderId },
      });
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-logistics"] });
      qc.invalidateQueries({ queryKey: ["admin-logistics-stats"] });
      toast.success("Évaluation créée");
    },
    onError: (e: Error) => toast.error(e.message || "Erreur"),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Truck className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-sm">Accès réservé aux administrateurs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ═══════ HEADER INTELLIGENT ═══════ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Centre de Contrôle Logistique
          </h1>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString("fr-FR")} commande{total > 1 ? "s" : ""} import · ERP
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Client, téléphone, N° commande, tracking…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
      </div>

      {/* ═══════ ALERTES INTELLIGENTES ═══════ */}
      {stats && stats.alerts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {stats.alerts.map((alert) => (
            <button
              key={alert.type}
              onClick={() => {
                if (alert.type === "blocked") {
                  setOrderTypeFilter("");
                }
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all hover:shadow-md",
                alert.type === "blocked" && "bg-red-50 border-red-200 text-red-700",
                alert.type === "urgent" && "bg-orange-50 border-orange-200 text-orange-700",
                alert.type === "no_tracking" && "bg-purple-50 border-purple-200 text-purple-700",
                alert.type === "warehouse_wait" && "bg-amber-50 border-amber-200 text-amber-700",
                alert.type === "payment_pending" && "bg-sky-50 border-sky-200 text-sky-700",
              )}
            >
              {alert.type === "blocked" && <AlertTriangle className="h-3.5 w-3.5" />}
              {alert.type === "urgent" && <Zap className="h-3.5 w-3.5" />}
              {alert.type === "no_tracking" && <Truck className="h-3.5 w-3.5" />}
              {alert.type === "warehouse_wait" && <Warehouse className="h-3.5 w-3.5" />}
              {alert.type === "payment_pending" && <DollarSign className="h-3.5 w-3.5" />}
              <strong>{alert.count}</strong> {alert.label}
            </button>
          ))}
        </div>
      )}

      {/* ═══════ KPI CARDS INTELLIGENTES ═══════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {KPI_CARDS.map((s) => {
          const Icon = s.icon;
          const active = activeCard === s.id;
          const count = (stats?.[s.statKey] as number) ?? 0;
          const value = s.valueKey ? ((stats?.[s.valueKey] as number) ?? 0) : 0;

          return (
            <button
              key={s.id}
              onClick={() => {
                setActiveCard(active ? null : s.id);
                setPage(1);
              }}
              className={cn(
                "rounded-xl border p-3 text-left transition-all hover:shadow-md",
                s.bg,
                s.border,
                active && "ring-2 ring-primary ring-offset-1",
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn("h-4 w-4", s.iconColor)} />
                <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">
                {statsLoading ? (
                  <span className="inline-block h-6 w-12 animate-pulse rounded bg-muted" />
                ) : (
                  count.toLocaleString("fr-FR")
                )}
              </p>
              {s.valueKey && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {value.toLocaleString("fr-FR")} {s.suffix}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* ═══════ RESTE À PAYER GLOBAL ═══════ */}
      <div className="flex items-center gap-2 rounded-lg border bg-red-50 border-red-200 px-3 py-2">
        <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
        <span className="text-sm text-red-700">
          Reste à payer global :{" "}
          <strong>{(stats?.total_remaining ?? 0).toLocaleString("fr-FR")} FCFA</strong>
          {stats && stats.partial_payment > 0 && (
            <span className="ml-2 text-orange-600">
              · {stats.partial_payment} paiement{stats.partial_payment > 1 ? "s" : ""} partiel
            </span>
          )}
        </span>
      </div>

      {/* ═══════ FILTRES HORIZONTAUX (mobile) ═══════ */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        {(["", "import", "mixed", "local"] as const).map((type) => {
          const config = type === "" ? null : ORDER_TYPE_CONFIG[type];
          const active = orderTypeFilter === type;
          return (
            <button
              key={type}
              onClick={() => {
                setOrderTypeFilter(active ? "" : type);
                setPage(1);
              }}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-all",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-white text-muted-foreground border-gray-200 hover:border-gray-300",
              )}
            >
              {type === "" ? "Tous" : config?.label}
            </button>
          );
        })}
        {activeCard && (
          <button
            onClick={() => {
              setActiveCard(null);
              setPage(1);
            }}
            className="shrink-0 flex items-center gap-1 rounded-full bg-gray-100 border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 transition-all"
          >
            <X className="h-3 w-3" /> Filtre actif
          </button>
        )}
      </div>

      {/* ═══════ DESKTOP: TABLEAU ERP ═══════ */}
      <div className="hidden md:block rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/60">
                {[
                  "Type",
                  "Commande",
                  "Client",
                  "Statut",
                  "Logistique",
                  "Paiement",
                  "Produits",
                  "Total",
                  "Frais",
                  "Payé",
                  "Reste",
                  "Tracking",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-2 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground text-[10px]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={13} className="py-8 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-8 text-center text-muted-foreground">
                    <Box className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    Aucune commande import
                  </td>
                </tr>
              ) : (
                rows.map((r) => <DesktopRow key={r.order_id} row={r} onView={() => setDetailRow(r)} />)
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-3 py-2">
            <span className="text-xs text-muted-foreground">
              Page {page}/{totalPages} · {total} résultats
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ═══════ MOBILE: CARDS COMPACTES ═══════ */}
      <div className="md:hidden space-y-3">
        {rows.length === 0 && !isLoading && (
          <div className="text-center py-8 text-muted-foreground">
            <Box className="h-8 w-8 mx-auto mb-2 opacity-30" />
            Aucune commande import
          </div>
        )}
        {rows.map((r) => (
          <MobileLogisticsCard key={r.order_id} row={r} onView={() => setDetailRow(r)} />
        ))}
      </div>

      {/* ═══════ DIALOG DÉTAIL + TIMELINE ═══════ */}
      {detailRow && (
        <Dialog open onOpenChange={() => setDetailRow(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto gap-0 p-0">
            <DialogHeader className="p-4 pb-3 border-b">
              <DialogTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                Commande #{detailRow.order_id.slice(0, 8)}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-muted-foreground">
                  {detailRow.customer_name} · {detailRow.customer_phone}
                </p>
                <OrderTypeBadge type={detailRow.order_type} />
              </div>
            </DialogHeader>

            <div className="p-4 space-y-5">
              {/* Urgence */}
              {detailRow.days_pending > 7 && (
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
                    detailRow.days_pending > 14
                      ? "bg-red-50 border-red-200 text-red-700"
                      : "bg-orange-50 border-orange-200 text-orange-700",
                  )}
                >
                  {detailRow.days_pending > 14 ? (
                    <Zap className="h-3.5 w-3.5" />
                  ) : (
                    <Clock className="h-3.5 w-3.5" />
                  )}
                  {detailRow.days_pending} jours d'attente
                </div>
              )}

              {/* Timeline */}
              <section>
                <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-3">
                  Workflow
                </p>
                <WorkflowTimeline row={detailRow} />
              </section>

              {/* Statuts */}
              <div className="flex flex-wrap gap-2">
                {detailRow.order_status && <SB config={ORDER_S[detailRow.order_status]} />}
                {detailRow.logistics_status && <SB config={LOG_S[detailRow.logistics_status]} />}
                {detailRow.payment_status && <SB config={PAY_S[detailRow.payment_status]} />}
              </div>

              {/* Financier */}
              <section className="rounded-xl border bg-muted/30 p-3 space-y-2">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">
                  Financier
                </p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Produits</span>
                  <span>{fmtN(detailRow.order_total)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Frais transport</span>
                  <span>{fmtN(detailRow.total_shipping_fees)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Payé</span>
                  <span className="text-emerald-600">{fmtN(detailRow.amount_paid)}</span>
                </div>
                <div className="border-t pt-1 flex justify-between font-bold text-sm">
                  <span>Reste à payer</span>
                  <span
                    className={
                      (detailRow.amount_remaining ?? 0) > 0 ? "text-red-600" : "text-emerald-600"
                    }
                  >
                    {fmtN(detailRow.amount_remaining)}
                  </span>
                </div>
              </section>

              {/* Poids */}
              {(detailRow.real_weight_kg || detailRow.volumetric_weight_kg) && (
                <section className="rounded-xl border bg-muted/30 p-3 space-y-1">
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">
                    Poids
                  </p>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Réel</span>
                    <span>{detailRow.real_weight_kg ?? "—"} kg</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Volumétrique</span>
                    <span>{detailRow.volumetric_weight_kg ?? "—"} kg</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium">
                    <span>Facturable</span>
                    <span>{detailRow.chargeable_weight_kg ?? "—"} kg</span>
                  </div>
                </section>
              )}

              {/* Entrepôt */}
              {(detailRow.warehouse_location || detailRow.agent_name) && (
                <section className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Warehouse className="h-3.5 w-3.5" />
                  {detailRow.warehouse_location && <span>{detailRow.warehouse_location}</span>}
                  {detailRow.agent_name && <span>· Agent: {detailRow.agent_name}</span>}
                </section>
              )}

              {/* Tracking */}
              {detailRow.tracking_number && (
                <section className="rounded-xl border bg-muted/30 p-3 space-y-1">
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">
                    Tracking
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono">{detailRow.tracking_number}</span>
                  </div>
                  {detailRow.carrier_name && (
                    <div className="text-xs text-muted-foreground">
                      Transporteur: {detailRow.carrier_name}
                    </div>
                  )}
                </section>
              )}

              {/* Dates */}
              <section className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                {detailRow.warehouse_received_at && (
                  <div>Réception: {fmtD(detailRow.warehouse_received_at)}</div>
                )}
                {detailRow.weighed_at && <div>Pesée: {fmtD(detailRow.weighed_at)}</div>}
                {detailRow.shipped_at && <div>Expédition: {fmtD(detailRow.shipped_at)}</div>}
                {detailRow.estimated_arrival_at && (
                  <div>Arrivée est.: {fmtD(detailRow.estimated_arrival_at)}</div>
                )}
              </section>

              {/* Actions */}
              <section className="flex flex-wrap gap-2 pt-2 border-t">
                {!detailRow.assessment_id && (
                  <Button
                    size="sm"
                    onClick={() => createAssessment.mutate(detailRow.order_id)}
                    disabled={createAssessment.isPending}
                  >
                    <Scale className="h-4 w-4 mr-1" /> Créer évaluation
                  </Button>
                )}
                {detailRow.assessment_id &&
                  (detailRow.payment_status === "pending" ||
                    detailRow.payment_status === "partial") &&
                  (detailRow.amount_remaining ?? 0) > 0 && (
                    <Button
                      size="sm"
                      onClick={() =>
                        confirmPay.mutate({
                          assessmentId: detailRow.assessment_id,
                          amount: detailRow.amount_remaining ?? 0,
                        })
                      }
                      disabled={confirmPay.isPending}
                    >
                      <Receipt className="h-4 w-4 mr-1" /> Confirmer paiement
                    </Button>
                  )}
                {detailRow.customer_phone && (
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={`https://wa.me/${detailRow.customer_phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Phone className="h-4 w-4 mr-1" /> WhatsApp
                    </a>
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setDetailRow(null)}>
                  <Ban className="h-4 w-4 mr-1" /> Fermer
                </Button>
              </section>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   DESKTOP ROW
   ═══════════════════════════════════════════════════════════ */

function DesktopRow({ row, onView }: { row: LogisticsOrderRow; onView: () => void }) {
  const hasRemaining = (row.amount_remaining ?? 0) > 0;
  const isUrgent = row.days_pending > 14;
  const isBlocked = row.days_pending > 7 && row.logistics_status !== "shipped";

  return (
    <tr
      className={cn(
        "border-b hover:bg-muted/20 transition-colors",
        isUrgent && "bg-red-50/50",
        isBlocked && !isUrgent && "bg-orange-50/30",
      )}
    >
      {/* Type */}
      <td className="px-2 py-1.5">
        <OrderTypeBadge type={row.order_type} size="sm" />
      </td>

      {/* Commande */}
      <td className="px-2 py-1.5">
        <span className="font-mono">#{row.order_id.slice(0, 8)}</span>
        <p className="text-[9px] text-muted-foreground">{fmtD(row.order_created_at)}</p>
        {row.days_pending > 5 && (
          <p className={cn("text-[9px] font-medium", isUrgent ? "text-red-600" : "text-orange-600")}>
            {row.days_pending}j
          </p>
        )}
      </td>

      {/* Client */}
      <td className="px-2 py-1.5">
        <p className="font-medium truncate max-w-[120px]">{row.customer_name ?? "—"}</p>
        <p className="text-[9px] text-muted-foreground">{row.customer_phone ?? "—"}</p>
      </td>

      {/* Statut commande */}
      <td className="px-2 py-1.5">{row.order_status && <SB config={ORDER_S[row.order_status]} />}</td>

      {/* Statut logistique */}
      <td className="px-2 py-1.5">
        {row.assessment_id ? (
          row.logistics_status && <SB config={LOG_S[row.logistics_status]} />
        ) : (
          <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium border bg-gray-100 text-gray-500 border-gray-300">
            À créer
          </span>
        )}
      </td>

      {/* Paiement */}
      <td className="px-2 py-1.5">
        {row.payment_status && row.total_shipping_fees ? (
          <SB config={PAY_S[row.payment_status]} />
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>

      {/* Produits */}
      <td className="px-2 py-1.5 text-right">{row.item_count}</td>

      {/* Total */}
      <td className="px-2 py-1.5 text-right font-medium">{fmtN(row.order_total)}</td>

      {/* Frais */}
      <td className="px-2 py-1.5 text-right">{row.total_shipping_fees ? fmtN(row.total_shipping_fees) : "—"}</td>

      {/* Payé */}
      <td className="px-2 py-1.5 text-right text-emerald-600">
        {row.total_shipping_fees ? fmtN(row.amount_paid) : "—"}
      </td>

      {/* Reste */}
      <td className="px-2 py-1.5 text-right">
        <span className={cn("font-medium", hasRemaining ? "text-red-600" : "text-emerald-600")}>
          {row.total_shipping_fees ? fmtN(row.amount_remaining) : "—"}
        </span>
      </td>

      {/* Tracking */}
      <td className="px-2 py-1.5">
        {row.tracking_number ? (
          <span className="font-mono text-[9px]">{row.tracking_number}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* Actions */}
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onView} title="Détails">
            <Eye className="h-3 w-3" />
          </Button>
          {row.customer_phone && (
            <a
              href={`https://wa.me/${row.customer_phone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-emerald-50 text-emerald-600"
              title="WhatsApp"
            >
              <Phone className="h-3 w-3" />
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════════
   MOBILE CARD
   ═══════════════════════════════════════════════════════════ */

function MobileLogisticsCard({
  row,
  onView,
}: {
  row: LogisticsOrderRow;
  onView: () => void;
}) {
  const hasRemaining = (row.amount_remaining ?? 0) > 0;
  const isUrgent = row.days_pending > 14;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3 space-y-2",
        isUrgent && "border-red-300 bg-red-50/30",
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs">#{row.order_id.slice(0, 8)}</span>
            <OrderTypeBadge type={row.order_type} size="sm" />
          </div>
          <p className="text-xs font-medium truncate">{row.customer_name ?? "—"}</p>
          <p className="text-[10px] text-muted-foreground">{row.customer_phone}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {row.order_status && <SB config={ORDER_S[row.order_status]} />}
          {row.logistics_status && <SB config={LOG_S[row.logistics_status]} />}
        </div>
      </div>

      {/* Infos rapides */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-[10px] text-muted-foreground">Produits</p>
          <p className="font-medium">{row.item_count}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Total</p>
          <p className="font-medium">{fmtN(row.order_total)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">
            {row.days_pending > 0 ? `${row.days_pending}j` : "Date"}
          </p>
          <p className="text-muted-foreground">{fmtD(row.order_created_at)}</p>
        </div>
      </div>

      {/* Financier */}
      {row.total_shipping_fees ? (
        <div className="grid grid-cols-3 gap-2 text-xs border-t pt-2">
          <div>
            <p className="text-[10px] text-muted-foreground">Frais</p>
            <p>{fmtN(row.total_shipping_fees)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Payé</p>
            <p className="text-emerald-600">{fmtN(row.amount_paid)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Reste</p>
            <p className={cn("font-bold", hasRemaining ? "text-red-600" : "text-emerald-600")}>
              {fmtN(row.amount_remaining)}
            </p>
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground border-t pt-2">
          Évaluation logistique à créer
        </div>
      )}

      {/* Tracking */}
      {row.tracking_number && (
        <div className="flex items-center gap-1 text-xs">
          <Truck className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono text-[10px]">{row.tracking_number}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={onView}>
          <Eye className="h-3 w-3 mr-1" /> Détails
        </Button>
        {row.customer_phone && (
          <Button size="sm" variant="outline" className="h-7 text-xs flex-1" asChild>
            <a
              href={`https://wa.me/${row.customer_phone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Phone className="h-3 w-3 mr-1" /> WhatsApp
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   HELPERS COMPONENTS
   ═══════════════════════════════════════════════════════════ */

function SB({ config }: { config: { label: string; color: string } }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium border",
        config.color,
      )}
    >
      {config.label}
    </span>
  );
}

function OrderTypeBadge({
  type,
  size = "default",
}: {
  type: OrderType;
  size?: "default" | "sm";
}) {
  const config = ORDER_TYPE_CONFIG[type];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border font-medium",
        config.color,
        size === "sm" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]",
      )}
    >
      <Icon className={cn(size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3")} />
      {config.label}
    </span>
  );
}

function fmtN(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
}

function fmtD(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}
