import { useState, useMemo, useCallback } from "react";
import type { WorkflowRow } from "@/types/workflow";

/* ═══════════════════════════════════════════════════════════════
   USE WORKFLOW FILTERS — Système de filtres combinatoires Excel
   Tous les filtres sont combinés avec AND logique
   ═══════════════════════════════════════════════════════════════ */

export interface FilterState {
  search: string;
  countries: string[];          // pays (destination_country_name)
  orderTypes: string[];         // "local" | "import" | "mixed"
  logisticsStatuses: string[];  // statuts logistiques
  paymentStatuses: string[];    // "paid" | "partial" | "pending" | "cod"
  dateFrom: string | null;      // date création min
  dateTo: string | null;        // date création max
  amountMin: number | null;     // montant min
  amountMax: number | null;     // montant max
  daysMin: number | null;       // jours attente min
  daysMax: number | null;       // jours attente max
  hasDebt: boolean | null;      // true = dette, false = payé, null = tous
}

export const DEFAULT_FILTERS: FilterState = {
  search: "",
  countries: [],
  orderTypes: [],
  logisticsStatuses: [],
  paymentStatuses: [],
  dateFrom: null,
  dateTo: null,
  amountMin: null,
  amountMax: null,
  daysMin: null,
  daysMax: null,
  hasDebt: null,
};

/** Détection du statut de paiement simplifié */
function getPaymentStatus(row: WorkflowRow): "paid" | "partial" | "pending" | "cod" {
  const rem = row.amount_remaining ?? 0;
  const paid = row.amount_paid ?? 0;
  if (rem <= 0 && paid > 0) return "paid";
  if (paid > 0 && rem > 0) return "partial";
  if (row.payment_status === "cod" || row.payment_status === "reception") return "cod";
  return "pending";
}

export function useWorkflowFilters(rows: WorkflowRow[]) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  /** Nombre de filtres actifs */
  const activeCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.countries.length > 0) count++;
    if (filters.orderTypes.length > 0) count++;
    if (filters.logisticsStatuses.length > 0) count++;
    if (filters.paymentStatuses.length > 0) count++;
    if (filters.dateFrom || filters.dateTo) count++;
    if (filters.amountMin !== null || filters.amountMax !== null) count++;
    if (filters.daysMin !== null || filters.daysMax !== null) count++;
    if (filters.hasDebt !== null) count++;
    return count;
  }, [filters]);

  /** Lignes filtrées */
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // 1. Recherche textuelle
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const match =
          (row.customer_name ?? "").toLowerCase().includes(q) ||
          (row.customer_phone ?? "").toLowerCase().includes(q) ||
          (row.order_id ?? "").toLowerCase().includes(q) ||
          (row.tracking_number ?? "").toLowerCase().includes(q) ||
          (row.admin_comment ?? "").toLowerCase().includes(q) ||
          String(row.order_total ?? "").includes(q) ||
          String(row.amount_remaining ?? "").includes(q);
        if (!match) return false;
      }

      // 2. Pays
      if (filters.countries.length > 0) {
        const country = row.destination_country_name ?? "Non spécifié";
        if (!filters.countries.includes(country)) return false;
      }

      // 3. Type
      if (filters.orderTypes.length > 0) {
        if (!filters.orderTypes.includes(row.order_type ?? "local")) return false;
      }

      // 4. Statut logistique
      if (filters.logisticsStatuses.length > 0) {
        const ls = row.logistics_status ?? "new";
        if (!filters.logisticsStatuses.includes(ls)) return false;
      }

      // 5. Statut paiement
      if (filters.paymentStatuses.length > 0) {
        const ps = getPaymentStatus(row);
        if (!filters.paymentStatuses.includes(ps)) return false;
      }

      // 6. Date
      if (filters.dateFrom || filters.dateTo) {
        const created = row.order_created_at ? new Date(row.order_created_at).getTime() : 0;
        if (filters.dateFrom) {
          const from = new Date(filters.dateFrom).getTime();
          if (created < from) return false;
        }
        if (filters.dateTo) {
          const to = new Date(filters.dateTo).getTime() + 86400000; // fin de journée
          if (created > to) return false;
        }
      }

      // 7. Montant
      const total = row.order_total ?? 0;
      if (filters.amountMin !== null && total < filters.amountMin) return false;
      if (filters.amountMax !== null && total > filters.amountMax) return false;

      // 8. Jours d'attente
      const days = row.days_pending ?? 0;
      if (filters.daysMin !== null && days < filters.daysMin) return false;
      if (filters.daysMax !== null && days > filters.daysMax) return false;

      // 9. Dette
      if (filters.hasDebt !== null) {
        const hasDebt = (row.amount_remaining ?? 0) > 0;
        if (hasDebt !== filters.hasDebt) return false;
      }

      return true;
    });
  }, [rows, filters]);

  /** Valeurs uniques pour les selects (calculés sur toutes les rows) */
  const options = useMemo(() => {
    const countries = [...new Set(rows.map((r) => r.destination_country_name).filter(Boolean))];
    const orderTypes = [...new Set(rows.map((r) => r.order_type).filter(Boolean))];
    const logisticsStatuses = [...new Set(rows.map((r) => r.logistics_status).filter(Boolean))];
    const maxAmount = Math.max(...rows.map((r) => r.order_total ?? 0), 1);
    const maxDays = Math.max(...rows.map((r) => r.days_pending ?? 0), 1);
    return { countries, orderTypes, logisticsStatuses, maxAmount, maxDays };
  }, [rows]);

  const updateFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const toggleArrayValue = useCallback(<K extends keyof FilterState>(key: K, value: string) => {
    setFilters((prev) => {
      const arr = (prev[key] as string[]).slice();
      const idx = arr.indexOf(value);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(value);
      return { ...prev, [key]: arr };
    });
  }, []);

  return {
    filters,
    activeCount,
    filteredRows,
    options,
    updateFilter,
    resetFilters,
    toggleArrayValue,
  };
}
