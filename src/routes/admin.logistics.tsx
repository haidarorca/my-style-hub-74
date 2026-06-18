// @ts-nocheck
/**
 * admin.logistics.tsx — ERP Logistique Kawzone v2
 *
 * Améliorations :
 * - Archivage auto : commandes livrées/validées cachées par défaut
 * - Filtres Excel-like par colonne
 * - Commission traçable (historique paiements)
 * - Système de retours visible
 * - Notifications client intégrées
 * - Validation pesée corrigée
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  listLogisticsOrders, confirmShipmentPayment, getLogisticsStats,
  updateShipmentAssessment, sendClientNotification, createOrderReturn,
  type LogisticsOrderRow, type LogisticsStats, type OrderType,
} from "@/lib/admin-logistics.functions";
import { getOrCreateShipmentAssessment } from "@/lib/shipment-assessments.functions";
import { listShippingServices, type ShippingService } from "@/lib/shipping-services.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Search, Scale, DollarSign, Package, Truck, Plane, ChevronLeft, ChevronRight,
  Loader2, Eye, CheckCircle, AlertCircle, CreditCard, Box, Phone, Ban,
  Warehouse, UserCheck, Ship, Receipt, Globe, MapPin, Layers, Clock, Zap,
  TrendingUp, Filter, X, BarChart3, ChevronDown, RotateCcw, Bell, Undo2,
  FileText, ArrowDownToLine, History, Plus, PackageCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WeightAnomalyPanel } from "@/components/admin/WeightAnomalyPanel";

export const Route = createFileRoute("/admin/logistics")({
  component: LogisticsControlCenter,
});

/* ═══════════════════════════════════════════════════════════
   CONFIGS STATUTS
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
const ORDER_TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof Globe }> = {
  local: { label: "LOCAL", color: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: MapPin },
  import: { label: "IMPORT", color: "bg-sky-100 text-sky-700 border-sky-300", icon: Globe },
  mixed: { label: "MIXTE", color: "bg-amber-100 text-amber-700 border-amber-300", icon: Layers },
};

const ARCHIVED_STATUSES = ["delivered", "validated", "shipped"];
const isArchived = (row: LogisticsOrderRow) =>
  ARCHIVED_STATUSES.includes(row.order_status) || ARCHIVED_STATUSES.includes(row.logistics_status ?? "");

/* ═══════════════════════════════════════════════════════════
   WORKFLOW TIMELINE
   ═══════════════════════════════════════════════════════════ */

const WORKFLOW_STEPS = [
  { key: "order", label: "Commande", icon: Package, color: "bg-amber-500" },
  { key: "warehouse", label: "Entrepôt", icon: Warehouse, color: "bg-gray-500" },
  { key: "weighing", label: "Pesée", icon: Scale, color: "bg-orange-500" },
  { key: "sent", label: "Envoyé client", icon: Truck, color: "bg-purple-500" },
  { key: "payment", label: "Paiement", icon: CreditCard, color: "bg-emerald-500" },
  { key: "validation", label: "Validé", icon: UserCheck, color: "bg-cyan-500" },
  { key: "shipping", label: "Expédié", icon: Ship, color: "bg-violet-500" },
  { key: "delivered", label: "Livré", icon: CheckCircle, color: "bg-blue-500" },
];

const WORKFLOW_STEPS_DECLARED = [
  { key: "order", label: "Commande", icon: Package, color: "bg-amber-500" },
  { key: "warehouse", label: "Réception", icon: Warehouse, color: "bg-gray-500" },
  { key: "verification", label: "Vérification", icon: Scale, color: "bg-cyan-500" },
  { key: "shipping", label: "Expédié", icon: Ship, color: "bg-violet-500" },
  { key: "delivered", label: "Livré", icon: CheckCircle, color: "bg-blue-500" },
];

