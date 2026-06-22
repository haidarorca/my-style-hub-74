import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TEXTILE_MATERIALS, type CompositionItem, totalPercent, formatComposition,
} from "@/lib/textile-materials";

interface Props {
  items: CompositionItem[];
  onChange: (items: CompositionItem[]) => void;
}

export function CompositionEditor({ items, onChange }: Props) {
  const total = totalPercent(items);
  const ok = Math.round(total) === 100;

  const update = (i: number, patch: Partial<CompositionItem>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const add = () => onChange([...items, { material: "", percent: 0 }]);
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  return (
    <div className="rounded-lg border bg-background p-3 space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">Composition du tissu</Label>
        <span
          className={`text-[11px] font-semibold ${
            items.length === 0
              ? "text-muted-foreground"
              : ok
                ? "text-emerald-700"
                : "text-destructive"
          }`}
        >
          Total : {Math.round(total)}% {ok ? "✓" : items.length > 0 ? "— doit être 100%" : ""}
        </span>
      </div>

      {items.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Ajoutez chaque matière et son pourcentage. Le total doit être 100%.
        </p>
      )}

      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-[1fr_90px_36px] items-center gap-2">
            <Select value={it.material} onValueChange={(v) => update(i, { material: v })}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Matière…" /></SelectTrigger>
              <SelectContent>
                {TEXTILE_MATERIALS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Input
                className="h-8 pr-6"
                type="number" min={0} max={100} step={1}
                value={it.percent || ""}
                onChange={(e) => update(i, { percent: Number(e.target.value) || 0 })}
                placeholder="0"
              />
              <span className="absolute right-2 top-1.5 text-xs text-muted-foreground">%</span>
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(i)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={add} className="h-7 gap-1 text-xs">
        <Plus className="h-3.5 w-3.5" /> Ajouter une matière
      </Button>

      {items.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Aperçu : <span className="font-medium">{formatComposition(items) || "—"}</span>
        </p>
      )}
    </div>
  );
}
