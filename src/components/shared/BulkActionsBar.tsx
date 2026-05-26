/**
 * BulkActionsBar — Barre d'actions groupées flottante
 * Affiche quand des items sont selectionnes avec checkbox.
 * Usage : validation produits, changement statut commandes, gestion vendeurs.
 */
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckSquare, X, Loader2 } from "lucide-react";

export interface BulkAction<T = string> {
  id: T;
  label: string;
  variant?: "default" | "destructive" | "secondary" | "outline";
  icon?: React.ReactNode;
  onClick: (selectedIds: string[]) => void | Promise<void>;
}

interface BulkActionsBarProps {
  selectedIds: string[];
  totalCount: number;
  actions: BulkAction[];
  onClear: () => void;
  onSelectAll?: () => void;
  isLoading?: boolean;
  className?: string;
}

export function BulkActionsBar({
  selectedIds,
  totalCount,
  actions,
  onClear,
  onSelectAll,
  isLoading,
  className,
}: BulkActionsBarProps) {
  const count = selectedIds.length;
  if (count === 0) return null;

  return (
    <div
      className={cn(
        "sticky bottom-4 z-30 mx-auto max-w-2xl",
        "flex items-center gap-2 rounded-xl border bg-background/95 backdrop-blur shadow-lg px-4 py-3",
        className,
      )}
    >
      {/* Count */}
      <div className="flex items-center gap-2 shrink-0">
        <CheckSquare className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">
          {count} selectionne{count > 1 ? "s" : ""}
        </span>
        {onSelectAll && count < totalCount && (
          <button
            onClick={onSelectAll}
            className="text-[11px] text-primary hover:underline"
          >
            Tout ({totalCount})
          </button>
        )}
      </div>

      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        {actions.map((action) => (
          <Button
            key={action.id}
            size="sm"
            variant={action.variant ?? "default"}
            disabled={isLoading}
            onClick={() => action.onClick(selectedIds)}
            className="h-8 gap-1"
          >
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : action.icon}
            <span className="hidden sm:inline">{action.label}</span>
          </Button>
        ))}

        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={onClear}
          disabled={isLoading}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** Checkbox standardisee pour les lignes de tableau/liste */
export function BulkCheckbox({
  checked,
  onChange,
  className,
}: {
  checked: boolean | "indeterminate";
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <input
      type="checkbox"
      className={cn("h-4 w-4 rounded border-primary accent-primary cursor-pointer", className)}
      checked={checked === true}
      ref={(el) => {
        if (el) el.indeterminate = checked === "indeterminate";
      }}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}
