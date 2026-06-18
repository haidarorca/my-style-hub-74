import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, ChevronRight, Phone, Eye } from "lucide-react";
import { WorkflowStepBar } from "./WorkflowStepBar";
import { WorkflowExpandedForm } from "./WorkflowExpandedForm";
import { CustomerBadge } from "./CustomerBadge";
import { WorkflowActionButton } from "./WorkflowActionButton";
import { cn } from "@/lib/utils";
import {
  fmtF,
  fmtFees,
  fmtRemaining,
  getOrderTypeLabel,
  getDaysBadgeColor,
  getPaymentBadgeVariant,
} from "@/lib/workflow.config";
import { weightStatusBadgeClass, weightStatusLabel } from "@/lib/logistics-rules";
import type { WorkflowRow as TWorkflowRow } from "@/types/workflow";

interface Props {
  row: TWorkflowRow;
  position?: number;
  onViewDetail: (row: TWorkflowRow) => void;
}

/* ═════════════════════════════════════════════════════════════════
   WorkflowRow — V1.3 Cockpit — Numérotation #001 + ORD-XXXX
   Desktop (>=1024px) : grille horizontale 8 colonnes
   Mobile  (<1024px)  : Compact Action Card (fonds colores)
   ═════════════════════════════════════════════════════════════════ */

