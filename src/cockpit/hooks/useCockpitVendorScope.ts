// ═══════════════════════════════════════════════════════════════
// useCockpitVendorScope — Récupère le scope Cockpit pour un set
// de vendor_ids. Renvoie un Map vendor_id → VendorScopeRow.
//
// Le scope détermine si une sous-commande nécessite une
// intervention administrative Kawzone (et donc sa présence
// dans le Cockpit principal).
// ═══════════════════════════════════════════════════════════════

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCockpitVendorScope, type VendorScopeRow } from "@/lib/cockpit-vendor-scope.functions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useCockpitVendorScope(vendorIds: string[]) {
  const ids = useMemo(() => {
    const set = new Set<string>();
    for (const v of vendorIds) {
      if (v && UUID_RE.test(v)) set.add(v);
    }
    return Array.from(set).sort();
  }, [vendorIds]);

  const key = ids.join(",");
  const { data, isLoading } = useQuery({
    queryKey: ["cockpit-vendor-scope", key],
    queryFn: () => getCockpitVendorScope({ data: { vendor_ids: ids } }),
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
  });

  const map = useMemo(() => {
    const m = new Map<string, VendorScopeRow>();
    for (const r of data ?? []) m.set(r.vendor_id, r);
    return m;
  }, [data]);

  return { map, isLoading };
}
