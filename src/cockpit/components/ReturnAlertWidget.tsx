// ============================================================
// ReturnAlertWidget — KawZone Cockpit
// Widget d'alertes retour intégré au Cockpit
// Affiche les retours necessitant une action immediate
// ============================================================

import { useMemo } from "react";
import { RotateCcw, AlertTriangle, PackageCheck, Clock, Trash2, Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export interface ReturnAlertItem {
  id: string;
  caseId: string;
  title: string;
  step: "return_requested" | "product_received" | "inspection_done" | "disposition_decided" | "refund_pending" | "sla_breached";
  priority: "low" | "medium" | "high" | "urgent";
  vendorName: string;
  productName: string;
  createdAt: string;
  slaDeadline?: string;
}

interface ReturnAlertWidgetProps {
  items: ReturnAlertItem[];
  loading?: boolean;
  onAction?: (item: ReturnAlertItem) => void;
}

const STEP_CONFIG: Record<ReturnAlertItem["step"], { label: string; icon: typeof RotateCcw; color: string }> = {
  return_requested: { label: "Retour à valider", icon: RotateCcw, color: "bg-blue-100 text-blue-700" },
  product_received: { label: "Inspection à faire", icon: PackageCheck, color: "bg-yellow-100 text-yellow-700" },
  inspection_done: { label: "Décision à prendre", icon: AlertTriangle, color: "bg-orange-100 text-orange-700" },
  disposition_decided: { label: "Traitement en cours", icon: Truck, color: "bg-purple-100 text-purple-700" },
  refund_pending: { label: "Remboursement à faire", icon: Clock, color: "bg-red-100 text-red-700" },
  sla_breached: { label: "SLA dépassé", icon: AlertTriangle, color: "bg-red-200 text-red-800" },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-blue-100 text-blue-600",
  high: "bg-orange-100 text-orange-600",
  urgent: "bg-red-100 text-red-600 animate-pulse",
};

export function ReturnAlertWidget({ items, loading, onAction }: ReturnAlertWidgetProps) {
  const grouped = useMemo(() => {
    const groups: Record<string, ReturnAlertItem[]> = {};
    for (const item of items) {
      if (!groups[item.step]) groups[item.step] = [];
      groups[item.step].push(item);
    }
    return groups;
  }, [items]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            Alertes Retour
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            Alertes Retour
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucun retour nécessitant une action
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <RotateCcw className="h-4 w-4" />
          Alertes Retour
          <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 max-h-[400px] overflow-y-auto">
        {Object.entries(grouped).map(([step, stepItems]) => {
          const config = STEP_CONFIG[step as ReturnAlertItem["step"]]];
          const Icon = config.icon;
          return (
            <div key={step} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${config.color}`}>
                  <Icon className="h-3 w-3" />
                  {config.label}
                </span>
                <span className="text-[10px] text-muted-foreground">{stepItems.length}</span>
              </div>
              {stepItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onAction?.(item)}
                  className="w-full text-left rounded-lg border p-2.5 transition-colors hover:bg-accent hover:border-primary/30"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{item.productName}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {item.vendorName}
                      </p>
                    </div>
                    <Badge className={`shrink-0 text-[9px] ${PRIORITY_COLORS[item.priority]}`}>
                      {item.priority}
                    </Badge>
                  </div>
                  {item.slaDeadline && (
                    <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      SLA : {new Date(item.slaDeadline).toLocaleDateString("fr-FR")}
                    </p>
                  )}
                </button>
              ))}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
