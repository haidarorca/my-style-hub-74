// Attributs vêtements : saison, genre, tranche d'âge, instructions d'entretien.

export const SEASONS = [
  { value: "ete", label: "Été" },
  { value: "hiver", label: "Hiver" },
  { value: "printemps", label: "Printemps" },
  { value: "automne", label: "Automne" },
  { value: "toutes_saisons", label: "Toutes saisons" },
] as const;

export const GENDERS = [
  { value: "homme", label: "Homme" },
  { value: "femme", label: "Femme" },
  { value: "mixte", label: "Mixte" },
  { value: "garcon", label: "Garçon" },
  { value: "fille", label: "Fille" },
  { value: "bebe", label: "Bébé" },
] as const;

export const AGE_GROUPS = [
  { value: "bebe", label: "Bébé" },
  { value: "enfant", label: "Enfant" },
  { value: "ado", label: "Adolescent" },
  { value: "adulte", label: "Adulte" },
] as const;

export const CARE_INSTRUCTIONS = [
  { value: "lavage_machine", label: "Lavage machine" },
  { value: "lavage_main", label: "Lavage à la main" },
  { value: "eau_froide", label: "Lavage à l'eau froide (≤30°C)" },
  { value: "pas_seche_linge", label: "Pas de sèche-linge" },
  { value: "repassage_ok", label: "Repassage autorisé" },
  { value: "pas_repassage", label: "Ne pas repasser" },
  { value: "nettoyage_sec", label: "Nettoyage à sec" },
  { value: "pas_javel", label: "Ne pas javelliser" },
] as const;

export function labelOf<T extends { value: string; label: string }>(
  list: readonly T[],
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return list.find((x) => x.value === value)?.label ?? null;
}
