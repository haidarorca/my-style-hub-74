import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Currency } from "@/lib/currencies";
import { BASE_CURRENCY } from "@/lib/currencies";

type RateInfo = { rate: number; margin: number };

type Ctx = {
  loading: boolean;
  currencies: Currency[];
  rates: Record<string, RateInfo>;
  displayCurrency: string;
  setDisplayCurrency: (code: string) => void;
  refresh: () => Promise<void>;
};

const CurrenciesContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "kawzone.displayCurrency";

export function CurrenciesProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [rates, setRates] = useState<Record<string, RateInfo>>({});
  const [displayCurrency, setDisplayCurrencyState] = useState<string>(() => {
    if (typeof window === "undefined") return BASE_CURRENCY;
    return window.localStorage.getItem(STORAGE_KEY) || BASE_CURRENCY;
  });

  const setDisplayCurrency = useCallback((code: string) => {
    setDisplayCurrencyState(code);
    try { window.localStorage.setItem(STORAGE_KEY, code); } catch {}
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data: cs } = await (supabase as any)
        .from("currencies")
        .select("*")
        .order("display_order", { ascending: true });
      setCurrencies((cs as Currency[]) || []);

      const { data: rs } = await (supabase as any)
        .from("currency_rates")
        .select("currency_code, rate_to_base, safety_margin_pct, effective_from")
        .order("effective_from", { ascending: false });
      const latest: Record<string, RateInfo> = {};
      for (const row of (rs as any[]) || []) {
        if (!latest[row.currency_code]) {
          latest[row.currency_code] = {
            rate: Number(row.rate_to_base),
            margin: Number(row.safety_margin_pct),
          };
        }
      }
      setRates(latest);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const value = useMemo<Ctx>(() => ({
    loading, currencies, rates, displayCurrency, setDisplayCurrency, refresh,
  }), [loading, currencies, rates, displayCurrency, setDisplayCurrency, refresh]);

  return <CurrenciesContext.Provider value={value}>{children}</CurrenciesContext.Provider>;
}

export function useCurrencies() {
  const ctx = useContext(CurrenciesContext);
  if (!ctx) {
    // Fallback safe default when provider not mounted
    return {
      loading: false,
      currencies: [] as Currency[],
      rates: {} as Record<string, RateInfo>,
      displayCurrency: BASE_CURRENCY,
      setDisplayCurrency: () => {},
      refresh: async () => {},
    } satisfies Ctx;
  }
  return ctx;
}

/** Hook utilitaire pour formater un montant XOF dans la devise d'affichage choisie. */
export function useFormatDisplay() {
  const { currencies, rates, displayCurrency } = useCurrencies();
  const target = currencies.find((c) => c.code === displayCurrency);
  return (amountXof: number | null | undefined): string => {
    if (amountXof == null || !isFinite(amountXof)) return "—";
    let converted = amountXof;
    if (displayCurrency !== BASE_CURRENCY) {
      const r = rates[displayCurrency]?.rate;
      if (!r) return "—";
      converted = amountXof / r;
    }
    const decimals = target?.decimals ?? 0;
    const symbol = target?.symbol ?? displayCurrency;
    return `${new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(converted)} ${symbol}`;
  };
}
