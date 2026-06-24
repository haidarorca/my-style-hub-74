// ============================================================
// ColumnSelector — KawZone Studio
// Phase 2 : Sélection des colonnes affichées
// ============================================================

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { SchemaField } from "@/lib/studio/studio.types";

interface ColumnSelectorProps {
  fields: SchemaField[];
  selected: string[];
  onChange: (columns: string[]) => void;
}

export function ColumnSelector({ fields, selected, onChange }: ColumnSelectorProps) {
  const toggle = (fieldId: string) => {
    if (selected.includes(fieldId)) {
      onChange(selected.filter((c) => c !== fieldId));
    } else {
      onChange([...selected, fieldId]);
    }
  };

  return (
    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
      {fields
        .filter((f) => f.type !== "relation")
        .map((field) => (
          <div key={field.id} className="flex items-center gap-2">
            <Checkbox
              id={`col-${field.id}`}
              checked={selected.includes(field.id)}
              onCheckedChange={() => toggle(field.id)}
              disabled={field.id === "id"}
            />
            <Label htmlFor={`col-${field.id}`} className="text-sm cursor-pointer">
              {field.label}
              {field.id === "id" && <span className="text-muted-foreground text-xs ml-1">(obligatoire)</span>}
            </Label>
          </div>
        ))}
    </div>
  );
}
