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

export const DEFAULT_COUNTRY = COUNTRIES[0];

/** Parse a stored value like "+221 77 000" into { country, local } */
export function parsePhone(value: string): { country: Country; local: string } {
  const v = (value ?? "").trim();
  if (v.startsWith("+")) {
    const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
    for (const c of sorted) {
      if (v.startsWith(c.dial)) {
        return { country: c, local: v.slice(c.dial.length).replace(/[^\d ]/g, "").trim() };
      }
    }
  }
  return { country: DEFAULT_COUNTRY, local: v.replace(/[^\d ]/g, "") };
}

export function findCountryByCode(code: string | undefined): Country {
  return COUNTRIES.find((c) => c.code === code) ?? DEFAULT_COUNTRY;
}

export function findCountryByDial(dial: string | undefined): Country | undefined {
  if (!dial) return undefined;
  return COUNTRIES.find((c) => c.dial === dial);
}

/** Country selector with search. Single-pick, controlled. */
export function CountryPicker({
  value,
  onChange,
  className,
}: {
  value: Country;
  onChange: (c: Country) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dial.includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger
        type="button"
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm hover:bg-accent",
          className,
        )}
      >
        <span className="text-base leading-none">{value.flag}</span>
        <span className="flex-1 truncate text-left">{value.name}</span>
        <span className="text-xs font-medium text-muted-foreground">{value.dial}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="pointer-events-auto w-[var(--radix-popover-trigger-width)] min-w-64 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border p-2">
          <Input
            autoFocus
            placeholder="Rechercher un pays…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8"
          />
        </div>
        <ul
          className="max-h-72 overflow-y-auto overscroll-contain py-1 text-sm"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-4 text-center text-xs text-muted-foreground">Aucun résultat</li>
          ) : (
            filtered.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => { onChange(c); setOpen(false); setQuery(""); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent"
                >
                  <span className="text-base">{c.flag}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.dial}</span>
                  {c.code === value.code && <Check className="h-3 w-3 text-primary" />}
                </button>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Phone input with a fixed (non-editable) dial code prefix. */
export function PhoneDigitsInput({
  id,
  dial,
  value,
  onChange,
  placeholder,
}: {
  id?: string;
  dial: string;
  value: string;
  onChange: (digits: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-stretch">
      <span className="inline-flex h-9 select-none items-center rounded-l-md border border-r-0 border-input bg-muted px-2 text-sm font-medium text-muted-foreground">
        {dial}
      </span>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        placeholder={placeholder ?? "77 000 00 00"}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d ]/g, ""))}
        maxLength={20}
        className="rounded-l-none"
      />
    </div>
  );
}

