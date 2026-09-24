import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Criteria } from "@/lib/cj-center.functions";

export const EMPTY_CRITERIA: Criteria = {
  keyword: "",
  categoryId: null,
  minPrice: null,
  maxPrice: null,
  minStock: null,
  maxWeightKg: null,
  minVariants: null,
  maxVariants: null,
  requireImages: false,
  requireSku: false,
  requireWeight: false,
  requireDimensions: false,
  newOnly: true,
};

function NumField({ label, value, onChange, step = "any" }: { label: string; value: number | null | undefined; onChange: (v: number | null) => void; step?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        inputMode="decimal"
        type="number"
        step={step}
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value.replace(",", ".");
          onChange(raw === "" ? null : Number(raw));
        }}
        className="h-9"
      />
    </div>
  );
}

export function CriteriaForm({
  value,
  onChange,
  categories,
  hideMain = false,
}: {
  value: Criteria;
  onChange: (c: Criteria) => void;
  categories: Array<{ id: string; path: string }>;
  hideMain?: boolean;
}) {
  const set = (patch: Partial<Criteria>) => onChange({ ...value, ...patch });
  const catLabel = categories.find((c) => c.id === value.categoryId)?.path ?? "";
  const checks: Array<[keyof Pick<Criteria, "requireImages" | "requireSku" | "requireWeight" | "requireDimensions" | "newOnly">, string]> = [
    ["requireImages", "Avec images"],
    ["requireSku", "Avec SKU"],
    ["requireWeight", "Avec poids"],
    ["requireDimensions", "Avec dimensions"],
  ];
  if (!hideMain) checks.push(["newOnly", "Nouveaux uniquement"]);
  return (
    <div className="space-y-3">
      {!hideMain && <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Mot-clé, SKU</Label>
          <Input value={value.keyword ?? ""} onChange={(e) => set({ keyword: e.target.value })} placeholder="ex. irrigation, drip, sprinkler" className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Catégorie CJ</Label>
          <Input
            list="cj-cat-list"
            defaultValue={catLabel}
            key={value.categoryId ?? "none"}
            placeholder={categories.length ? "Tapez pour chercher une catégorie" : "Chargement…"}
            className="h-9"
            onBlur={(e) => {
              const hit = categories.find((c) => c.path === e.target.value);
              set({ categoryId: hit ? hit.id : null });
            }}
          />
          <datalist id="cj-cat-list">
            {categories.map((c) => <option key={c.id} value={c.path} />)}
          </datalist>
        </div>
      </div>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NumField label="Prix min (USD)" value={value.minPrice} onChange={(v) => set({ minPrice: v })} />
        <NumField label="Prix max (USD)" value={value.maxPrice} onChange={(v) => set({ maxPrice: v })} />
        <NumField label="Stock min" value={value.minStock} onChange={(v) => set({ minStock: v })} step="1" />
        <NumField label="Poids max (kg)" value={value.maxWeightKg} onChange={(v) => set({ maxWeightKg: v })} />
        <NumField label="Variantes min" value={value.minVariants} onChange={(v) => set({ minVariants: v })} step="1" />
        <NumField label="Variantes max" value={value.maxVariants} onChange={(v) => set({ maxVariants: v })} step="1" />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {checks.map(([k, label]) => (
          <label key={k} className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={!!value[k]} onChange={(e) => set({ [k]: e.target.checked } as any)} />
            {label}
          </label>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Prix, stock et catégorie sont filtrés directement par CJ. Poids, dimensions, SKU, images et nombre de variantes sont vérifiés sur la fiche complète au moment de l'import : un produit qui ne remplit pas ces critères est « ignoré », jamais créé.
      </p>
    </div>
  );
}
