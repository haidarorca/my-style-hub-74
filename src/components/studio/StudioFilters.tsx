// ============================================================
// StudioFilters — KawZone Studio
// Phase 2 : Formulaire de filtres (champ + opérateur + valeur)
// ============================================================

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SchemaField, StudioFilter, StudioFilterOp } from "@/lib/studio/studio.types";
import { getAllowedOperators } from "@/lib/studio/schema-registry";

interface StudioFiltersProps {
  fields: SchemaField[];
  filters: StudioFilter[];
  onChange: (filters: StudioFilter[]) => void;
}

export function StudioFilters({ fields, filters, onChange }: StudioFiltersProps) {
  const addFilter = () => {
    const firstField = fields.find((f) => f.filterable);
    if (!firstField) return;
    onChange([
      ...filters,
      { field: firstField.id, op: "eq", value: "" },
    ]);
  };

  const updateFilter = (idx: number, patch: Partial<StudioFilter>) => {
    const next = filters.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    onChange(next);
  };

  const removeFilter = (idx: number) => {
    onChange(filters.filter((_, i) => i !== idx));
  };

  const filterableFields = fields.filter((f) => f.filterable);

  return (
    <div className="space-y-3">
      {filters.map((filter, idx) => {
        const field = fields.find((f) => f.id === filter.field);
        const ops = field ? getAllowedOperators(field.type) : [];

        return (
          <div key={idx} className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <Label className="text-xs">Champ</Label>
              <Select
                value={filter.field}
                onValueChange={(v) => updateFilter(idx, { field: v, op: "eq", value: "" })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {filterableFields.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-28 shrink-0">
              <Label className="text-xs">Opérateur</Label>
              <Select
                value={filter.op}
                onValueChange={(v) => updateFilter(idx, { op: v as StudioFilterOp })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ops.map((op) => (
                    <SelectItem key={op} value={op}>
                      {op}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-0">
              <Label className="text-xs">Valeur</Label>
              <Input
                className="h-8 text-xs"
                value={String(filter.value ?? "")}
                onChange={(e) => updateFilter(idx, { value: e.target.value })}
                placeholder="..."
              />
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => removeFilter(idx)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      })}

      {filters.length < 5 && (
        <Button variant="outline" size="sm" className="text-xs" onClick={addFilter}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Ajouter un filtre
        </Button>
      )}
    </div>
  );
}
