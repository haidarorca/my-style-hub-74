import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type RetentionValue = 7 | 30 | 60 | 90 | 365 | null;

export const RETENTION_OPTIONS: { value: RetentionValue; label: string }[] = [
  { value: 7, label: "7 jours" },
  { value: 30, label: "30 jours" },
  { value: 60, label: "60 jours" },
  { value: 90, label: "90 jours" },
  { value: 365, label: "1 an" },
  { value: null, label: "Jamais" },
];

export function retentionLabel(v: number | null) {
  return RETENTION_OPTIONS.find((o) => o.value === v)?.label ?? (v == null ? "Jamais" : `${v} jours`);
}

const enc = (v: RetentionValue | undefined) => (v === undefined ? "default" : v === null ? "never" : String(v));
const dec = (s: string): RetentionValue | undefined => (s === "default" ? undefined : s === "never" ? null : (Number(s) as RetentionValue));

export function RetentionSelect({ value, onChange, allowDefault }: {
  value: RetentionValue | undefined; onChange: (v: RetentionValue | undefined) => void; allowDefault?: boolean;
}) {
  return (
    <Select value={enc(value)} onValueChange={(s) => onChange(dec(s))}>
      <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {allowDefault && <SelectItem value="default">Durée par défaut</SelectItem>}
        {RETENTION_OPTIONS.map((o) => <SelectItem key={enc(o.value)} value={enc(o.value)}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
