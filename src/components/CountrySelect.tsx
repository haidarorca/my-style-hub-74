import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useCountries, useCountryLabel, type Country } from "@/hooks/use-countries";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  allowNull?: boolean;
  nullLabel?: string;
  onlyEnabled?: boolean;
  className?: string;
  disabled?: boolean;
}

export function CountrySelect({
  value, onChange, placeholder = "Choisir un pays",
  allowNull = false, nullLabel = "— Tous les pays —",
  onlyEnabled = false, className, disabled,
}: Props) {
  const { data: countries } = useCountries({ onlyEnabled });
  const labelOf = useCountryLabel();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = useMemo(
    () => countries?.find((c) => c.id === value) ?? null,
    [countries, value],
  );

  const filtered = useMemo(() => {
    if (!countries) return [];
    const q = search.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      Object.values(c.name_i18n ?? {}).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [countries, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button" variant="outline" role="combobox" disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="truncate">
            {selected ? labelOf(selected) : (value === null && allowNull ? nullLabel : placeholder)}
          </span>
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Rechercher…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-7 text-sm"
            />
          </div>
        </div>
        <ul className="max-h-64 overflow-auto py-1">
          {allowNull && (
            <li>
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
              >
                <span className="flex h-4 w-4 items-center justify-center">
                  {value === null && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="text-muted-foreground">{nullLabel}</span>
              </button>
            </li>
          )}
          {filtered.map((c: Country) => {
            const isActive = value === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => { onChange(c.id); setOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <span className="flex h-4 w-4 items-center justify-center">
                    {isActive && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="text-base">{c.flag_emoji ?? "🏳️"}</span>
                  <span className="flex-1 truncate">{labelOf(c)}</span>
                  <span className="text-[10px] text-muted-foreground">{c.code}</span>
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-3 py-3 text-center text-xs text-muted-foreground">Aucun pays.</li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
