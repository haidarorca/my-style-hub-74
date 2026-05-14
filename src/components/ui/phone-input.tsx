import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface Country {
  code: string; // ISO
  name: string;
  dial: string; // e.g. "+221"
  flag: string;
}

export const COUNTRIES: Country[] = [
  { code: "SN", name: "Sénégal", dial: "+221", flag: "🇸🇳" },
  { code: "FR", name: "France", dial: "+33", flag: "🇫🇷" },
  { code: "CI", name: "Côte d'Ivoire", dial: "+225", flag: "🇨🇮" },
  { code: "ML", name: "Mali", dial: "+223", flag: "🇲🇱" },
  { code: "MA", name: "Maroc", dial: "+212", flag: "🇲🇦" },
  { code: "DZ", name: "Algérie", dial: "+213", flag: "🇩🇿" },
  { code: "TN", name: "Tunisie", dial: "+216", flag: "🇹🇳" },
  { code: "GN", name: "Guinée", dial: "+224", flag: "🇬🇳" },
  { code: "BF", name: "Burkina Faso", dial: "+226", flag: "🇧🇫" },
  { code: "CM", name: "Cameroun", dial: "+237", flag: "🇨🇲" },
  { code: "GA", name: "Gabon", dial: "+241", flag: "🇬🇦" },
  { code: "CG", name: "Congo", dial: "+242", flag: "🇨🇬" },
  { code: "CD", name: "RD Congo", dial: "+243", flag: "🇨🇩" },
  { code: "BJ", name: "Bénin", dial: "+229", flag: "🇧🇯" },
  { code: "TG", name: "Togo", dial: "+228", flag: "🇹🇬" },
  { code: "NE", name: "Niger", dial: "+227", flag: "🇳🇪" },
  { code: "MR", name: "Mauritanie", dial: "+222", flag: "🇲🇷" },
  { code: "GM", name: "Gambie", dial: "+220", flag: "🇬🇲" },
  { code: "GH", name: "Ghana", dial: "+233", flag: "🇬🇭" },
  { code: "NG", name: "Nigéria", dial: "+234", flag: "🇳🇬" },
  { code: "BE", name: "Belgique", dial: "+32", flag: "🇧🇪" },
  { code: "ES", name: "Espagne", dial: "+34", flag: "🇪🇸" },
  { code: "IT", name: "Italie", dial: "+39", flag: "🇮🇹" },
  { code: "DE", name: "Allemagne", dial: "+49", flag: "🇩🇪" },
  { code: "GB", name: "Royaume-Uni", dial: "+44", flag: "🇬🇧" },
  { code: "US", name: "États-Unis", dial: "+1", flag: "🇺🇸" },
  { code: "CA", name: "Canada", dial: "+1", flag: "🇨🇦" },
];

const DEFAULT = COUNTRIES[0];

/** Parse a stored E.164-ish value into a country + local digits. */
function parseValue(value: string): { country: Country; local: string } {
  const v = (value ?? "").trim();
  if (v.startsWith("+")) {
    // longest dial first
    const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
    for (const c of sorted) {
      if (v.startsWith(c.dial)) {
        return { country: c, local: v.slice(c.dial.length).replace(/[^\d ]/g, "").trim() };
      }
    }
  }
  return { country: DEFAULT, local: v.replace(/[^\d ]/g, "") };
}

export interface PhoneInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  defaultCountry?: string; // ISO code
}

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ id, value, onChange, placeholder, disabled, className, defaultCountry }, ref) => {
    const initial = React.useMemo(() => {
      if (value) return parseValue(value);
      const c = COUNTRIES.find((x) => x.code === (defaultCountry ?? "SN")) ?? DEFAULT;
      return { country: c, local: "" };
    }, []); // eslint-disable-line
    const [country, setCountry] = React.useState<Country>(initial.country);
    const [local, setLocal] = React.useState<string>(initial.local);
    const [open, setOpen] = React.useState(false);

    // Sync downstream value
    React.useEffect(() => {
      const merged = local ? `${country.dial} ${local}` : "";
      if (merged !== value) onChange(merged);
      // eslint-disable-next-line
    }, [country.dial, local]);

    // If parent clears value externally
    React.useEffect(() => {
      if (!value && local) setLocal("");
      // eslint-disable-next-line
    }, [value]);

    return (
      <div className={cn("flex items-stretch gap-2", className)}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            type="button"
            disabled={disabled}
            className="flex h-9 items-center gap-1 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm hover:bg-accent disabled:opacity-50"
          >
            <span className="text-base leading-none">{country.flag}</span>
            <span className="font-medium">{country.dial}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-0">
            <ul className="max-h-72 overflow-y-auto py-1 text-sm">
              {COUNTRIES.map((c) => (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => { setCountry(c); setOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent"
                  >
                    <span className="text-base">{c.flag}</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.dial}</span>
                    {c.code === country.code && <Check className="h-3 w-3 text-primary" />}
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
        <Input
          id={id}
          ref={ref}
          type="tel"
          inputMode="tel"
          placeholder={placeholder ?? "77 000 00 00"}
          disabled={disabled}
          value={local}
          onChange={(e) => setLocal(e.target.value.replace(/[^\d ]/g, ""))}
          maxLength={20}
          className="flex-1"
        />
      </div>
    );
  },
);
PhoneInput.displayName = "PhoneInput";
