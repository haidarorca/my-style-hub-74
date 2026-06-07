import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Zap } from "lucide-react";
import { useWorkflowOrders } from "@/hooks/use-workflow-orders";
import { WorkflowTable } from "@/components/workflow";
import { QuickFilterBar } from "@/components/workflow";
import { WorkflowDrawer } from "@/components/workflow";
import { applyWorkflowFilter } from "@/lib/workflow.config";
import type { WorkflowRow, WorkflowFilterKey } from "@/types/workflow";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/admin/workflow-center")({
  component: WorkflowCenter,
});

function WorkflowCenter() {
  const { rows, counts, isLoading, error } = useWorkflowOrders();
  const [activeFilter, setActiveFilter] = useState<WorkflowFilterKey>("all");
  const [selectedRow, setSelectedRow] = useState<WorkflowRow | null>(null);

  const filteredRows = useMemo(
    () => applyWorkflowFilter(rows, activeFilter),
    [rows, activeFilter]
  );

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-right" richColors />

      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-orange-500" />
              <h1 className="text-lg font-bold">Workflow Center</h1>
              <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">
                BETA
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {rows.length} commande{rows.length > 1 ? "s" : ""} active
              {rows.length > 1 ? "s" : ""}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1400px] mx-auto px-4 py-4 space-y-4">
        {/* Filtres rapides */}
        <QuickFilterBar
          counts={counts}
          active={activeFilter}
          onChange={setActiveFilter}
        />

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              Chargement des commandes…
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-center py-12">
            <p className="text-sm text-red-600">
              Erreur : {error instanceof Error ? error.message : "Inconnue"}
            </p>
          </div>
        )}

        {/* Table */}
        {!isLoading && !error && (
          <WorkflowTable
            rows={filteredRows}
            onViewDetail={setSelectedRow}
          />
        )}
      </div>

      {/* Drawer détail */}
      <WorkflowDrawer
        row={selectedRow}
        onClose={() => setSelectedRow(null)}
      />
    </div>
  );
}
