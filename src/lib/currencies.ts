export type Currency = {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  is_active: boolean;
  is_base: boolean;
  display_order: number;
};

export type CurrencyRate = {
  id: string;
  currency_code: string;
  rate_to_base: number;
  safety_margin_pct: number;
  effective_from: string;
  note: string | null;
  created_at: string;
};

export const BASE_CURRENCY = "XOF";

export function formatMoney(
  amount: number | null | undefined,
  currency: Pick<Currency, "code" | "symbol" | "decimals"> | null | undefined,
): string {
  if (amount == null || !isFinite(amount)) return "—";
  const decimals = currency?.decimals ?? 0;
  const symbol = currency?.symbol ?? currency?.code ?? "";
  const formatted = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
  return `${formatted} ${symbol}`.trim();
}

/** Convertit un montant XOF vers une devise cible via le taux courant (sans marge). */
export function convertFromBase(
  amountBase: number | null | undefined,
  targetCode: string,
  rates: Record<string, { rate: number }>,
): number | null {
  if (amountBase == null || !isFinite(amountBase)) return null;
  if (targetCode === BASE_CURRENCY) return amountBase;
  const r = rates[targetCode]?.rate;
  if (!r || r <= 0) return null;
  return amountBase / r;
}
