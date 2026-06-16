// ═══════════════════════════════════════════════════════════════
// useCockpitFilters — État + options dérivées du moteur de filtres.
// AND entre catégories, OR à l'intérieur d'une catégorie.
// ═══════════════════════════════════════════════════════════════

import { useCallback, useMemo, useState } from "react";
import {
  DEFAULT_COCKPIT_FILTERS,
  activeFilterCount,
  matchSubOrder,
  type CockpitFilterState,
} from "@/cockpit/lib/cockpit-filters";
import type { SubOrderRow } from "@/cockpit/hooks/useSubOrderRows";
import type { VendorProfileMap } from "@/cockpit/hooks/useVendorProfiles";
import type { SubOrderHistoryMap } from "@/cockpit/hooks/useSubOrderHistories";

interface UseCockpitFiltersArgs {
  rows: SubOrderRow[];
  vendorProfiles: VendorProfileMap | undefined;
  historyMap: SubOrderHistoryMap | undefined;
}

export function useCockpitFilters({ rows, vendorProfiles, historyMap }: UseCockpitFiltersArgs) {
  const [filters, setFilters] = useState<CockpitFilterState>(DEFAULT_COCKPIT_FILTERS);

  const update = useCallback(<K extends keyof CockpitFilterState>(k: K, v: CockpitFilterState[K]) => {
    setFilters(prev => ({ ...prev, [k]: v }));
  }, []);

  const toggleArray = useCallback(<K extends keyof CockpitFilterState>(k: K, v: string) => {
    setFilters(prev => {
      const arr = (prev[k] as unknown as string[]).slice();
      const i = arr.indexOf(v);
      if (i >= 0) arr.splice(i, 1); else arr.push(v);
      return { ...prev, [k]: arr as CockpitFilterState[K] };
    });
  }, []);

  const reset = useCallback(() => setFilters(DEFAULT_COCKPIT_FILTERS), []);

  // ─── Options dynamiques (alimentent les puces du panneau) ───
  const options = useMemo(() => {
    const statuses = new Set<string>();
    const vendorCountries = new Map<string, string>(); // id -> name
    const marketCountries = new Map<string, string>();
    const productOrigins = new Set<string>();

    for (const r of rows) {
      const s = (r.order.logistics_status ?? "new").trim() || "new";
      statuses.add(s);
      const profile = vendorProfiles?.get(r.vendor_id);
      if (profile?.source_country_id) {
        vendorCountries.set(profile.source_country_id, profile.source_country_name ?? profile.source_country_id);
      }
      if (r.order.destination_country_id) {
        marketCountries.set(r.order.destination_country_id, r.order.destination_country_name ?? r.order.destination_country_id);
      }
      for (const a of r.articles) {
        if (a.origin_country) productOrigins.add(a.origin_country);
      }
    }

    const sortByLabel = (a: [string, string], b: [string, string]) => a[1].localeCompare(b[1], "fr");
    return {
      statuses: [...statuses].sort(),
      vendorCountries: [...vendorCountries.entries()].sort(sortByLabel),
      marketCountries: [...marketCountries.entries()].sort(sortByLabel),
      productOrigins: [...productOrigins].sort((a, b) => a.localeCompare(b, "fr")),
    };
  }, [rows, vendorProfiles]);

  const filteredRows = useMemo(() => {
    return rows.filter(r => matchSubOrder(r, filters, { vendorProfiles, historyMap }));
  }, [rows, filters, vendorProfiles, historyMap]);

  const count = useMemo(() => activeFilterCount(filters), [filters]);

  return { filters, filteredRows, options, count, update, toggleArray, reset, setFilters };
}
