// Détection des catégories de vêtements et champs de mesures associés.
// Utilisé pour activer le guide des tailles, les mesures par variante,
// et le blocage de publication.

const KEYWORDS = [
  "t-shirt", "tshirt", "chemise", "polo", "pull", "veste", "manteau",
  "pantalon", "jean", "short", "robe", "jupe", "ensemble", "abaya",
  "pyjama", "sous-vetement", "sous-vêtement", "lingerie", "maillot",
  "uniforme", "top", "haut", "blouse", "tunique", "vetement", "vêtement",
  "kimono", "boubou", "caftan", "kaftan", "djellaba",
];

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Renvoie true si l'une des chaînes fournies (nom/slug de catégorie à n'importe
 * quel niveau, ou nom du produit) ressemble à un vêtement.
 */
export function isClothingContext(...labels: Array<string | null | undefined>): boolean {
  for (const l of labels) {
    if (!l) continue;
    const x = norm(l);
    for (const kw of KEYWORDS) {
      if (x.includes(kw)) return true;
    }
  }
  return false;
}

export interface MeasurementField {
  key: string;
  label: string;
}

/**
 * Renvoie la liste des champs de mesures adaptés à la sous-catégorie détectée.
 * Toutes les valeurs sont en centimètres.
 */
export function getMeasurementFields(...labels: Array<string | null | undefined>): MeasurementField[] {
  const joined = labels.filter(Boolean).map((s) => norm(String(s))).join(" ");

  if (/(pantalon|jean|short)/.test(joined)) {
    return [
      { key: "waist_cm", label: "Tour de taille" },
      { key: "leg_length_cm", label: "Longueur jambe" },
    ];
  }
  if (/(robe|abaya|caftan|kaftan|djellaba|boubou)/.test(joined)) {
    return [
      { key: "chest_cm", label: "Poitrine" },
      { key: "waist_cm", label: "Taille" },
      { key: "length_cm", label: "Longueur totale" },
    ];
  }
  if (/(jupe)/.test(joined)) {
    return [
      { key: "waist_cm", label: "Tour de taille" },
      { key: "length_cm", label: "Longueur" },
    ];
  }
  if (/(veste|manteau|blouson)/.test(joined)) {
    return [
      { key: "chest_cm", label: "Poitrine" },
      { key: "shoulder_cm", label: "Épaules" },
      { key: "length_cm", label: "Longueur" },
      { key: "sleeve_cm", label: "Manche" },
    ];
  }
  // T-shirt / chemise / polo / pull / top / défaut vêtement haut
  return [
    { key: "chest_cm", label: "Poitrine" },
    { key: "length_cm", label: "Longueur" },
  ];
}

export function hasAnyMeasurement(m: Record<string, unknown> | null | undefined): boolean {
  if (!m || typeof m !== "object") return false;
  for (const v of Object.values(m)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return true;
  }
  return false;
}

export function formatMeasurements(
  m: Record<string, unknown> | null | undefined,
  fields: MeasurementField[],
): string {
  if (!m) return "";
  const parts: string[] = [];
  for (const f of fields) {
    const n = Number((m as any)[f.key]);
    if (Number.isFinite(n) && n > 0) parts.push(`${f.label} ${n} cm`);
  }
  return parts.join(" · ");
}
