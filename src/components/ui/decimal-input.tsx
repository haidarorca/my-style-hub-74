import * as React from "react";
import { Input } from "@/components/ui/input";
import { normalizeDecimalInput } from "@/lib/decimal";

type Props = Omit<React.ComponentProps<typeof Input>, "type" | "onChange"> & {
  onChange?: (e: { target: { value: string } }) => void;
};

/**
 * Champ de montant acceptant les décimales, virgule française comprise.
 * On évite `type="number"` (le navigateur refuse « 5,09 » et propose
 * « 5 ou 6 ») : saisie texte + clavier numérique + normalisation.
 */
export const DecimalInput = React.forwardRef<HTMLInputElement, Props>(
  ({ onChange, ...props }, ref) => (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode="decimal"
      onChange={(e) => onChange?.({ target: { value: normalizeDecimalInput(e.target.value) } })}
    />
  ),
);
DecimalInput.displayName = "DecimalInput";
