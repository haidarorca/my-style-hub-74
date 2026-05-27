/**
 * MiniTimeline — Timeline compacte 8 étapes
 * ○───●───○───○───○───○───○
 * Fait = ● filled, Actif = ◐ filled+subtle, À venir = ○ empty
 */
import { cn } from "@/lib/utils";

interface MiniTimelineProps {
  steps: Array<{ key: string; label: string }>;
  currentStep: number; // 0-based index
  className?: string;
}

export function MiniTimeline({ steps, currentStep, className }: MiniTimelineProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {steps.map((step, i) => {
        const isDone = i < currentStep;
        const isActive = i === currentStep;
        const isFuture = i > currentStep;

        return (
          <div key={step.key} className="flex items-center gap-1">
            {/* Connector */}
            {i > 0 && (
              <div
                className={cn(
                  "h-[2px] w-3 rounded-full transition-colors duration-300",
                  isDone ? "bg-primary" : "bg-border",
                )}
              />
            )}
            {/* Dot */}
            <div className="flex flex-col items-center gap-0.5">
              <div
                className={cn(
                  "h-2.5 w-2.5 rounded-full border-2 transition-all duration-300",
                  isDone && "bg-primary border-primary",
                  isActive && "bg-primary/80 border-primary shadow-[0_0_6px_rgba(99,102,241,0.4)]",
                  isFuture && "bg-transparent border-muted-foreground/30",
                )}
              />
              {/* Label (only show for done, active, and next) */}
              {(isDone || isActive || i === currentStep + 1) && (
                <span
                  className={cn(
                    "admin-text-[9px] whitespace-nowrap",
                    isActive ? "text-primary font-medium" : "text-muted-foreground/50",
                  )}
                >
                  {step.label}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Workflow adaptatif prédéfini
export const WORKFLOW_LOCAL = [
  { key: "new", label: "Nouvelle" },
  { key: "confirmed", label: "Confirmée" },
  { key: "delivered", label: "Livrée" },
];

export const WORKFLOW_IMPORT = [
  { key: "new", label: "Cmd" },
  { key: "warehouse", label: "Ent" },
  { key: "weighing", label: "Pes" },
  { key: "sent", label: "Env" },
  { key: "payment", label: "Pai" },
  { key: "validated", label: "Val" },
  { key: "shipped", label: "Exp" },
  { key: "delivered", label: "Liv" },
];

export const WORKFLOW_MIXED = [
  { key: "new", label: "Nouvelle" },
  { key: "confirmed", label: "Confirmée" },
  { key: "evaluation", label: "Éval" },
  { key: "shipped", label: "Expédié" },
  { key: "delivered", label: "Livrée" },
];

export function getWorkflow(orderType: string) {
  if (orderType === "import") return WORKFLOW_IMPORT;
  if (orderType === "mixed") return WORKFLOW_MIXED;
  return WORKFLOW_LOCAL;
}
