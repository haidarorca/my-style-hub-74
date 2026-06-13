import { useState } from "react";
import { Calendar as CalendarIcon, X, ChevronLeft, ChevronRight } from "lucide-react";
import type { DateRange } from "react-day-picker";

interface Props {
  dateRange: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
}

// Format dd/MM/yyyy
function fmt(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Nombre de jours dans un mois
function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

// Premier jour du mois (0=dimanche)
function firstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const MONTH_NAMES = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const DAY_NAMES = ["Di", "Lu", "Ma", "Me", "Je", "Ve", "Sa"];

export function DateRangeFilter({ dateRange, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());

  const fromStr = dateRange?.from ? fmt(dateRange.from) : "";
  const toStr = dateRange?.to ? fmt(dateRange.to) : "";
  const display = fromStr && toStr ? `${fromStr} — ${toStr}` : fromStr ? `À partir du ${fromStr}` : "Sélectionner une période";

  const handleDayClick = (day: number) => {
    const clicked = new Date(viewYear, viewMonth, day);
    if (!dateRange?.from || (dateRange.from && dateRange.to)) {
      // Nouvelle sélection
      onChange({ from: clicked, to: undefined });
    } else {
      // Compléter la range
      if (clicked.getTime() < dateRange.from.getTime()) {
        onChange({ from: clicked, to: dateRange.from });
      } else {
        onChange({ from: dateRange.from, to: clicked });
      }
    }
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const firstDay = firstDayOfMonth(viewYear, viewMonth);
  const totalDays = daysInMonth(viewYear, viewMonth);
  const today = new Date();

  const isSelected = (day: number) => {
    if (!dateRange?.from) return false;
    const d = new Date(viewYear, viewMonth, day).getTime();
    const fromT = dateRange.from.getTime();
    const toT = dateRange.to?.getTime();
    if (toT) return d >= fromT && d <= toT;
    return d === fromT;
  };

  const isRangeStart = (day: number) => dateRange?.from && new Date(viewYear, viewMonth, day).getTime() === dateRange.from.getTime();
  const isRangeEnd = (day: number) => dateRange?.to && new Date(viewYear, viewMonth, day).getTime() === dateRange.to.getTime();

  return (
    <div className="space-y-1">
      <label className="text-[10px] text-gray-500 block">Période</label>
      <div className="flex gap-1">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 flex-1 text-[11px] border rounded h-8 px-2 bg-white hover:bg-gray-50 text-left"
        >
          <CalendarIcon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <span className={dateRange?.from ? "text-gray-800" : "text-gray-400"}>{display}</span>
        </button>
        {dateRange?.from && (
          <button
            onClick={() => onChange(undefined)}
            className="h-8 w-8 flex items-center justify-center rounded border hover:bg-red-50 text-gray-400 hover:text-red-500 shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Overlay plein écran pour mobile */}
      {open && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setOpen(false)}>
          <div className="bg-white w-full sm:w-80 sm:rounded-xl rounded-t-xl p-4 space-y-3" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Sélectionner une période</h3>
              <button onClick={() => setOpen(false)} className="p-1 rounded-full hover:bg-gray-100"><X className="h-4 w-4 text-gray-400" /></button>
            </div>

            {/* Affichage sélection */}
            <div className="bg-gray-50 rounded-lg p-2 text-center text-xs">
              {dateRange?.from ? (
                <span className="font-medium">
                  {fmt(dateRange.from)} {dateRange?.to ? `— ${fmt(dateRange.to)}` : "→ sélectionnez la fin"}
                </span>
              ) : (
                <span className="text-gray-400">Sélectionnez une date de début</span>
              )}
            </div>

            {/* Navigation mois */}
            <div className="flex items-center justify-between">
              <button onClick={prevMonth} className="p-1 rounded hover:bg-gray-100"><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-sm font-semibold">{MONTH_NAMES[viewMonth]} {viewYear}</span>
              <button onClick={nextMonth} className="p-1 rounded hover:bg-gray-100"><ChevronRight className="h-4 w-4" /></button>
            </div>

            {/* Grille calendrier */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {DAY_NAMES.map(d => <div key={d} className="text-[10px] text-gray-400 font-medium py-1">{d}</div>)}
              {Array.from({ length: firstDay }, (_, i) => <div key={`empty-${i}`} />)}
              {Array.from({ length: totalDays }, (_, i) => {
                const day = i + 1;
                const selected = isSelected(day);
                const rangeStart = isRangeStart(day);
                const rangeEnd = isRangeEnd(day);
                const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
                return (
                  <button
                    key={day}
                    onClick={() => handleDayClick(day)}
                    className={`h-8 w-8 rounded-full text-[11px] font-medium flex items-center justify-center mx-auto
                      ${selected ? "bg-orange-500 text-white" : "text-gray-700 hover:bg-gray-100"}
                      ${rangeStart ? "bg-orange-600 text-white" : ""}
                      ${rangeEnd ? "bg-orange-600 text-white" : ""}
                      ${isToday && !selected ? "border border-orange-300" : ""}
                    `}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* Boutons action */}
            <div className="flex gap-2 pt-1">
              <button onClick={() => { onChange(undefined); setOpen(false); }} className="flex-1 h-10 text-xs border rounded-lg hover:bg-gray-50">Effacer</button>
              <button onClick={() => setOpen(false)} className="flex-1 h-10 text-xs bg-orange-600 text-white rounded-lg font-medium">OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
