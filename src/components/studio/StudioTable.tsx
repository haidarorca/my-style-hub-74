// ============================================================
// StudioTable — KawZone Studio
// Phase 2 : Tableau générique avec tri, pagination
// Architecture : supporte viewType (table/cards/pipeline/kpi)
// MVP : seul "table" est implémenté
// ============================================================

import { ChevronUp, ChevronDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationBar } from "@/components/ui/pagination-bar";
import type { SchemaField } from "@/lib/studio/studio.types";

export type StudioViewType = "table" | "cards" | "pipeline" | "kpi";

interface StudioTableProps {
  viewType: StudioViewType;
  columns: string[];
  fields: SchemaField[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  sortField: string | null;
  sortDir: "asc" | "desc";
  onSort: (field: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  loading?: boolean;
}

export function StudioTable({
  viewType,
  columns,
  fields,
  rows,
  total,
  page,
  pageSize,
  sortField,
  sortDir,
  onSort,
  onPageChange,
  onPageSizeChange,
  loading,
}: StudioTableProps) {
  // Seul "table" est implémenté pour le MVP
  // Les autres modes sont des placeholders pour l'architecture future
  if (viewType !== "table") {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Mode "{viewType}" disponible dans une future version.
      </div>
    );
  }

  const fieldMap = new Map(fields.map((f) => [f.id, f]));

  const getColumnLabel = (colId: string) => fieldMap.get(colId)?.label ?? colId;

  const formatValue = (colId: string, value: unknown): string => {
    if (value === null || value === undefined) return "—";
    const field = fieldMap.get(colId);
    if (field?.format === "currency") return `${Number(value).toLocaleString()} FCFA`;
    if (field?.format === "date" || field?.format === "datetime") {
      const d = new Date(String(value));
      return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("fr-FR");
    }
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col}
                  className="cursor-pointer select-none whitespace-nowrap"
                  onClick={() => onSort(col)}
                >
                  <div className="flex items-center gap-1">
                    {getColumnLabel(col)}
                    {sortField === col && (
                      sortDir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((col) => (
                    <TableCell key={col}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">
                  Aucun résultat
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, idx) => (
                <TableRow key={idx}>
                  {columns.map((col) => (
                    <TableCell key={col} className="text-sm whitespace-nowrap">
                      {formatValue(col, row[col])}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PaginationBar
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={onPageChange}
      />

    </div>
  );
}