function WorkflowTimeline({ row }: { row: LogisticsOrderRow }) {
  const declaredCircuit = row.weight_status === "declared" || row.weight_status === "verified" || row.weight_status === "anomaly";
  const getStepState = (stepKey: string): "done" | "active" | "pending" => {
    const ls = row.logistics_status;
    const ps = row.payment_status;
    const os = row.order_status;
    switch (stepKey) {
      case "order": return "done";
      case "warehouse": return ls && ls !== "pending_arrival" ? "done" : os === "confirmed" ? "active" : "pending";
      case "weighing": return ls && ["fees_calculated", "awaiting_client_validation", "validated", "ready_to_ship", "shipped"].includes(ls) ? "done" : ls === "awaiting_weighing" ? "active" : "pending";
      case "sent": return ls && ["awaiting_client_validation", "validated", "ready_to_ship", "shipped"].includes(ls) ? "done" : ls === "fees_calculated" ? "active" : "pending";
      case "payment": return ps === "confirmed" ? "done" : ps === "paid" || ps === "partial" ? "active" : "pending";
      case "validation": return ls && ["validated", "ready_to_ship", "shipped"].includes(ls) ? "done" : ls === "awaiting_client_validation" ? "active" : "pending";
      case "shipping": return ls === "shipped" ? "done" : ls === "ready_to_ship" ? "active" : "pending";
      case "delivered": return os === "delivered" ? "done" : ls === "shipped" ? "active" : "pending";
      case "verification": return ls && ["ready_to_ship", "shipped"].includes(ls) ? "done" : ls === "fees_calculated" ? "active" : "pending";
      default: return "pending";
    }
  };
  const steps = declaredCircuit ? WORKFLOW_STEPS_DECLARED : WORKFLOW_STEPS;
  return (
    <div className="relative overflow-x-auto pb-2">
      <div className="flex items-center justify-between min-w-[600px]">
        {steps.map((step, i) => {
          const state = getStepState(step.key);
          const Icon = step.icon;
          return (
            <div key={step.key} className="flex flex-col items-center gap-1 relative z-10 flex-1">
              <div className={cn("h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all shrink-0",
                state === "done" ? `${step.color} text-white border-transparent` :
                state === "active" ? `bg-white ${step.color.replace("bg-", "border-")} ${step.color.replace("bg-", "text-")}` :
                "bg-gray-100 border-gray-300 text-gray-400")}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <span className={cn("text-[9px] font-medium text-center w-14 leading-tight", state === "done" ? "text-gray-900" : state === "active" ? "text-gray-700" : "text-gray-400")}>{step.label}</span>
              {i < WORKFLOW_STEPS.length - 1 && (
                <div className={cn("absolute top-4 left-1/2 w-full h-0.5 -z-10", state === "done" ? "bg-emerald-400" : "bg-gray-200")} style={{ width: "calc(100% - 16px)", left: "calc(50% + 16px)" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   EXCEL-LIKE COLUMN FILTER
   ═══════════════════════════════════════════════════════════ */

function ColumnFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);
  return (
    <div className="relative inline-block" ref={ref}>
      <button onClick={() => setOpen(!open)} className={cn("flex items-center gap-0.5 text-[10px] uppercase tracking-wider font-semibold hover:text-primary transition-colors", value ? "text-primary" : "text-muted-foreground")}>
        {label} <Filter className="h-2.5 w-2.5" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[140px] rounded-lg border bg-popover shadow-lg p-1.5 space-y-0.5">
          <button onClick={() => { onChange(""); setOpen(false); }} className={cn("w-full text-left px-2 py-1 rounded text-xs transition-colors", !value ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted")}>
            Tous
          </button>
          {options.map((opt) => (
            <button key={opt} onClick={() => { onChange(opt); setOpen(false); }} className={cn("w-full text-left px-2 py-1 rounded text-xs transition-colors", value === opt ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted")}>
              {opt}
            </button>
          ))}
        </div>
      )}
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
  const [showArchived, setShowArchived] = useState(false);
  const [uuidInput, setUuidInput] = useState("");
  const pageSize = 25;

  // Filtres Excel-like par colonne
  const [filterType, setFilterType] = useState("");
  const [filterLogStatus, setFilterLogStatus] = useState("");
  const [filterPayStatus, setFilterPayStatus] = useState("");
  const [filterOrderStatus, setFilterOrderStatus] = useState("");

  // Filtre logistique effectif : la carte KPI prime sur le filtre manuel
  const effectiveLogStatus = useMemo(() => {
    if (!activeCard) return filterLogStatus;
    return activeCard === "to_weigh" ? "awaiting_weighing"
      : activeCard === "to_ship" ? "validated"
      : activeCard === "shipped" ? "shipped"
      : filterLogStatus;
  }, [activeCard, filterLogStatus]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-logistics", page, search, activeCard, showArchived, filterType, effectiveLogStatus, filterPayStatus, filterOrderStatus],
    queryFn: async () => {
      const result = await listLogisticsOrders({
        data: { page, pageSize, q: search, orderStatus: filterOrderStatus, logisticsStatus: effectiveLogStatus, paymentStatus: filterPayStatus, orderType: filterType as "local" | "import" | "mixed" | "", hasRemaining: null, dateFrom: null, dateTo: null, includeArchived: showArchived },
      });
      return result;
    },
    enabled: isAdmin,
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-logistics-stats"],
    queryFn: () => getLogisticsStats({ data: {} }),
    enabled: isAdmin,
  });

  const confirmPay = useMutation({
    mutationFn: async ({ paymentId, assessmentId, amount }: { paymentId?: string; assessmentId?: string; amount: number }) => {
      await confirmShipmentPayment({ data: { paymentId, assessmentId, amountConfirmed: amount } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-logistics"] }); qc.invalidateQueries({ queryKey: ["admin-logistics-stats"] }); toast.success("Paiement confirmé"); setDetailRow(null); },
    onError: (e: Error) => toast.error(e.message || "Erreur"),
  });

  const createAssessment = useMutation({
    mutationFn: async (orderId: string) => {
      const result = await getOrCreateShipmentAssessment({ data: { order_id: orderId } });
      return result;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-logistics"] }); qc.invalidateQueries({ queryKey: ["admin-logistics-stats"] }); toast.success("Évaluation créée"); },
    onError: (e: Error) => toast.error(e.message || "Erreur"),
  });

  // MUTATION : Envoyer frais au client (notification)
  const sendNotification = useMutation({
    mutationFn: async ({ orderId, amount, message }: { orderId: string; amount: number; message: string }) => {
      await sendClientNotification({ data: { order_id: orderId, amount, message, type: "payment_required" } });
    },
    onSuccess: () => { toast.success("Notification envoyée au client"); },
    onError: (e: Error) => toast.error(e.message || "Erreur"),
  });

  // MUTATION : Créer un retour
  const createReturn = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      await createOrderReturn({ data: { order_id: orderId, reason } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-logistics"] }); toast.success("Retour créé"); },
    onError: (e: Error) => toast.error(e.message || "Erreur"),
  });

  // MUTATION : Valider la pesée (correction) avec frais auto
  const validateWeighing = useMutation({
    mutationFn: async ({ assessmentId, realWeight, volumetricWeight, length, width, height, airFreightFee, serviceFee }: { assessmentId: string; realWeight: number; volumetricWeight: number; length: number; width: number; height: number; airFreightFee: number; serviceFee: number }) => {
      await updateShipmentAssessment({
        data: {
          assessment_id: assessmentId,
          real_weight_kg: realWeight,
          volumetric_weight_kg: volumetricWeight,
          length_cm: length,
          width_cm: width,
          height_cm: height,
          air_freight_fee: airFreightFee > 0 ? airFreightFee : undefined,
          service_fee: serviceFee > 0 ? serviceFee : undefined,
          status: "fees_calculated",
        },
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-logistics"] }); qc.invalidateQueries({ queryKey: ["admin-logistics-stats"] }); toast.success("Pesée validée — frais calculés"); setDetailRow(null); },
    onError: (e: Error) => toast.error(e.message || "Erreur"),
  });

  // MUTATION : Sauvegarde rapide (photo, commentaire, service)
  const quickSave = useMutation({
    mutationFn: async ({ assessmentId, parcelPhotoUrl, adminComment, serviceId }: { assessmentId: string; parcelPhotoUrl: string; adminComment: string; serviceId: string | null }) => {
      await updateShipmentAssessment({
        data: {
          assessment_id: assessmentId,
          parcel_photo_url: parcelPhotoUrl || null,
          admin_comment: adminComment || null,
          shipping_service_id: serviceId,
        },
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-logistics"] }); toast.success("Sauvegardé"); },
    onError: (e: Error) => toast.error(e.message || "Erreur"),
  });

  // MUTATION : Changer le statut logistique (prêt à embarquer / expédié / retour pesée)
  const updateStatus = useMutation({
    mutationFn: async ({ assessmentId, status }: { assessmentId: string; status: string }) => {
      await updateShipmentAssessment({
        data: { assessment_id: assessmentId, status: status as any },
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-logistics"] });
      qc.invalidateQueries({ queryKey: ["admin-logistics-stats"] });
      const labels: Record<string, string> = {
        ready_to_ship: "Prêt à embarquer",
        shipped: "Expédié",
        awaiting_weighing: "Retour à la pesée",
      };
      toast.success(labels[vars.status] || "Statut mis à jour");
    },
    onError: (e: Error) => toast.error(e.message || "Erreur"),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  // Options hardcodées pour filtres Excel (indépendantes des données paginées)
  const uniqueTypes = ["local", "import", "mixed"];
  const uniqueLogStatuses = ["pending_arrival", "awaiting_weighing", "fees_calculated", "awaiting_client_validation", "validated", "ready_to_ship", "shipped"];
  const uniquePayStatuses = ["pending", "partial", "paid", "confirmed", "waived"];
  const uniqueOrderStatuses = ["new", "confirmed", "processing", "shipped", "delivered", "cancelled"];

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
      {/* Anomalies poids — file prioritaire */}
      <WeightAnomalyPanel />
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Centre de Contrôle Logistique
          </h1>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString("fr-FR")} commande{total > 1 ? "s" : ""} · {rows.filter((r) => !isArchived(r)).length} active{rows.filter((r) => !isArchived(r)).length > 1 ? "s" : ""}
            {!showArchived && <span className="text-muted-foreground"> · archivages masquées</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Client, téléphone, N° commande, tracking…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
          </div>
          {/* Saisie UUID manuelle */}
          <div className="flex items-center gap-1">
            <Input
              placeholder="ID commande (UUID)"
              value={uuidInput}
              onChange={(e) => setUuidInput(e.target.value)}
              className="w-48 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const id = uuidInput.trim();
                if (!/^[0-9a-f-]{36}$/i.test(id)) { toast.error("UUID invalide (36 caractères requis)"); return; }
                createAssessment.mutate(id);
                setUuidInput("");
              }}
              disabled={createAssessment.isPending || !uuidInput.trim()}
            >
              {createAssessment.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Toggle archivage */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={showArchived} onCheckedChange={(v) => { setShowArchived(!!v); setPage(1); }} />
          <span className={cn(showArchived ? "text-primary font-medium" : "text-muted-foreground")}>
            <History className="h-3.5 w-3.5 inline mr-1" />
            Afficher les commandes archivées (livrées/validées)
          </span>
        </label>
        {showArchived && (
          <Badge variant="secondary" className="text-xs">{total} archivée{total > 1 ? "s" : ""} affichée{total > 1 ? "s" : ""}</Badge>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { id: "to_weigh", label: "À peser", icon: Scale, bg: "bg-orange-50", border: "border-orange-200", iconColor: "text-orange-600", filterStatus: "awaiting_weighing" },
          { id: "awaiting_pay", label: "Attente paiement", icon: DollarSign, bg: "bg-amber-50", border: "border-amber-200", iconColor: "text-amber-600", filterPayment: "pending" },
          { id: "to_ship", label: "À expédier", icon: Truck, bg: "bg-cyan-50", border: "border-cyan-200", iconColor: "text-cyan-600", filterStatus: "validated" },
          { id: "shipped", label: "Expédiées", icon: Plane, bg: "bg-violet-50", border: "border-violet-200", iconColor: "text-violet-600", filterStatus: "shipped" },
        ].map((s) => (
          <button
            key={s.id}
            onClick={() => { setActiveCard(activeCard === s.id ? null : s.id); setPage(1); }}
            className={cn("rounded-xl border p-3 text-left transition-all hover:shadow-md", s.bg, s.border, activeCard === s.id && "ring-2 ring-primary ring-offset-1")}
          >
            <div className="flex items-center gap-2 mb-2">
              <s.icon className={cn("h-4 w-4", s.iconColor)} />
              <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
            </div>
            <p className="text-2xl font-bold">
              {isLoading ? <span className="inline-block h-6 w-12 animate-pulse rounded bg-muted" /> :
                ((stats as any)?.[s.id === "to_weigh" ? "to_weigh" : s.id === "awaiting_pay" ? "awaiting_payment" : s.id === "to_ship" ? "to_ship" : "shipped"] ?? 0).toLocaleString("fr-FR")}
            </p>
          </button>
        ))}
      </div>

      {/* Reste à payer global */}
      <div className="flex items-center gap-2 rounded-lg border bg-red-50 border-red-200 px-3 py-2">
        <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
        <span className="text-sm text-red-700">
          Reste à payer global : <strong>{(stats as any)?.total_remaining?.toLocaleString("fr-FR") ?? 0} FCFA</strong>
          {(stats as any)?.partial_payment > 0 && <span className="ml-2 text-orange-600">· {(stats as any)?.partial_payment} paiement{(stats as any)?.partial_payment > 1 ? "s" : ""} partiel</span>}
        </span>
      </div>

      {/* DESKTOP: Tableau avec filtres Excel-like */}
      <div className="hidden md:block rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/60">
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">
                  <ColumnFilter label="Type" options={uniqueTypes} value={filterType} onChange={(v) => { setFilterType(v); setPage(1); }} />
                </th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">Commande</th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">Client</th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">
                  <ColumnFilter label="Statut" options={uniqueOrderStatuses} value={filterOrderStatus} onChange={(v) => { setFilterOrderStatus(v); setPage(1); }} />
                </th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">
                  <ColumnFilter label="Logistique" options={uniqueLogStatuses} value={filterLogStatus} onChange={(v) => { setFilterLogStatus(v); setPage(1); }} />
                </th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">
                  <ColumnFilter label="Paiement" options={uniquePayStatuses} value={filterPayStatus} onChange={(v) => { setFilterPayStatus(v); setPage(1); }} />
                </th>
                <th className="px-2 py-2 text-right font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">Total</th>
                <th className="px-2 py-2 text-right font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">Frais</th>
                <th className="px-2 py-2 text-right font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">Reste</th>
                <th className="px-2 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={10} className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="py-8 text-center text-muted-foreground"><Box className="h-8 w-8 mx-auto mb-2 opacity-30" />Aucune commande</td></tr>
              ) : (
                rows.map((r) => <DesktopRow key={r.order_id} row={r} onView={() => setDetailRow(r)} onCreateAssessment={() => createAssessment.mutate(r.order_id)} />)
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-3 py-2">
            <span className="text-xs text-muted-foreground">Page {page}/{totalPages} · {total} résultats</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft className="h-3 w-3" /></Button>
              <Button variant="outline" size="sm" className="h-7" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><ChevronRight className="h-3 w-3" /></Button>
            </div>
          </div>
        )}
      </div>

      {/* MOBILE: Cards */}
      <div className="md:hidden space-y-3">
        {rows.length === 0 && !isLoading && <div className="text-center py-8 text-muted-foreground"><Box className="h-8 w-8 mx-auto mb-2 opacity-30" />Aucune commande</div>}
        {rows.map((r) => (
          <MobileLogisticsCard key={r.order_id} row={r} onView={() => setDetailRow(r)} onCreateAssessment={() => createAssessment.mutate(r.order_id)} />
        ))}
      </div>

      {/* DIALOG DÉTAIL */}
      {detailRow && (
        <Dialog open onOpenChange={() => setDetailRow(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto gap-0 p-0">
            <DialogHeader className="p-4 pb-3 border-b">
              <DialogTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                Commande #{detailRow.order_id.slice(0, 8)}
                {isArchived(detailRow) && <Badge variant="outline" className="text-[9px] ml-2"><History className="h-2.5 w-2.5 mr-0.5" /> Archivée</Badge>}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <p className="text-xs text-muted-foreground">{detailRow.customer_name} · {detailRow.customer_phone}</p>
                <OrderTypeBadge type={detailRow.order_type} />
                {/* Badge retour si applicable */}
                {detailRow.order_status === "returned" && (
                  <Badge variant="destructive" className="text-[9px]"><Undo2 className="h-2.5 w-2.5 mr-0.5" /> Retour</Badge>
                )}
              </div>
            </DialogHeader>

            <div className="p-4 space-y-5">
              {/* Urgence */}
              {(detailRow.days_pending > 7) && (
                <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium", detailRow.days_pending > 14 ? "bg-red-50 border-red-200 text-red-700" : "bg-orange-50 border-orange-200 text-orange-700")}>
                  {detailRow.days_pending > 14 ? <Zap className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                  {detailRow.days_pending} jours d&apos;attente
                </div>
              )}

              {/* Timeline */}
              <section>
                <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-3">Workflow</p>
                <WorkflowTimeline row={detailRow} />
              </section>

              {/* Statuts */}
              <div className="flex flex-wrap gap-2">
                {detailRow.order_status && <SB config={safeOrderStatus(detailRow.order_status)} />}
                {detailRow.logistics_status && <SB config={safeLogStatus(detailRow.logistics_status)} />}
                {detailRow.payment_status && <SB config={safePayStatus(detailRow.payment_status)} />}
              </div>

              {/* Financier */}
              <section className="rounded-xl border bg-muted/30 p-3 space-y-2">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">Financier</p>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Produits</span><span>{fmtN(detailRow.order_total)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Frais transport</span><span>{fmtN(detailRow.total_shipping_fees)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Payé</span><span className="text-emerald-600">{fmtN(detailRow.amount_paid)}</span></div>
                <div className="border-t pt-1 flex justify-between font-bold text-sm">
                  <span>Reste à payer</span>
                  <span className={(detailRow.amount_remaining ?? 0) > 0 ? "text-red-600" : "text-emerald-600"}>{fmtN(detailRow.amount_remaining)}</span>
                </div>
                {/* Historique commission */}
                {detailRow.amount_paid && detailRow.amount_paid > 0 && detailRow.confirmed_at && (
                  <div className="text-[10px] text-muted-foreground border-t pt-1">
                    <FileText className="h-3 w-3 inline mr-1" />
                    Payé le {fmtD(detailRow.confirmed_at)} · Méthode : {detailRow.payment_method ?? "Non spécifiée"}
                    {detailRow.payment_reference && <span> · Réf : {detailRow.payment_reference}</span>}
                  </div>
                )}
              </section>

              {/* Photo colis */}
              {detailRow.parcel_photo_url && (
                <section className="rounded-xl border bg-muted/30 p-3 space-y-2">
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">Photo du colis</p>
                  <img src={detailRow.parcel_photo_url} alt="Colis" className="h-32 w-32 rounded-lg border object-cover" />
                </section>
              )}

              {/* Commentaire admin */}
              {detailRow.admin_comment && (
                <section className="rounded-xl border bg-muted/30 p-3">
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Commentaire admin</p>
                  <p className="text-xs text-muted-foreground">{detailRow.admin_comment}</p>
                </section>
              )}

              {/* Note client */}
              {detailRow.client_response_note && (
                <section className="rounded-xl border border-purple-200 bg-purple-50 p-3">
                  <p className="text-[10px] uppercase font-semibold text-purple-700 mb-1">Réponse client</p>
                  <p className="text-xs text-purple-800">{detailRow.client_response_note}</p>
                </section>
              )}

              {/* Poids */}
              {(detailRow.real_weight_kg || detailRow.volumetric_weight_kg) && (
                <section className="rounded-xl border bg-muted/30 p-3 space-y-1">
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">Poids</p>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Réel</span><span>{detailRow.real_weight_kg ?? "—"} kg</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Volumétrique</span><span>{detailRow.volumetric_weight_kg ?? "—"} kg</span></div>
                  <div className="flex justify-between text-xs font-medium"><span>Facturable</span><span>{detailRow.chargeable_weight_kg ?? "—"} kg</span></div>
                </section>
              )}

              {/* Section Pesée — VALIDATION */}
              {detailRow.logistics_status === "awaiting_weighing" && detailRow.assessment_id && (
                <WeighingValidationPanel
                  assessmentId={detailRow.assessment_id}
                  shippingServiceId={detailRow.shipping_service_id}
                  parcelPhotoUrl={detailRow.parcel_photo_url}
                  adminComment={detailRow.admin_comment}
                  onValidate={(data) => validateWeighing.mutate({ assessmentId: detailRow.assessment_id!, ...data })}
                  onQuickSave={(data) => quickSave.mutate({ assessmentId: detailRow.assessment_id!, ...data })}
                  isLoading={validateWeighing.isPending || quickSave.isPending}
                />
              )}

              {/* Tracking */}
              {detailRow.tracking_number && (
                <section className="rounded-xl border bg-muted/30 p-3 space-y-1">
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">Tracking</p>
                  <div className="flex items-center gap-2 text-xs"><Truck className="h-3.5 w-3.5 text-muted-foreground" /><span className="font-mono">{detailRow.tracking_number}</span></div>
                  {detailRow.carrier_name && <div className="text-xs text-muted-foreground">Transporteur: {detailRow.carrier_name}</div>}
                </section>
              )}

              {/* Dates */}
              <section className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                {detailRow.warehouse_received_at && <div>Réception: {fmtD(detailRow.warehouse_received_at)}</div>}
                {detailRow.weighed_at && <div>Pesée: {fmtD(detailRow.weighed_at)}</div>}
                {detailRow.shipped_at && <div>Expédition: {fmtD(detailRow.shipped_at)}</div>}
              </section>

              {/* Actions */}
              <section className="flex flex-wrap gap-2 pt-2 border-t">
                {!detailRow.assessment_id && (
                  <Button size="sm" onClick={() => createAssessment.mutate(detailRow.order_id)} disabled={createAssessment.isPending}>
                    <Scale className="h-4 w-4 mr-1" /> Créer évaluation
                  </Button>
                )}

                {/* Boutons états finaux logistique */}
                {detailRow.assessment_id && detailRow.logistics_status === "validated" && (
                  <Button size="sm" variant="default" onClick={() => updateStatus.mutate({ assessmentId: detailRow.assessment_id!, status: "ready_to_ship" })} disabled={updateStatus.isPending}>
                    <PackageCheck className="h-4 w-4 mr-1" /> Prêt à embarquer
                  </Button>
                )}
                {detailRow.assessment_id && detailRow.logistics_status === "ready_to_ship" && (
                  <Button size="sm" variant="default" className="bg-violet-600 hover:bg-violet-700" onClick={() => updateStatus.mutate({ assessmentId: detailRow.assessment_id!, status: "shipped" })} disabled={updateStatus.isPending}>
                    <Plane className="h-4 w-4 mr-1" /> Marquer expédié
                  </Button>
                )}
                {detailRow.assessment_id && detailRow.logistics_status === "rejected" && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ assessmentId: detailRow.assessment_id!, status: "awaiting_weighing" })} disabled={updateStatus.isPending}>
                    <RotateCcw className="h-4 w-4 mr-1" /> Revenir à pesée
                  </Button>
                )}

                {detailRow.assessment_id && (detailRow.payment_status === "pending" || detailRow.payment_status === "partial") && (detailRow.amount_remaining ?? 0) > 0 && (
                  <>
                    <Button size="sm" onClick={() => confirmPay.mutate({ assessmentId: detailRow.assessment_id!, amount: detailRow.amount_remaining ?? 0 })} disabled={confirmPay.isPending}>
                      <Receipt className="h-4 w-4 mr-1" /> Confirmer paiement
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => sendNotification.mutate({ orderId: detailRow.order_id, amount: detailRow.amount_remaining ?? 0, message: `Vos frais de transport s'élèvent à ${(detailRow.amount_remaining ?? 0).toLocaleString("fr-FR")} FCFA. Veuillez effectuer le paiement.` })} disabled={sendNotification.isPending}>
                      <Bell className="h-4 w-4 mr-1" /> Relancer client
                    </Button>
                  </>
                )}
                {detailRow.customer_phone && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`https://wa.me/${detailRow.customer_phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"><Phone className="h-4 w-4 mr-1" /> WhatsApp</a>
                  </Button>
                )}
                {/* Retour */}
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => createReturn.mutate({ orderId: detailRow.order_id, reason: "Retour client" })} disabled={createReturn.isPending}>
                  <Undo2 className="h-4 w-4 mr-1" /> Retour
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDetailRow(null)}><Ban className="h-4 w-4 mr-1" /> Fermer</Button>
              </section>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PANEL VALIDATION PESÉE
   ═══════════════════════════════════════════════════════════ */

function WeighingValidationPanel({
  assessmentId,
  shippingServiceId,
  parcelPhotoUrl,
  adminComment,
  onValidate,
  onQuickSave,
  isLoading,
}: {
  assessmentId: string;
  shippingServiceId: string | null;
  parcelPhotoUrl: string | null;
  adminComment: string | null;
  onValidate: (data: { realWeight: number; volumetricWeight: number; length: number; width: number; height: number; airFreightFee: number; serviceFee: number }) => void;
  onQuickSave: (data: { parcelPhotoUrl: string; adminComment: string; serviceId: string | null }) => void;
  isLoading: boolean;
}) {
  const listServicesFn = useServerFn(listShippingServices);
  const [services, setServices] = useState<ShippingService[]>([]);
  const [serviceId, setServiceId] = useState<string | null>(shippingServiceId);
  const [autoCalc, setAutoCalc] = useState(true);
  const [realWeight, setRealWeight] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [photoUrl, setPhotoUrl] = useState(parcelPhotoUrl ?? "");
  const [comment, setComment] = useState(adminComment ?? "");

  // Charger les services de transport
  useEffect(() => {
    listServicesFn({ data: { source_country_id: null, destination_country_id: null, only_enabled: true } })
      .then(setServices)
      .catch(() => setServices([]));
  }, [listServicesFn]);

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );

  const volumetricWeight = useMemo(() => {
    const l = parseFloat(length) || 0;
    const w = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    if (l > 0 && w > 0 && h > 0) {
      return (l * w * h) / 5000;
    }
    return 0;
  }, [length, width, height]);

  const chargeableWeight = useMemo(() => {
    const rw = parseFloat(realWeight) || 0;
    return Math.max(rw, volumetricWeight);
  }, [realWeight, volumetricWeight]);

  // Calcul auto frais avion : poids facturable × price_per_kg
  const autoAirFreight = useMemo(() => {
    if (!autoCalc || !selectedService || chargeableWeight <= 0) return 0;
    return Math.round(chargeableWeight * Number(selectedService.price_per_kg));
  }, [autoCalc, selectedService, chargeableWeight]);

  const autoServiceFee = useMemo(() => {
    if (!autoCalc || autoAirFreight <= 0) return 0;
    return Math.round(autoAirFreight * 0.1); // 10% frais de service
  }, [autoCalc, autoAirFreight]);

  const handleValidate = () => {
    const rw = parseFloat(realWeight);
    if (!rw || rw <= 0) { toast.error("Poids réel requis"); return; }
    const l = parseFloat(length);
    const w = parseFloat(width);
    const h = parseFloat(height);
    if (!l || !w || !h) { toast.error("Dimensions requises"); return; }
    onValidate({
      realWeight: rw,
      volumetricWeight,
      length: l,
      width: w,
      height: h,
      airFreightFee: autoCalc ? autoAirFreight : 0,
      serviceFee: autoCalc ? autoServiceFee : 0,
    });
  };

  const handleQuickSave = () => {
    onQuickSave({ parcelPhotoUrl: photoUrl, adminComment: comment, serviceId });
  };

  return (
    <section className="rounded-xl border border-orange-200 bg-orange-50 p-3 space-y-3">
      <p className="text-[10px] uppercase font-semibold text-orange-700 flex items-center gap-1"><Scale className="h-3 w-3" /> Validation pesée</p>

      {/* Sélection service transport */}
      <div>
        <label className="text-[10px] text-muted-foreground">Service de transport</label>
        <Select value={serviceId ?? ""} onValueChange={(v) => setServiceId(v || null)}>
          <SelectTrigger className="h-8 text-xs bg-white"><SelectValue placeholder="Choisir un service" /></SelectTrigger>
          <SelectContent>
            {services.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} — {Number(s.price_per_kg).toLocaleString("fr-FR")} FCFA/{s.pricing_unit}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedService && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            Calcul : MAX(poids réel, volumétrique) × {Number(selectedService.price_per_kg).toLocaleString("fr-FR")} FCFA/kg
          </p>
        )}
      </div>

      {/* Calcul auto toggle */}
      <label className="flex items-center gap-2 text-[11px] cursor-pointer">
        <Checkbox checked={autoCalc} onCheckedChange={(v) => setAutoCalc(!!v)} />
        <span className={autoCalc ? "text-orange-700 font-medium" : "text-muted-foreground"}>
          Calcul automatique des frais avion (poids × prix/kg)
        </span>
      </label>

      {/* Poids & dimensions */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground">Poids réel (kg)</label>
          <Input type="number" step="0.1" value={realWeight} onChange={(e) => setRealWeight(e.target.value)} placeholder="2.5" className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Longueur (cm)</label>
          <Input type="number" value={length} onChange={(e) => setLength(e.target.value)} placeholder="40" className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Largeur (cm)</label>
          <Input type="number" value={width} onChange={(e) => setWidth(e.target.value)} placeholder="30" className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Hauteur (cm)</label>
          <Input type="number" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="25" className="h-8 text-xs" />
        </div>
      </div>

      {/* Résultats calcul */}
      {volumetricWeight > 0 && (
        <div className="text-xs space-y-1 border-t border-orange-200 pt-2">
          <div className="flex justify-between"><span className="text-muted-foreground">Poids volumétrique</span><span>{volumetricWeight.toFixed(2)} kg</span></div>
          <div className="flex justify-between font-bold"><span>Poids facturable</span><span className="text-orange-700">{chargeableWeight.toFixed(2)} kg</span></div>
        </div>
      )}
      {autoCalc && autoAirFreight > 0 && (
        <div className="text-xs space-y-1 rounded-lg bg-emerald-50 border border-emerald-200 p-2">
          <div className="flex justify-between"><span className="text-muted-foreground">Frais avion (auto)</span><span className="font-medium">{autoAirFreight.toLocaleString("fr-FR")} FCFA</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Frais service (10%)</span><span className="font-medium">{autoServiceFee.toLocaleString("fr-FR")} FCFA</span></div>
          <div className="flex justify-between font-bold text-emerald-700"><span>Total frais</span><span>{(autoAirFreight + autoServiceFee).toLocaleString("fr-FR")} FCFA</span></div>
        </div>
      )}

      {/* Photo colis */}
      <div>
        <label className="text-[10px] text-muted-foreground">Photo du colis (URL)</label>
        <Input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://..." className="h-8 text-xs" />
        {photoUrl && <img src={photoUrl} alt="Colis" className="mt-1 h-20 w-20 rounded border object-cover" />}
      </div>

      {/* Commentaire admin */}
      <div>
        <label className="text-[10px] text-muted-foreground">Commentaire admin</label>
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Note interne..." rows={2} className="text-xs" />
      </div>

      {/* Bouton sauvegarde rapide */}
      <Button size="sm" variant="outline" className="w-full" onClick={handleQuickSave} disabled={isLoading}>
        <FileText className="h-3.5 w-3.5 mr-1" /> Sauvegarder photo & commentaire
      </Button>

      <Button size="sm" className="w-full" onClick={handleValidate} disabled={isLoading}>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
        Valider pesée & calculer frais
      </Button>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   DESKTOP ROW
   ═══════════════════════════════════════════════════════════ */

function DesktopRow({ row, onView, onCreateAssessment }: { row: LogisticsOrderRow; onView: () => void; onCreateAssessment: () => void }) {
  const hasRemaining = (row.amount_remaining ?? 0) > 0;
  const isUrgent = row.days_pending > 14;
  const isBlocked = row.days_pending > 7 && row.logistics_status !== "shipped" && row.logistics_status !== "validated";
  const isArch = isArchived(row);

  return (
    <tr className={cn("border-b hover:bg-muted/20 transition-colors", isUrgent && "bg-red-50/50", isBlocked && !isUrgent && "bg-orange-50/30", isArch && "opacity-50")}>
      <td className="px-2 py-1.5"><OrderTypeBadge type={row.order_type} size="sm" /></td>
      <td className="px-2 py-1.5"><span className="font-mono">#{row.order_id.slice(0, 8)}</span>{isArch && <History className="h-3 w-3 inline ml-1 text-muted-foreground" />}</td>
      <td className="px-2 py-1.5"><p className="font-medium truncate max-w-[120px]">{row.customer_name ?? "—"}</p><p className="text-[9px] text-muted-foreground">{row.customer_phone ?? "—"}</p></td>
      <td className="px-2 py-1.5">{row.order_status && <SB config={safeOrderStatus(row.order_status)} />}</td>
      <td className="px-2 py-1.5">{row.assessment_id ? (row.logistics_status && <SB config={safeLogStatus(row.logistics_status)} />) : <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium border bg-gray-100 text-gray-500 border-gray-300">À créer</span>}</td>
      <td className="px-2 py-1.5">{row.payment_status && row.total_shipping_fees ? <SB config={safePayStatus(row.payment_status)} /> : <span className="text-gray-400">—</span>}</td>
      <td className="px-2 py-1.5 text-right font-medium">{fmtN(row.order_total)}</td>
      <td className="px-2 py-1.5 text-right">{row.total_shipping_fees ? fmtN(row.total_shipping_fees) : "—"}</td>
      <td className="px-2 py-1.5 text-right"><span className={cn("font-medium", hasRemaining ? "text-red-600" : "text-emerald-600")}>{row.total_shipping_fees ? fmtN(row.amount_remaining) : "—"}</span></td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onView} title="Détails"><Eye className="h-3 w-3" /></Button>
          {!row.assessment_id && row.order_type !== "local" && (
            <Button size="sm" variant="ghost" className="h-6 text-[9px] px-1.5" onClick={onCreateAssessment} title="Créer évaluation"><Scale className="h-3 w-3" /></Button>
          )}
          {row.customer_phone && <a href={`https://wa.me/${row.customer_phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="h-6 w-6 flex items-center justify-center rounded hover:bg-emerald-50 text-emerald-600" title="WhatsApp"><Phone className="h-3 w-3" /></a>}
        </div>
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════════
   MOBILE CARD
   ═══════════════════════════════════════════════════════════ */

function MobileLogisticsCard({ row, onView, onCreateAssessment }: { row: LogisticsOrderRow; onView: () => void; onCreateAssessment: () => void }) {
  const hasRemaining = (row.amount_remaining ?? 0) > 0;
  const isUrgent = row.days_pending > 14;
  const isArch = isArchived(row);

  return (
    <div className={cn("rounded-xl border bg-card p-3 space-y-2", isUrgent && "border-red-300 bg-red-50/30", isArch && "opacity-50")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs">#{row.order_id.slice(0, 8)}</span>
            <OrderTypeBadge type={row.order_type} size="sm" />
            {isArch && <History className="h-3 w-3 text-muted-foreground" />}
          </div>
          <p className="text-xs font-medium truncate">{row.customer_name ?? "—"}</p>
          <p className="text-[10px] text-muted-foreground">{row.customer_phone}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {row.order_status && <SB config={safeOrderStatus(row.order_status)} />}
          {row.logistics_status && <SB config={safeLogStatus(row.logistics_status)} />}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div><p className="text-[10px] text-muted-foreground">Total</p><p className="font-medium">{fmtN(row.order_total)}</p></div>
        <div><p className="text-[10px] text-muted-foreground">Frais</p><p>{fmtN(row.total_shipping_fees)}</p></div>
        <div><p className="text-[10px] text-muted-foreground">Reste</p><p className={cn("font-bold", hasRemaining ? "text-red-600" : "text-emerald-600")}>{fmtN(row.amount_remaining)}</p></div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={onView}><Eye className="h-3 w-3 mr-1" /> Détails</Button>
        {row.customer_phone && <Button size="sm" variant="outline" className="h-7 text-xs flex-1" asChild><a href={`https://wa.me/${row.customer_phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"><Phone className="h-3 w-3 mr-1" /> WhatsApp</a></Button>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

function SB({ config }: { config?: { label: string; color: string } | null }) {
  const safe = config ?? { label: "?", color: "bg-gray-100 text-gray-500 border-gray-300" };
  return <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium border", safe.color)}>{safe.label}</span>;
}

function OrderTypeBadge({ type, size = "default" }: { type?: "local" | "import" | "mixed" | string | null; size?: "default" | "sm" }) {
  const safeType = type === "local" || type === "import" || type === "mixed" ? type : "local";
  const config = ORDER_TYPE_CONFIG[safeType] ?? ORDER_TYPE_CONFIG.local;
  const Icon = config.icon;
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full border font-medium", config.color, size === "sm" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]")}>
      <Icon className={cn(size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3")} />
      {config.label}
    </span>
  );
}

function safeOrderStatus(s: string | null | undefined) { return ORDER_S[s ?? ""] ?? { label: s ?? "?", color: "bg-gray-100 text-gray-500 border-gray-300" }; }
function safeLogStatus(s: string | null | undefined) { return LOG_S[s ?? ""] ?? { label: s ?? "?", color: "bg-gray-100 text-gray-500 border-gray-300" }; }
function safePayStatus(s: string | null | undefined) { return PAY_S[s ?? ""] ?? { label: s ?? "?", color: "bg-gray-100 text-gray-500 border-gray-300" }; }

function fmtN(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
}
function fmtD(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}
