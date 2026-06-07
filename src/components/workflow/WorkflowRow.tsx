import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Phone, Eye } from "lucide-react";
import { WorkflowStepBar } from "./WorkflowStepBar";
import { WorkflowExpandedForm } from "./WorkflowExpandedForm";
import { CustomerBadge } from "./CustomerBadge";
import {
  fmtF,
  fmtFees,
  fmtRemaining,
  getOrderTypeLabel,
  getDaysBadgeColor,
  getPaymentBadgeVariant,
} from "@/lib/workflow.config";
import type { WorkflowRow as TWorkflowRow } from "@/types/workflow";

interface Props {
  row: TWorkflowRow;
  onViewDetail: (row: TWorkflowRow) => void;
}

export function WorkflowRow({ row, onViewDetail }: Props) {
  const [expanded, setExpanded] = useState(false);
  const typeLabel = getOrderTypeLabel(row.order_type);
  const remainingInfo = fmtRemaining(row.amount_remaining);
  const paymentBadge = getPaymentBadgeVariant(row);
  const whatsappUrl = row.customer_phone
    ? `https://wa.me/${row.customer_phone.replace(/\D/g, "")}`
    : null;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* ── Ligne collapsed ───────────────────────── */}
      <div
        className="grid items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent/50 transition-colors"
        style={{ gridTemplateColumns: "28px 60px 80px 1fr 90px 90px 90px 80px 28px" }}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Checkbox */}
        <div className="flex items-center justify-center">
          <input type="checkbox" className="w-3.5 h-3.5 rounded" onClick={(e) => e.stopPropagation()} />
        </div>

        {/* Type badge */}
        <div className="flex items-center gap-1">
          <span
            className={`inline-flex items-center justify-center w-5 h-5 rounded text-[8px] font-bold text-white ${typeLabel.color}`}
          >
            {typeLabel.icon}
          </span>
          <span className="text-[10px] font-medium">{typeLabel.label}</span>
        </div>

        {/* ID */}
        <span className="text-[11px] font-mono text-muted-foreground truncate">
          {row.order_id?.slice(0, 8)}…
        </span>

        {/* Client */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium truncate">
              {row.customer_name ?? "—"}
            </span>
            {row.customer && <CustomerBadge customer={row.customer} />}
          </div>
          {row.customer_phone && (
            <span className="text-[10px] text-muted-foreground">{row.customer_phone}</span>
          )}
        </div>

        {/* Produits */}
        <div className="text-right">
          <span className="text-xs font-medium">{fmtF(row.order_total ?? 0)}</span>
        </div>

        {/* Frais */}
        <div className="text-right">
          <span className="text-xs text-muted-foreground">{fmtFees(row.total_shipping_fees)}</span>
        </div>

        {/* Payé / Reste */}
        <div className="text-right">
          <Badge
            variant="outline"
            className={`text-[9px] px-1 py-0 h-4 ${paymentBadge.color}`}
          >
            {paymentBadge.label}
          </Badge>
          {remainingInfo.alert && (
            <div className="text-[9px] text-red-600 font-medium mt-0.5">
              {remainingInfo.text}
            </div>
          )}
        </div>

        {/* Jours */}
        <div className="flex items-center justify-end gap-1">
          {row.days_pending > 0 && (
            <span
              className={`text-[9px] px-1 py-0.5 rounded-full font-medium ${getDaysBadgeColor(
                row.days_pending
              )}`}
            >
              {row.days_pending}j
            </span>
          )}
        </div>

        {/* Expand */}
        <div className="flex items-center justify-center">
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* ── Ligne expanded ────────────────────────── */}
      {expanded && (
        <div className="border-t px-3 py-3 space-y-3">
          {/* StepBar */}
          <WorkflowStepBar
            orderType={row.order_type}
            logisticsStatus={row.logistics_status}
          />

          {/* Finance detail */}
          <div className="grid grid-cols-4 gap-3 text-xs bg-muted/30 rounded-lg p-2">
            <div>
              <span className="text-muted-foreground text-[10px]">Produits</span>
              <div className="font-medium">{fmtF(row.order_total ?? 0)}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-[10px]">Frais</span>
              <div className="font-medium">{fmtFees(row.total_shipping_fees)}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-[10px]">Payé</span>
              <div className="font-medium">{fmtF(row.amount_paid)}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-[10px]">Reste</span>
              <div className={`font-medium ${remainingInfo.alert ? "text-red-600" : ""}`}>
                {remainingInfo.text}
              </div>
            </div>
          </div>

          {/* Actions inline */}
          <WorkflowExpandedForm row={row} />

          {/* Boutons secondaires */}
          <div className="flex gap-2 pt-1 border-t">
            <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => onViewDetail(row)}>
              <Eye className="h-3 w-3 mr-1" />
              Voir détail
            </Button>
            {whatsappUrl && (
              <Button size="sm" variant="ghost" className="h-7 text-[10px]" asChild>
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <Phone className="h-3 w-3 mr-1" />
                  WhatsApp
                </a>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
