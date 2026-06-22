import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export interface WarrantyValue {
  enabled: boolean;
  preset: string; // months as string, or "custom"
  customAmount: string;
  customUnit: "mois" | "ans";
}

interface Props {
  value: WarrantyValue;
  onChange: (v: WarrantyValue) => void;
}

const PRESET_MONTHS = [
  { v: "3", label: "3 mois" },
  { v: "6", label: "6 mois" },
  { v: "12", label: "12 mois (1 an)" },
  { v: "24", label: "24 mois (2 ans)" },
  { v: "36", label: "36 mois (3 ans)" },
];

export function WarrantyPicker({ value, onChange }: Props) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          checked={value.enabled}
          onCheckedChange={(v) => onChange({ ...value, enabled: !!v })}
          className="mt-0.5"
        />
        <span>✅ Ce produit bénéficie d'une garantie</span>
      </label>
      {value.enabled && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label className="text-[11px]">Durée</Label>
            <Select
              value={value.preset}
              onValueChange={(v) => onChange({ ...value, preset: v })}
            >
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRESET_MONTHS.map((p) => (
                  <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>
                ))}
                <SelectItem value="custom">Personnalisé…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {value.preset === "custom" && (
            <div className="grid grid-cols-[1fr_100px] gap-2">
              <div>
                <Label className="text-[11px]">Valeur</Label>
                <Input
                  type="number" min={1}
                  value={value.customAmount}
                  onChange={(e) => onChange({ ...value, customAmount: e.target.value })}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-[11px]">Unité</Label>
                <Select
                  value={value.customUnit}
                  onValueChange={(v) => onChange({ ...value, customUnit: v as "mois" | "ans" })}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mois">Mois</SelectItem>
                    <SelectItem value="ans">Ans</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Convert WarrantyValue to days for the DB. */
export function warrantyValueToDays(v: WarrantyValue): number | null {
  if (!v.enabled) return null;
  if (v.preset === "custom") {
    const n = Number(v.customAmount);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * (v.customUnit === "ans" ? 365 : 30));
  }
  const m = Number(v.preset);
  if (!Number.isFinite(m) || m <= 0) return null;
  return Math.round(m * 30);
}

/** Build WarrantyValue from stored days. */
export function warrantyDaysToValue(days: number | null | undefined): WarrantyValue {
  if (!days || days <= 0) return { enabled: false, preset: "12", customAmount: "", customUnit: "mois" };
  // try preset months
  const months = Math.round(days / 30);
  if ([3, 6, 12, 24, 36].includes(months) && Math.abs(months * 30 - days) <= 1) {
    return { enabled: true, preset: String(months), customAmount: "", customUnit: "mois" };
  }
  if (days % 365 === 0) {
    return { enabled: true, preset: "custom", customAmount: String(days / 365), customUnit: "ans" };
  }
  return { enabled: true, preset: "custom", customAmount: String(Math.round(days / 30)), customUnit: "mois" };
}
