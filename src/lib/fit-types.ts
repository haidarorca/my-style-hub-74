// Types de coupe pour les vêtements, avec description visible vendeur + client.

export interface FitTypeOption {
  value: string;
  label: string;
  description: string;
}

export const FIT_TYPES: FitTypeOption[] = [
  { value: "slim", label: "Slim Fit", description: "Coupe très près du corps." },
  { value: "ajuste", label: "Ajusté", description: "Coupe légèrement près du corps sans être serrée." },
  { value: "regular", label: "Regular Fit", description: "Coupe classique standard." },
  { value: "large", label: "Large Fit", description: "Coupe plus ample qu'une coupe classique." },
  { value: "oversize", label: "Oversize", description: "Coupe volontairement très large et plus grande que la taille normale." },
];

export function fitTypeOption(value: string | null | undefined): FitTypeOption | null {
  if (!value) return null;
  return FIT_TYPES.find((f) => f.value === value) ?? null;
}
