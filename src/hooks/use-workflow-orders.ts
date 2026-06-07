import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listLogisticsOrders } from "@/lib/admin-logistics.functions";
import type { WorkflowRow, WorkflowFilterKey, CustomerSnapshot, CustomerTier } from "@/types/workflow";
import { applyWorkflowFilter, computeFilterCounts } from "@/lib/workflow.config";

function computeCustomerTier(remaining: number, orderCount: number, totalSpent: number): CustomerTier {
  if (remaining > 500_000) return "blocked";
  if (orderCount >= 20 || totalSpent >= 5_000_000) return "vip";
  if (orderCount >= 3) return "regular";
  return "new";
}

function buildCustomerMap(rows: WorkflowRow[]): Map<string, CustomerSnapshot> {
  const map = new Map<string, CustomerSnapshot>();
  const phoneMap = new Map<string, { totalRemaining: number; totalSpent: number; count: number; name: string }>();

  for (const row of rows) {
    const phone = row.customer_phone;
    if (!phone) continue;
    const acc = phoneMap.get(phone) ?? { totalRemaining: 0, totalSpent: 0, count: 0, name: row.customer_name ?? "" };
    acc.totalRemaining += row.amount_remaining ?? 0;
    acc.totalSpent += row.order_total ?? 0;
    acc.count += 1;
    if (row.customer_name) acc.name = row.customer_name;
    phoneMap.set(phone, acc);
  }

  for (const [phone, acc] of phoneMap) {
    const tier = computeCustomerTier(acc.totalRemaining, acc.count, acc.totalSpent);
    map.set(phone, {
      phone,
      name: acc.name,
      total_remaining: acc.totalRemaining,
      total_spent: acc.totalSpent,
      order_count: acc.count,
      tier,
    });
  }

  return map;
}

export function useWorkflowOrders() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["workflow-orders"],
    queryFn: async () => {
      const result = await listLogisticsOrders({
        data: { page: 1, pageSize: 100 },
      });
      return result;
    },
  });

  const rawRows: WorkflowRow[] = useMemo(
    () => (data?.rows ?? []) as WorkflowRow[],
    [data]
  );

  // Agrégation client en mémoire — injecte customer dans chaque row
  const rows: WorkflowRow[] = useMemo(() => {
    if (rawRows.length === 0) return rawRows;
    const customerMap = buildCustomerMap(rawRows);
    return rawRows.map((row) => {
      const customer = row.customer_phone ? customerMap.get(row.customer_phone) : undefined;
      return customer ? { ...row, customer } : row;
    });
  }, [rawRows]);

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
