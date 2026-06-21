import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrencies } from "@/hooks/use-currencies";
import { Coins } from "lucide-react";

/** Sélecteur de devise d'affichage (header admin / cockpit). */
export function CurrencySwitcher({ className }: { className?: string }) {
  const { currencies, displayCurrency, setDisplayCurrency, loading } = useCurrencies();
  const active = currencies.filter((c) => c.is_active);
  if (loading || active.length === 0) return null;
  return (
    <div className={className}>
      <Select value={displayCurrency} onValueChange={setDisplayCurrency}>
        <SelectTrigger className="h-9 w-[130px] text-xs">
          <Coins className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {active.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              {c.symbol} · {c.code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