export function WorkflowRow({ row, position = 0, onViewDetail }: Props) {
  const [expanded, setExpanded] = useState(false);
  const typeLabel = getOrderTypeLabel(row.order_type);
  const remainingInfo = fmtRemaining(row.amount_remaining);
  const paymentBadge = getPaymentBadgeVariant(row);
  const whatsappUrl = row.customer_phone
    ? `https://wa.me/${row.customer_phone.replace(/\D/g, "")}`
    : null;

  const toggleExpanded = () => setExpanded(!expanded);

  /* ── Priorite visuelle : fond colore entier (pas juste bordure) ── */
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

  /* ── Action rapide : label + classes STATIQUES ── */
  const ls = row.logistics_status;
  const isPeser = ls === "awaiting_weighing";
  const isEnvoyer = ls === "fees_calculated";
  const isPayer = ls === "validated" && rem > 0;
  const isEmbarquer = ls === "validated" && rem <= 0;
  const isExpedier = ls === "ready_to_ship";
  const isRelancer = ls === "awaiting_client_validation";
  const isRetour = ls === "rejected";

  /* Bouton action rapide — LOCAL ou IMPORT */
  const isLocal = row.order_type === "local";
  const isLocalNew = isLocal && (ls === "new" || ls === null || ls === undefined);
  const isLocalConfirmed = isLocal && ls === "confirmed";

  const actionLabel = isLocalNew
    ? "Confirmer"
    : isLocalConfirmed
      ? "Livrer"
      : isPeser
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

  /* Fond de carte selon priorite — visible immediatement */
  const cardBg = isUrgent
    ? "bg-red-50 border-red-200"
    : isWarning
      ? "bg-orange-50 border-orange-200"
      : isOk
        ? "bg-emerald-50 border-emerald-200"
        : "bg-white border-gray-200";

  /* Fond du bouton action — plein, pas outline */
  const btnClass = isLocalNew
    ? "bg-emerald-500 hover:bg-emerald-600 text-white border-transparent"
    : isLocalConfirmed
      ? "bg-blue-500 hover:bg-blue-600 text-white border-transparent"
      : isPeser
        ? "bg-orange-500 hover:bg-orange-600 text-white border-transparent"
        : isEnvoyer
          ? "bg-blue-500 hover:bg-blue-600 text-white border-transparent"
          : isPayer
            ? "bg-red-500 hover:bg-red-600 text-white border-transparent"
            : isEmbarquer
              ? "bg-emerald-500 hover:bg-emerald-600 text-white border-transparent"
              : isExpedier
                ? "bg-blue-500 hover:bg-blue-600 text-white border-transparent"
                : isRelancer
                  ? "bg-amber-500 hover:bg-amber-600 text-white border-transparent"
                  : isRetour
                    ? "bg-gray-500 hover:bg-gray-600 text-white border-transparent"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-300";

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* ═══════════════════════════════════════════════════════
          DESKTOP (>= 1024px) — Grille horizontale (INCHANGE)
          ═══════════════════════════════════════════════════════ */}
      <div
        className="hidden lg:grid items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent/50 transition-colors"
        style={{ gridTemplateColumns: "60px 80px 1fr 90px 90px 90px 80px 28px" }}
        onClick={toggleExpanded}
      >
        <span className="text-[11px] font-mono font-bold text-muted-foreground">
          {position > 0 ? `#${String(position).padStart(3, "0")}` : "#---"}
        </span>

        <span className="text-[10px] font-mono text-muted-foreground truncate">
          {row.order_id?.slice(0, 10)}…
        </span>

        {/* Montant restant — visible immédiatement */}
        {rem > 0 && (
          <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
            {fmtF(rem)}
          </span>
        )}
        {rem === 0 && (
          <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
            Payé
          </span>
        )}

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
          {(row.order_type === "import" || row.order_type === "mixed") && row.weight_status && (
            <span
              className={cn(
                "text-[9px] px-1 py-0.5 rounded border font-medium",
                weightStatusBadgeClass(row.weight_status)
              )}
              title={weightStatusLabel(row.weight_status)}
            >
              {row.weight_status === "anomaly" ? "⚠ Anomalie" : row.weight_status === "verified" ? "✓ Pesé" : row.weight_status === "declared" ? "≈ Déclaré" : "? Inconnu"}
            </span>
          )}
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
          MOBILE (< 1024px) — Compact Action Card V1.2
          Fonds colores + bouton plein + reste a payer dominant
          ═══════════════════════════════════════════════════════ */}
      <div
        className={cn(
          "block lg:hidden rounded-lg border",
          cardBg
        )}
        onClick={toggleExpanded}
      >
        {/* Zone 1 : Metadonnees — ultra-compact */}
        <div className="flex items-center justify-between px-2 pt-1 pb-0">
          <div className="flex items-center gap-1 min-w-0">
            <span
              className={cn(
                "inline-flex items-center justify-center w-4 h-4 rounded-full text-[7px] font-bold text-white shrink-0",
                typeLabel.color
              )}
            >
              {typeLabel.icon}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono truncate">
              {position > 0 ? `#${String(position).padStart(3, "0")}` : "#---"} · {row.order_id?.slice(0, 8)}…
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {(row.order_type === "import" || row.order_type === "mixed") && row.weight_status && (
              <span
                className={cn(
                  "text-[9px] px-1.5 py-0 rounded border font-medium",
                  weightStatusBadgeClass(row.weight_status)
                )}
                title={weightStatusLabel(row.weight_status)}
              >
                {row.weight_status === "anomaly" ? "⚠" : row.weight_status === "verified" ? "✓" : row.weight_status === "declared" ? "≈" : "?"}
              </span>
            )}
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

        {/* Zone 2 : Client + Reste a payer (DOMINANT) */}
        <div className="flex items-center justify-between px-2 py-0.5 gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-sm font-semibold truncate">
              {row.customer_name ?? "—"}
            </span>
            {row.customer && <CustomerBadge customer={row.customer} compact />}
          </div>
          <span
            className={cn(
              "text-base font-bold shrink-0",
              remainingInfo.alert ? "text-red-600" : "text-emerald-700"
            )}
          >
            {remainingInfo.text}
          </span>
        </div>

        {/* Zone 3 : Telephone + Bouton action plein */}
        <div className="flex items-center justify-between px-2 pb-1 pt-0 gap-2">
          <div className="flex items-center gap-1 text-muted-foreground min-w-0">
            {row.customer_phone && (
              <>
                <Phone className="h-3 w-3 shrink-0" />
                <span className="text-[11px] truncate">{row.customer_phone}</span>
              </>
            )}
          </div>

          {/* Bouton d'action contextuel */}
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <WorkflowActionButton row={row} onAction={() => setExpanded(false)} />
          </div>
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
