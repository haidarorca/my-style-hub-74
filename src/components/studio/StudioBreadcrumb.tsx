// ============================================================
// StudioBreadcrumb — KawZone Studio
// Phase 2 : Fil d'ariane pour la navigation Studio
// ============================================================

import { ChevronRight, Home } from "lucide-react";

interface StudioBreadcrumbProps {
  templateLabel?: string;
  viewName?: string;
}

export function StudioBreadcrumb({ templateLabel, viewName }: StudioBreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Home className="h-3.5 w-3.5" />
      <span className="font-medium text-foreground">Studio</span>

      {templateLabel && (
        <>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground">{templateLabel}</span>
        </>
      )}

      {viewName && (
        <>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium truncate max-w-[200px]">{viewName}</span>
        </>
      )}
    </nav>
  );
}
