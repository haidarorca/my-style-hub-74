import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuantityInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
  "aria-label"?: string;
}

/**
 * Quantité éditable : boutons +/- ET saisie manuelle directe.
 * Entiers positifs uniquement, clavier numérique sur mobile, pas de max artificiel.
 */
export function QuantityInput({
  value,
  onChange,
  min = 1,
  step = 1,
  disabled,
  className,
  size = "md",
  ...rest
}: QuantityInputProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const digits = raw.replace(/\D+/g, "");
    if (digits === "") {
      setDraft(String(min));
      onChange(min);
      return;
    }
    const n = Math.max(min, parseInt(digits, 10));
    setDraft(String(n));
    onChange(n);
  };

  const btn =
    size === "sm"
      ? "h-7 w-7 text-sm"
      : "h-9 w-9 text-base";
  const field = size === "sm" ? "h-7 w-12 text-sm" : "h-9 w-16 text-base";

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-border bg-background",
        disabled && "opacity-50",
        className,
      )}
    >
      <button
        type="button"
        disabled={disabled || value <= min}
        aria-label="Diminuer la quantité"
        onClick={() => onChange(Math.max(min, value - step))}
        className={cn(
          "flex items-center justify-center text-foreground disabled:opacity-40",
          btn,
        )}
      >
        <Minus className="h-4 w-4" />
      </button>

      <input
        {...rest}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        disabled={disabled}
        value={draft}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value.replace(/\D+/g, ""))}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={cn(
          "border-x border-border bg-transparent text-center font-semibold outline-none focus:bg-muted/50",
          field,
        )}
      />

      <button
        type="button"
        disabled={disabled}
        aria-label="Augmenter la quantité"
        onClick={() => onChange(value + step)}
        className={cn(
          "flex items-center justify-center text-foreground disabled:opacity-40",
          btn,
        )}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
