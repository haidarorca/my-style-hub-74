// ============================================================
// Hook useStudioQuery — KawZone Studio
// Phase 2 : Exécution de requêtes avec pagination
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { executeQuery } from "@/lib/studio/studio.functions";
import type { ExecuteQueryParams, ExecuteQueryResult } from "@/lib/studio/studio.types";

export function useStudioQuery(params: ExecuteQueryParams, enabled = true) {
  return useQuery<ExecuteQueryResult>({
    queryKey: ["studio", "query", params.templateKey, params.columns, params.filters, params.sort, params.page, params.pageSize],
    queryFn: async () => {
      const result = await executeQuery({ data: params });
      return result;
    },
    enabled,
    staleTime: 30_000,
  });
}
