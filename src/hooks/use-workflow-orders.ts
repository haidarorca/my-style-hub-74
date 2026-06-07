import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listLogisticsOrders } from "@/lib/admin-logistics.functions";
import type { WorkflowRow, WorkflowFilterKey } from "@/types/workflow";
import { applyWorkflowFilter, computeFilterCounts } from "@/lib/workflow.config";

export function useWorkflowOrders() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["workflow-orders"],
    queryFn: async () => {
      const result = await listLogisticsOrders({
        data: { page: 1, pageSize: 500 },
      });
      return result;
    },
  });

  const rows: WorkflowRow[] = useMemo(
    () => (data?.rows ?? []) as WorkflowRow[],
    [data]
  );

  const counts = useMemo(() => computeFilterCounts(rows), [rows]);

  const applyFilter = (filter: WorkflowFilterKey): WorkflowRow[] => {
    return applyWorkflowFilter(rows, filter);
  };

  const urgentRows = useMemo(
    () => rows.filter((r) => r.days_pending > 7),
    [rows]
  );

  return {
    rows,
    counts,
    applyFilter,
    urgentRows,
    isLoading,
    error,
  };
}
