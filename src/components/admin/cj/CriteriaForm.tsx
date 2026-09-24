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
  maxStock: null, minWeightKg: null, minImages: null, maxSideCm: null, maxCbm: null, material: "",
  countryCode: null, freeShipping: false, newArrivals: false, hasVideo: false, verifiedOnly: false,
  listedAfter: null, orderBy: null, sort: null,
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
  const checks: Array<[keyof Pick<Criteria, "requireImages" | "requireSku" | "requireWeight" | "requireDimensions" | "newOnly" | "freeShipping" | "newArrivals" | "hasVideo" | "verifiedOnly">, string]> = [
    ["newArrivals", "Nouveautés CJ"],
    ["verifiedOnly", "Stock vérifié"],
    ["hasVideo", "Avec vidéo"],
    ["freeShipping", "Livraison CJ offerte"],
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
        <NumField label="Stock max" value={value.maxStock} onChange={(v) => set({ maxStock: v })} step="1" />
        <NumField label="Poids min (kg)" value={value.minWeightKg} onChange={(v) => set({ minWeightKg: v })} />
        <NumField label="Images min" value={value.minImages} onChange={(v) => set({ minImages: v })} step="1" />
        <NumField label="Plus grand côté max (cm)" value={value.maxSideCm} onChange={(v) => set({ maxSideCm: v })} />
        <NumField label="Volume max (m³)" value={value.maxCbm} onChange={(v) => set({ maxCbm: v })} />
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Matière contient</Label>
          <Input value={value.material ?? ""} onChange={(e) => set({ material: e.target.value })} placeholder="ex. Coton, Métal" className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Stock dans le pays</Label>
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={value.countryCode ?? ""} onChange={(e) => set({ countryCode: e.target.value || null })}>
            <option value="">Tous</option><option value="CN">Chine</option><option value="US">États-Unis</option><option value="GB">Royaume-Uni</option><option value="FR">France</option><option value="DE">Allemagne</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Mis en ligne chez CJ après</Label>
          <Input type="date" value={value.listedAfter ?? ""} onChange={(e) => set({ listedAfter: e.target.value || null })} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Trier par</Label>
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={value.orderBy == null ? "" : `${value.orderBy}:${value.sort ?? "desc"}`} onChange={(e) => { const [o, so] = e.target.value.split(":"); set(e.target.value ? { orderBy: Number(o), sort: so as "asc" | "desc" } : { orderBy: null, sort: null }); }}>
            <option value="">Pertinence</option><option value="2:asc">Prix croissant</option><option value="2:desc">Prix décroissant</option><option value="3:desc">Plus récents</option><option value="4:desc">Plus de stock</option><option value="1:desc">Plus vendus</option>
          </select>
        </div>
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
        Prix, stock, pays, catégorie, nouveautés, vidéo, date et tri sont filtrés directement par CJ. Poids, dimensions, volume, matière, images, SKU et variantes sont vérifiés côté serveur sur la fiche complète, dans la recherche comme à l'import : un produit qui ne remplit pas ces critères est écarté, jamais créé.
      </p>
    </div>
  );
}
