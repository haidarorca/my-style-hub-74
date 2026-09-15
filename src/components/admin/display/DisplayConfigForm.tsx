import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CardStyle, DisplayConfig, GapSize, ImageRatio } from "@/lib/display/display-config";

const RATIOS: { value: ImageRatio; label: string }[] = [
  { value: "3/4", label: "Portrait 3:4" },
  { value: "1/1", label: "Carré 1:1" },
  { value: "4/3", label: "Paysage 4:3" },
  { value: "16/9", label: "Large 16:9" },
];

const STYLES: { value: CardStyle; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "normal", label: "Normal" },
  { value: "large", label: "Grand" },
];

const GAPS: { value: GapSize; label: string }[] = [
  { value: "tight", label: "Serré" },
  { value: "normal", label: "Normal" },
  { value: "wide", label: "Aéré" },
];

export function DisplayConfigForm({
  value,
  onChange,
}: {
  value: DisplayConfig;
  onChange: (next: DisplayConfig) => void;
}) {
  const set = <K extends keyof DisplayConfig>(k: K, v: DisplayConfig[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Cadre de l'image (jamais recadrée)</Label>
          <Select value={value.imageRatio} onValueChange={(v) => set("imageRatio", v as ImageRatio)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RATIOS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            L'image reste entière (aucun crop, aucun zoom) : seul le cadre change.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Style de carte</Label>
          <Select value={value.cardStyle} onValueChange={(v) => set("cardStyle", v as CardStyle)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STYLES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Produits par ligne — mobile</Label>
          <Select value={String(value.colsMobile)} onValueChange={(v) => set("colsMobile", Number(v))}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Produits par ligne — ordinateur</Label>
          <Select value={String(value.colsDesktop)} onValueChange={(v) => set("colsDesktop", Number(v))}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2, 3, 4, 5, 6].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Espacement</Label>
          <Select value={value.gap} onValueChange={(v) => set("gap", v as GapSize)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {GAPS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {([
          ["showName", "Afficher le nom"],
          ["showPrice", "Afficher le prix"],
          ["showButton", "Afficher le bouton d'ajout"],
          ["showBadges", "Afficher les badges"],
        ] as const).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <Label className="text-xs font-medium">{label}</Label>
            <Switch checked={value[key]} onCheckedChange={(c) => set(key, c)} />
          </div>
        ))}
      </div>
    </div>
  );
}
