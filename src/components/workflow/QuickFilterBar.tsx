import { Button } from "@/components/ui/button";
import type { WorkflowFilterKey } from "@/types/workflow";
import { WORKFLOW_FILTERS } from "@/lib/workflow.config";

interface Props {
  counts: Record<WorkflowFilterKey, number>;
  active: WorkflowFilterKey;
  onChange: (key: WorkflowFilterKey) => void;
}

export function QuickFilterBar({ counts, active, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2 pb-4 border-b">
      {WORKFLOW_FILTERS.map((f) => {
        const isActive = active === f.key;
        const count = counts[f.key] ?? 0;

        return (
          <Button
            key={f.key}
            variant={isActive ? "default" : "outline"}
            size="sm"
            onClick={() => onChange(f.key)}
            className={`h-8 text-xs font-medium rounded-full px-3 ${
              isActive ? "" : "bg-background hover:bg-accent"
            }`}
          >
            <span>{f.label}</span>
            {count > 0 && (
              <span
                className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold ${
                  isActive
                    ? "bg-white/20 text-white"
                    : f.key === "urgent"
                      ? "bg-red-100 text-red-700"
                      : f.key === "to_weigh"
                        ? "bg-orange-100 text-orange-700"
                        : "bg-muted text-muted-foreground"
                }`}
              >
                {count}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
