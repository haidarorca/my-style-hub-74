import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";

interface Props {
  dateRange: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
}

export function DateRangeFilter({ dateRange, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const fromStr = dateRange?.from ? format(dateRange.from, "dd/MM/yyyy", { locale: fr }) : "";
  const toStr = dateRange?.to ? format(dateRange.to, "dd/MM/yyyy", { locale: fr }) : "";
  const display = fromStr && toStr ? `${fromStr} — ${toStr}` : fromStr ? `À partir du ${fromStr}` : "Sélectionner une période";

  return (
    <div className="space-y-1">
      <label className="text-[10px] text-gray-500 block">Période</label>
      <div className="flex gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-1.5 flex-1 text-[11px] border rounded h-8 px-2 bg-white hover:bg-gray-50 text-left">
              <CalendarIcon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <span className={dateRange?.from ? "text-gray-800" : "text-gray-400"}>{display}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={(range) => {
                onChange(range);
                if (range?.from && range?.to) setOpen(false);
              }}
              numberOfMonths={1}
              locale={fr}
            />
          </PopoverContent>
        </Popover>
        {dateRange?.from && (
          <button
            onClick={() => onChange(undefined)}
            className="h-8 w-8 flex items-center justify-center rounded border hover:bg-red-50 text-gray-400 hover:text-red-500 shrink-0"
            title="Effacer la période"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
