import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, ChevronRight, Phone, Eye } from "lucide-react";
import { WorkflowStepBar } from "./WorkflowStepBar";
import { WorkflowExpandedForm } from "./WorkflowExpandedForm";
import { CustomerBadge } from "./CustomerBadge";
import { cn } from "@/lib/utils";
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

/* ═════════════════════════════════════════════════════════════════
   WorkflowRow — V1.2 Mobile-First
   Desktop (>=1024px) : grille horizontale 8 colonnes
   Mobile  (<1024px)  : Compact Action Card (classes STATIQUES)
   ═════════════════════════════════════════════════════════════════ */

export function WorkflowRow({ row, onViewDetail }: Props) {
  const [expanded, setExpanded] = useState(false);
  const typeLabel = getOrderTypeLabel(row.order_type);
  const remainingInfo = fmtRemaining(row.amount_remaining);
  const paymentBadge = getPaymentBadgeVariant(row);
  const whatsappUrl = row.customer_phone
    ? `https://wa.me/${row.customer_phone.replace(/\D/g, "")}`
    : null;

  const toggleExpanded = () => setExpanded(!expanded);

  /* ── Helpers pour bordure priorite (STATIQUES pour Tailwind) ── */
  const rem = row.amount_remaining ?? 0;
  const isUrgent = row.days_pending > 7 || rem > 300_000;
  const isWarning =
    !isUrgent &&
    (row.days_pending > 3 || row.logistics_status === "awaiting_weighing");
  const isOk =
    !isUrgent &&
    !isWarning &&
    rem === 0 &&
    (row.logistics_status === "validated" ||
      row.logistics_status === "ready_to_ship");

  /* ── Helpers pour action rapide (STATIQUES pour Tailwind) ── */
  const ls = row.logistics_status;
  const isPeser = ls === "awaiting_weighing";
  const isEnvoyer = ls === "fees_calculated";
  const isPayer = ls === "validated" && rem > 0;
  const isEmbarquer = ls === "validated" && rem <= 0;
  const isExpedier = ls === "ready_to_ship";
  const isRelancer = ls === "awaiting_client_validation";
  const isRetour = ls === "rejected";

  const actionLabel = isPeser
    ? "Peser"
    : isEnvoyer
      ? "Envoyer"
      : isPayer
        ? "Payer"
        : isEmbarquer
          ? "Embarquer"
          : isExpedier
            ? "Expedier"
            : isRelancer
              ? "Relancer"
              : isRetour
                ? "Retour"
                : "Voir";

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* ═══════════════════════════════════════════════════════
          DESKTOP (>= 1024px) — Grille horizontale
          ═══════════════════════════════════════════════════════ */}
      <div
        className="hidden lg:grid items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent/50 transition-colors"
        style={{ gridTemplateColumns: "60px 80px 1fr 90px 90px 90px 80px 28px" }}
        onClick={toggleExpanded}
      >
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "inline-flex items-center justify-center w-5 h-5 rounded text-[8px] font-bold text-white",
              typeLabel.color
            )}
          >
            {typeLabel.icon}
          </span>
          <span className="text-[10px] font-medium">{typeLabel.label}</span>
        </div>

        <span className="text-[11px] font-mono text-muted-foreground truncate">
          {row.order_id?.slice(0, 8)}...
        </span>

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

        <div className="text-right">
          <span className="text-xs font-medium">{fmtF(row.order_total ?? 0)}</span>
        </div>

        <div className="text-right">
          <span className="text-xs text-muted-foreground">
            {fmtFees(row.total_shipping_fees)}
          </span>
        </div>

        <div className="text-right">
          <Badge
            variant="outline"
            className={cn("text-[9px] px-1 py-0 h-4", paymentBadge.color)}
          >
            {paymentBadge.label}
          </Badge>
          {remainingInfo.alert && (
            <div className="text-[9px] text-red-600 font-medium mt-0.5">
              {remainingInfo.text}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-1">
          {row.days_pending > 0 && (
            <span
              className={cn(
                "text-[9px] px-1 py-0.5 rounded-full font-medium",
                getDaysBadgeColor(row.days_pending)
              )}
            >
              {row.days_pending}j
            </span>
          )}
        </div>

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
          Toutes les classes sont STATIQUES pour Tailwind
          ═══════════════════════════════════════════════════════ */}
      <div
        className={cn(
          "block lg:hidden rounded-lg border bg-card border-l-[3px]",
          isUrgent && "border-l-red-500",
          isWarning && "border-l-orange-400",
          isOk && "border-l-emerald-400",
          !isUrgent && !isWarning && !isOk && "border-l-gray-200"
        )}
        onClick={toggleExpanded}
      >
        {/* Zone 1 : Metadonnees — ultra-compact */}
        <div className="flex items-center justify-between px-2.5 pt-1.5 pb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={cn(
                "inline-flex items-center justify-center w-4 h-4 rounded-full text-[7px] font-bold text-white shrink-0",
                typeLabel.color
              )}
            >
              {typeLabel.icon}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono truncate">
              {row.order_id?.slice(0, 10)}...
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {row.days_pending > 0 && (
              <span
                className={cn(
                  "text-[9px] px-1.5 py-0 rounded-full font-medium",
                  getDaysBadgeColor(row.days_pending)
                )}
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

        {/* Zone 2 : Client + Reste a payer (PRIORITAIRE) */}
        <div className="flex items-center justify-between px-2.5 py-0.5 gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-sm font-semibold truncate">
              {row.customer_name ?? "—"}
            </span>
            {row.customer && <CustomerBadge customer={row.customer} compact />}
          </div>
          <span
            className={cn(
              "text-sm font-bold shrink-0",
              remainingInfo.alert ? "text-red-600" : "text-emerald-600"
            )}
          >
            {remainingInfo.text}
          </span>
        </div>

        {/* Zone 3 : Telephone + Action rapide */}
        <div className="flex items-center justify-between px-2.5 pb-1.5 pt-0 gap-2">
          <div className="flex items-center gap-1 text-muted-foreground min-w-0">
            {row.customer_phone && (
              <>
                <Phone className="h-3 w-3 shrink-0" />
                <span className="text-[11px] truncate">{row.customer_phone}</span>
              </>
            )}
          </div>

          {/* Bouton action — CLASSES STATIQUES EXPLICITES */}
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "h-6 text-[10px] px-1.5",
              isPeser &&
                "border-orange-300 text-orange-700 hover:bg-orange-50 hover:text-orange-800",
              isEnvoyer &&
                "border-blue-300 text-blue-700 hover:bg-blue-50 hover:text-blue-800",
              isPayer &&
                "border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800",
              isEmbarquer &&
                "border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800",
              isExpedier &&
                "border-blue-300 text-blue-700 hover:bg-blue-50 hover:text-blue-800",
              isRelancer &&
                "border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800",
              isRetour &&
                "border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-800",
              !isPeser &&
                !isEnvoyer &&
                !isPayer &&
                !isEmbarquer &&
                !isExpedier &&
                !isRelancer &&
                !isRetour &&
                "border-gray-200 text-gray-600 hover:bg-gray-50"
            )}
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded();
            }}
          >
            {actionLabel}
            <ChevronRight className="h-3 w-3 ml-0.5" />
          </Button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          EXPANDED — Partage desktop ET mobile
          ═══════════════════════════════════════════════════════ */}
      {expanded && (
        <div className="border-t px-3 py-3 space-y-3">
          <WorkflowStepBar
            orderType={row.order_type}
            logisticsStatus={row.logistics_status}
          />

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
              <div
                className={cn(
                  "font-medium",
                  remainingInfo.alert ? "text-red-600" : ""
                )}
              >
                {remainingInfo.text}
              </div>
            </div>
          </div>

          <WorkflowExpandedForm row={row} />

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
