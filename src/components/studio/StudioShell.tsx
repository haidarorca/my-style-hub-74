// ============================================================
// StudioShell — KawZone Studio
// Phase 2 : Layout de la page Studio
// ============================================================

import { BarChart3, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudioBreadcrumb } from "./StudioBreadcrumb";

interface StudioShellProps {
  templateLabel?: string;
  viewName?: string;
  onReset?: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function StudioShell({ templateLabel, viewName, onReset, actions, children }: StudioShellProps) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">Studio</h1>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              Beta
            </span>
          </div>
          <StudioBreadcrumb templateLabel={templateLabel} viewName={viewName} />
        </div>

        <div className="flex items-center gap-2">
          {actions}
          {onReset && (
            <Button variant="ghost" size="sm" onClick={onReset}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Réinitialiser
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {children}
    </div>
  );
}
