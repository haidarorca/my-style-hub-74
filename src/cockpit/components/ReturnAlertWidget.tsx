// ═══════════════════════════════════════════════════════════════
// ReturnAlertWidget — KawZone Cockpit
// Widget d'alertes COAV pour le dashboard
// Affiche les dossiers nécessitant une action immédiate
// ═══════════════════════════════════════════════════════════════

import { AlertTriangle, PackageCheck, Search, Clock, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ReturnAlert {
  id: string;
  case_id: string;
  type: "shipment_overdue" | "pending_inspection" | "supplier_no_response" | "destruction_needed" | "balance_negative";
  severity: "critical" | "warning" | "info";
  message: string;
  case_ref: string;
  created_at: string;
  action_label?: string;
}

interface ReturnAlertWidgetProps {
  alerts: ReturnAlert[];
  onAction?: (alert: ReturnAlert) => void;
  className?: string;
}

const ICON_MAP = {
  shipment_overdue: PackageCheck,
  pending_inspection: Search,
  supplier_no_response: Clock,
  destruction_needed: AlertTriangle,
  balance_negative: TrendingDown,
};

const SEVERITY_STYLES = {
  critical: "border-red-200 bg-red-50",
  warning: "border-amber-200 bg-amber-50",
  info: "border-blue-200 bg-blue-50",
};

const SEVERITY_DOT = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

export function ReturnAlertWidget({ alerts, onAction, className }: ReturnAlertWidgetProps) {
  if (alerts.length === 0) {
    return (
      <div className={cn("rounded-lg border p-4 text-center text-sm text-muted-foreground", className)}>
        Aucune alerte COAV
      </div>
    );
  }

  const critical = alerts.filter((a) => a.severity === "critical").length;
  const warning = alerts.filter((a) => a.severity === "warning").length;

  return (
    <div className={cn("rounded-lg border bg-card shadow-sm", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Alertes COAV</h3>
          <span className="text-xs text-muted-foreground">({alerts.length})</span>
        </div>
        <div className="flex gap-1.5">
          {critical > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
              {critical} critique{critical > 1 ? "s" : ""}
            </span>
          )}
          {warning > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
              {warning} avertissement{warning > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Liste */}
      <div className="divide-y">
        {alerts.map((alert) => {
          const Icon = ICON_MAP[alert.type];
          return (
            <div
              key={alert.id}
              className={cn("flex items-start gap-3 px-4 py-2.5", SEVERITY_STYLES[alert.severity])}
            >
              <div className="mt-0.5">
                <Icon className={cn("h-3.5 w-3.5", `text-${alert.severity === "critical" ? "red" : alert.severity === "warning" ? "amber" : "blue"}-500`)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", SEVERITY_DOT[alert.severity])} />
                  <span className="text-xs font-medium truncate">{alert.case_ref}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{alert.message}</p>
              </div>
              {alert.action_label && onAction && (
                <button
                  onClick={() => onAction(alert)}
                  className="text-[10px] px-2 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                >
                  {alert.action_label}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
