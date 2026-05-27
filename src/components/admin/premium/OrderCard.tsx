/**
 * OrderCard — Card commande (remplace le tableau lourd)
 * Affiche toutes les infos clés + actions inline
 */
import { Eye, Phone, Package, CheckCircle, ArrowRight, Receipt, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusDot } from "./StatusDot";

export interface OrderCardData {
  id: string;
  orderId: string;
  customerName: string;
  customerPhone?: string | null;
  status: string;
  orderType: "local" | "import" | "mixed";
  total: number;
  remaining?: number;
  shippingFees?: number;
  logisticsStatus?: string | null;
  paymentStatus?: string | null;
  daysPending?: number;
  isCommission?: boolean;
  createdAt?: string;
  assessmentId?: string | null;
}

interface OrderCardProps {
  order: OrderCardData;
  onView: () => void;
  onConfirm?: () => void;
  onCreateAssessment?: () => void;
  onConfirmPayment?: () => void;
  delay?: number;
}

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  local: { label: "LOCAL", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  import: { label: "IMPORT", color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/20" },
  mixed: { label: "MIXTE", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  new: { label: "Nouvelle", color: "text-amber-400" },
  confirmed: { label: "Confirmée", color: "text-emerald-400" },
  processing: { label: "En cours", color: "text-purple-400" },
  shipped: { label: "Expédiée", color: "text-violet-400" },
  delivered: { label: "Livrée", color: "text-blue-400" },
  cancelled: { label: "Annulée", color: "text-red-400" },
};

function fmtN(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
}

export function OrderCard({
  order,
  onView,
  onConfirm,
  onCreateAssessment,
  onConfirmPayment,
  delay = 0,
}: OrderCardProps) {
  const typeCfg = TYPE_CONFIG[order.orderType] ?? TYPE_CONFIG.local;
  const statusCfg = STATUS_CONFIG[order.status] ?? { label: order.status ?? "?", color: "text-muted-foreground" };
  const isUrgent = (order.daysPending ?? 0) > 14;
  const isBlocked = (order.daysPending ?? 0) > 7 && order.status !== "delivered" && order.status !== "shipped";

  return (
    <div
      className={cn(
        "card-premium stagger-enter rounded-2xl border bg-card p-4",
        isUrgent && "border-destructive/30 shadow-[0_0_12px_rgba(239,68,68,0.08)]",
        isBlocked && !isUrgent && "border-warning/30",
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono admin-text-xs text-muted-foreground">#{order.orderId.slice(0, 6)}</span>
          <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 admin-text-[9px] font-semibold", typeCfg.bg, typeCfg.color)}>
            {typeCfg.label}
          </span>
          {order.isCommission && (
            <span className="inline-flex items-center rounded-md border border-fuchsia-500/20 bg-fuchsia-500/10 px-1.5 py-0.5 admin-text-[9px] font-semibold text-fuchsia-400">
              Commission
            </span>
          )}
        </div>
        <StatusLabel status={order.status} />
      </div>

      {/* Client */}
      <div className="mt-2 min-w-0">
        <p className="admin-text-sm font-medium truncate">{order.customerName}</p>
        {order.customerPhone && (
          <p className="admin-text-xs text-muted-foreground">{order.customerPhone}</p>
        )}
      </div>

      {/* Financial */}
      <div className="mt-3 flex items-center justify-between">
        <div>
          <p className="admin-text-lg font-semibold">{fmtN(order.total)}</p>
          {order.remaining !== undefined && order.remaining > 0 && (
            <p className="admin-text-xs text-destructive">Reste : {fmtN(order.remaining)}</p>
          )}
        </div>
        {(order.daysPending ?? 0) > 5 && (
          <span className={cn("admin-text-xs font-medium", isUrgent ? "text-destructive" : "text-warning")}>
            {order.daysPending}j
          </span>
        )}
      </div>

      {/* Quick actions */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          onClick={onView}
          className="btn-premium inline-flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 admin-text-xs font-medium text-secondary-foreground hover:bg-accent transition-colors"
        >
          <Eye className="h-3 w-3" /> Détails
        </button>

        {order.status === "new" && onConfirm && (
          <button
            onClick={onConfirm}
            className="btn-premium inline-flex items-center gap-1 rounded-lg bg-success/15 px-2.5 py-1.5 admin-text-xs font-medium text-success hover:bg-success/25 transition-colors"
          >
            <CheckCircle className="h-3 w-3" /> Confirmer
          </button>
        )}

        {order.orderType !== "local" && !order.assessmentId && onCreateAssessment && (
          <button
            onClick={onCreateAssessment}
            className="btn-premium inline-flex items-center gap-1 rounded-lg bg-primary/15 px-2.5 py-1.5 admin-text-xs font-medium text-primary hover:bg-primary/25 transition-colors"
          >
            <Scale className="h-3 w-3" /> Évaluer
          </button>
        )}

        {order.assessmentId && order.remaining && order.remaining > 0 && onConfirmPayment && (
          <button
            onClick={onConfirmPayment}
            className="btn-premium inline-flex items-center gap-1 rounded-lg bg-warning/15 px-2.5 py-1.5 admin-text-xs font-medium text-warning hover:bg-warning/25 transition-colors"
          >
            <Receipt className="h-3 w-3" /> Paiement
          </button>
        )}

        {order.customerPhone && (
          <a
            href={`https://wa.me/${order.customerPhone.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-premium inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 admin-text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
          >
            <Phone className="h-3 w-3" /> WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}

/* Inline status label */
function StatusLabel({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <StatusDot status={status} />
      <span className={cn("admin-text-xs", STATUS_CONFIG[status]?.color ?? "text-muted-foreground")}>
        {STATUS_CONFIG[status]?.label ?? status}
      </span>
    </span>
  );
}
