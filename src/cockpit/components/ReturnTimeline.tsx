// ============================================================
// ReturnTimeline — KawZone Cockpit
// Timeline visuelle du workflow retour
// Affiche les etapes : Demande → Validation → Expédition →
// Réception → Inspection → Décision → Traitement → Clôture
// ============================================================

import { Check, Clock, X, Truck, PackageCheck, Search, AlertTriangle, RotateCcw, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TimelineStep {
  id: string;
  label: string;
  description?: string;
  status: "completed" | "current" | "pending" | "failed";
  date?: string;
  actor?: string;
  icon?: "request" | "validate" | "ship" | "receive" | "inspect" | "decide" | "process" | "close" | "refuse";
}

interface ReturnTimelineProps {
  steps: TimelineStep[];
  className?: string;
}

const ICON_MAP = {
  request: RotateCcw,
  validate: Check,
  ship: Truck,
  receive: PackageCheck,
  inspect: Search,
  decide: AlertTriangle,
  process: Clock,
  close: Check,
  refuse: Ban,
};

export function ReturnTimeline({ steps, className }: ReturnTimelineProps) {
  return (
    <div className={cn("space-y-0", className)}>
      {steps.map((step, idx) => {
        const Icon = step.icon ? ICON_MAP[step.icon] : Check;
        const isLast = idx === steps.length - 1;

        return (
          <div key={step.id} className="flex gap-3">
            {/* Ligne verticale + icone */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border-2 shrink-0",
                  step.status === "completed" && "border-green-500 bg-green-500 text-white",
                  step.status === "current" && "border-primary bg-primary text-primary-foreground animate-pulse",
                  step.status === "pending" && "border-muted bg-background text-muted-foreground",
                  step.status === "failed" && "border-red-500 bg-red-500 text-white",
                )}
              >
                {step.status === "completed" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : step.status === "failed" ? (
                  <X className="h-3.5 w-3.5" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
              </div>
              {!isLast && (
                <div
                  className={cn(
                    "w-0.5 flex-1 min-h-[20px]",
                    step.status === "completed" ? "bg-green-500" : "bg-muted",
                  )}
                />
              )}
            </div>

            {/* Contenu */}
            <div className={cn("pb-4", isLast && "pb-0")}>
              <p
                className={cn(
                  "text-xs font-medium",
                  step.status === "pending" && "text-muted-foreground",
                  step.status === "failed" && "text-red-600",
                )}
              >
                {step.label}
              </p>
              {step.description && (
                <p className="text-[10px] text-muted-foreground mt-0.5">{step.description}</p>
              )}
              {(step.date || step.actor) && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {step.date && new Date(step.date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                  {step.date && step.actor && " · "}
                  {step.actor}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
