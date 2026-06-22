import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSavCounts } from "@/lib/sav-workflow.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type SavScope = "client" | "vendor" | "admin";

export function useSavCounts(scope: SavScope) {
  const { user } = useAuth();
  const counts = useServerFn(getSavCounts);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["sav-counts", scope, user?.id],
    queryFn: () => counts({ data: { scope } }),
    enabled: !!user,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`sav-counts-${scope}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sav_cases" }, () => {
        qc.invalidateQueries({ queryKey: ["sav-counts", scope] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [scope, user, qc]);

  return query.data ?? { new: 0, pending: 0, urgent: 0, total: 0 };
}
