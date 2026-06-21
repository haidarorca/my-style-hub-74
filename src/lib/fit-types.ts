// Types de coupe pour les vêtements, avec description visible vendeur + client.

export interface FitTypeOption {
  value: string;
  label: string;
  description: string;
}

export const FIT_TYPES: FitTypeOption[] = [
  { value: "slim", label: "Slim Fit", description: "Coupe près du corps." },
  { value: "ajuste", label: "Ajusté", description: "Entre Slim Fit et Regular Fit." },
  { value: "regular", label: "Regular Fit", description: "Coupe classique standard." },
  { value: "large", label: "Large Fit", description: "Coupe plus ample qu'une coupe classique." },
  { value: "oversize", label: "Oversize", description: "Coupe volontairement large." },
];

export function fitTypeOption(value: string | null | undefined): FitTypeOption | null {
  if (!value) return null;
  return FIT_TYPES.find((f) => f.value === value) ?? null;
}
