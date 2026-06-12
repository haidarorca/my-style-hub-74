// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   OrderCard — Carte de commande avec statut detaille
   
   Le calcul du "Reste" utilise les paiements locaux si disponibles,
   sinon fait un fallback raisonnable sur order_total.
   ═══════════════════════════════════════════════════════════════ */

import { Badge } from "@/components/ui/badge";
import { Phone, MapPin, Package } from "lucide-react";
import { STATUS_LABELS, STATUS_COLORS, fmtF, mapStatus, getImportStepIndex, IMPORT_WORKFLOW_STEPS } from "@/cockpit/lib/workflow";
import { getOrderNumber } from "@/cockpit/lib/orderNumbers";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";

interface Props {
  order: LogisticsOrderRow;
  index: number;
  onClick: () => void;
  /** Total paye connu (depuis les paiements locaux). Si non fourni, fallback sur order.amount_remaining */
  totalPaid?: number;
}

export function OrderCard({ order, index, onClick, totalPaid }: Props) {
  const status = mapStatus(order);
  const isLocal = !order.shipping_service_id && order.order_type !== "import";
  const isImport = !isLocal;
  const kzNumber = getOrderNumber(order.order_id ?? "");

  // Calcul du reste : utilise totalPaid si disponible, sinon fallback
  const orderTotal = order.order_total ?? 0;
  const shippingFees = order.total_shipping_fees ?? 0;
  const grandTotal = orderTotal + shippingFees;
  const paid = totalPaid ?? order.amount_paid ?? 0;
  const remaining = Math.max(0, grandTotal - paid);

  // Label de statut detaille pour IMPORT
  const importStep = isImport ? getImportStepIndex(order.logistics_status) : -1;
  const statusLabel = isImport && importStep >= 0
    ? `${importStep + 1}/${IMPORT_WORKFLOW_STEPS.length}`
    : (STATUS_LABELS[status] ?? status);

  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 text-left transition-colors"
    >
      {/* Numero KZ fixe */}
      <div className="shrink-0 w-14">
        <div className="font-mono text-[11px] font-bold text-gray-800">{kzNumber}</div>
        <div className="text-[9px] text-gray-400 truncate">{order.order_id?.slice(-4)}</div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-sm font-semibold truncate">{order.customer_name ?? "—"}</span>
          <Badge variant="outline" className={`text-[8px] h-4 px-1 ${isLocal ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"}`}>
            {isLocal ? "LOCAL" : "IMPORT"}
          </Badge>
        </div>

        {order.customer_phone && (
          <div className="flex items-center gap-1 text-[11px] text-gray-500">
            <Phone className="h-3 w-3" />
            {order.customer_phone}
          </div>
        )}

        {order.destination_address && (
          <div className="flex items-center gap-1 text-[11px] text-gray-400 truncate">
            <MapPin className="h-3 w-3" />
            {order.destination_address}
          </div>
        )}

        {/* Statut IMPORT avec icone de progression */}
        {isImport && importStep >= 0 && (
          <div className="flex items-center gap-1 mt-1">
            <Package className="h-3 w-3 text-indigo-400" />
            <div className="text-[10px] text-indigo-600 font-medium">
              {IMPORT_WORKFLOW_STEPS[importStep]?.label ?? order.logistics_status}
            </div>
          </div>
        )}
      </div>

      {/* Montant + Statut */}
      <div className="shrink-0 text-right">
        <div className="text-sm font-bold">{fmtF(orderTotal)}</div>
        {remaining > 0 ? (
          <div className="text-xs text-red-500 font-medium">Reste: {fmtF(remaining)}</div>
        ) : grandTotal > 0 ? (
          <div className="text-xs text-emerald-500">Paye</div>
        ) : null}
        <Badge variant="outline" className={`text-[8px] h-4 px-1 mt-1 ${STATUS_COLORS[status] ?? ""}`}>
          {statusLabel}
        </Badge>
      </div>
    </button>
  );
}
