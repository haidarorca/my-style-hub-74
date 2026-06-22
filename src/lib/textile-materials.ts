// Composition textile structurée (multiples matières + pourcentages).

export const TEXTILE_MATERIALS: string[] = [
  "Coton",
  "Polyester",
  "Élasthanne",
  "Viscose",
  "Lin",
  "Laine",
  "Soie",
  "Denim",
  "Cuir",
  "Nylon",
  "Acrylique",
  "Cachemire",
  "Satin",
  "Velours",
  "Mélange",
  "Autre",
];

export interface CompositionItem {
  material: string;
  percent: number;
}

export function totalPercent(items: CompositionItem[] | null | undefined): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((s, it) => s + (Number(it?.percent) || 0), 0);
}

export function isValidComposition(items: CompositionItem[] | null | undefined): boolean {
  if (!Array.isArray(items) || items.length === 0) return false;
  const total = totalPercent(items);
  if (Math.round(total) !== 100) return false;
  for (const it of items) {
    if (!it.material || !String(it.material).trim()) return false;
    if (!Number.isFinite(it.percent) || it.percent <= 0) return false;
  }
  // no duplicates
  const seen = new Set<string>();
  for (const it of items) {
    const k = it.material.toLowerCase().trim();
    if (seen.has(k)) return false;
    seen.add(k);
  }
  return true;
}

export function formatComposition(items: CompositionItem[] | null | undefined): string {
  if (!Array.isArray(items) || items.length === 0) return "";
  return items
    .filter((it) => it.material && Number(it.percent) > 0)
    .map((it) => `${Math.round(Number(it.percent))}% ${it.material.toLowerCase()}`)
    .join(", ");
}

export function primaryMaterial(items: CompositionItem[] | null | undefined): string | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  const sorted = [...items].sort((a, b) => (Number(b.percent) || 0) - (Number(a.percent) || 0));
  return sorted[0]?.material ?? null;
}
