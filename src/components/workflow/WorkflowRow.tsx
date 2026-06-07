import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, ChevronRight, Phone, Eye } from "lucide-react";
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

function usePriorityBorder(row: TWorkflowRow) {
  return useMemo(() => {
    const remaining = row.amount_remaining ?? 0;
    if (row.days_pending > 7 || remaining > 300_000) return "border-l-red-500";
    if (row.days_pending > 3 || row.logistics_status === "awaiting_weighing")
      return "border-l-orange-400";
    if (
      remaining === 0 &&
      (row.logistics_status === "validated" || row.logistics_status === "ready_to_ship")
    )
      return "border-l-emerald-400";
    return "border-l-gray-200";
  }, [row.days_pending, row.amount_remaining, row.logistics_status]);
}

function useQuickAction(row: TWorkflowRow) {
  return useMemo(() => {
    const remaining = row.amount_remaining ?? 0;
    switch (row.logistics_status) {
      case "awaiting_weighing":
        return {
          label: "Peser",
          color: "border-orange-300 text-orange-700 hover:bg-orange-50",
        };
      case "fees_calculated":
        return {
          label: "Envoyer",
          color: "border-blue-300 text-blue-700 hover:bg-blue-50",
        };
      case "validated":
        return remaining > 0
          ? { label: "Payer", color: "border-red-300 text-red-700 hover:bg-red-50" }
          : {
              label: "Embarquer",
              color: "border-emerald-300 text-emerald-700 hover:bg-emerald-50",
            };
      case "ready_to_ship":
        return {
          label: "Expedier",
          color: "border-blue-300 text-blue-700 hover:bg-blue-50",
        };
      case "awaiting_client_validation":
        return {
          label: "Relancer",
          color: "border-amber-300 text-amber-700 hover:bg-amber-50",
        };
      case "rejected":
        return {
          label: "Retour",
          color: "border-gray-300 text-gray-700 hover:bg-gray-50",
        };
      default:
        return { label: "Voir", color: "" };
    }
  }, [row.logistics_status, row.amount_remaining]);
}

/* ═════════════════════════════════════════════════════════════════
   WorkflowRow — Dual Layout Responsive
   Desktop (>=1024px) : grille horizontale 8 colonnes
   Mobile  (<1024px)  : Compact Action Card vertical
   ═════════════════════════════════════════════════════════════════ */

export function WorkflowRow({ row, onViewDetail }: Props) {
  const [expanded, setExpanded] = useState(false);
  const typeLabel = getOrderTypeLabel(row.order_type);
  const remainingInfo = fmtRemaining(row.amount_remaining);
  const paymentBadge = getPaymentBadgeVariant(row);
  const priorityBorder = usePriorityBorder(row);
  const quickAction = useQuickAction(row);
  const whatsappUrl = row.customer_phone
    ? `https://wa.me/${row.customer_phone.replace(/\D/g, "")}`
    : null;

  const toggleExpanded = () => setExpanded(!expanded);

  /* ─── BOUTON ACTION RAPIDE (tap ne propage pas) ─── */
  const QuickActionButton = () => (
    <Button
      size="sm"
      variant="outline"
      className={`h-7 text-[11px] px-2 ${quickAction.color}`}
      onClick={(e) => {
        e.stopPropagation();
        toggleExpanded();
      }}
    >
      {quickAction.label}
      <ChevronRight className="h-3 w-3 ml-0.5" />
    </Button>
  );

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* ═══════════════════════════════════════════════════════
          DESKTOP (>= 1024px) — Grille horizontale 8 colonnes
          ═══════════════════════════════════════════════════════ */}
      <div
        className="hidden lg:grid items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent/50 transition-colors"
        style={{ gridTemplateColumns: "60px 80px 1fr 90px 90px 90px 80px 28px" }}
        onClick={toggleExpanded}
      >
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
            <span className="text-[10px] text-muted-foreground">
              {row.customer_phone}
            </span>
          )}
        </div>

        {/* Produits */}
        <div className="text-right">
          <span className="text-xs font-medium">{fmtF(row.order_total ?? 0)}</span>
        </div>

        {/* Frais */}
        <div className="text-right">
          <span className="text-xs text-muted-foreground">
            {fmtFees(row.total_shipping_fees)}
          </span>
        </div>

        {/* Paye / Reste */}
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

      {/* ═══════════════════════════════════════════════════════
          MOBILE (< 1024px) — Compact Action Card
          ═══════════════════════════════════════════════════════ */}
      <div
        className={`block lg:hidden rounded-lg border bg-card overflow-hidden border-l-[3px] ${priorityBorder}`}
        onClick={toggleExpanded}
      >
        {/* Zone 1 : Metadonnees (type + ID + jours + chevron) */}
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Type : cercle seul, pas de label */}
            <span
              className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[7px] font-bold text-white shrink-0 ${typeLabel.color}`}
            >
              {typeLabel.icon}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono truncate">
              {row.order_id?.slice(0, 10)}…
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {row.days_pending > 0 && (
              <span
                className={`text-[9px] px-1.5 py-0 rounded-full font-medium ${getDaysBadgeColor(
                  row.days_pending
                )}`}
              >
                {row.days_pending}j
              </span>
            )}
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Zone 2 : Client + Finance (nom + badge compact + reste) */}
        <div className="flex items-center justify-between px-3 py-1 gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-sm font-semibold truncate">
              {row.customer_name ?? "—"}
            </span>
            {row.customer && <CustomerBadge customer={row.customer} compact />}
          </div>
          <span
            className={`text-sm font-bold shrink-0 ${
              remainingInfo.alert ? "text-red-600" : "text-emerald-600"
            }`}
          >
            {remainingInfo.text}
          </span>
        </div>

        {/* Zone 3 : Contact + Action rapide */}
        <div className="flex items-center justify-between px-3 pb-2 pt-0.5 gap-2">
          <div className="flex items-center gap-1 text-muted-foreground min-w-0">
            {row.customer_phone && (
              <>
                <Phone className="h-3 w-3 shrink-0" />
                <span className="text-[11px] truncate">{row.customer_phone}</span>
              </>
            )}
          </div>
          <QuickActionButton />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          EXPANDED — Partage par desktop ET mobile
          ═══════════════════════════════════════════════════════ */}
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
              <span className="text-muted-foreground text-[10px]">Paye</span>
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
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[10px]"
              onClick={(e) => {
                e.stopPropagation();
                onViewDetail(row);
              }}
            >
              <Eye className="h-3 w-3 mr-1" />
              Voir detail
            </Button>
            {whatsappUrl && (
              <Button size="sm" variant="ghost" className="h-7 text-[10px]" asChild>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
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
