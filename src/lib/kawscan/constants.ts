export const KAWSCAN_UNITS = [
  { value: "piece", label: "pièce" },
  { value: "kg", label: "kg" },
  { value: "g", label: "g" },
  { value: "l", label: "litre" },
  { value: "ml", label: "ml" },
  { value: "paquet", label: "paquet" },
  { value: "sachet", label: "sachet" },
  { value: "boite", label: "boîte" },
  { value: "carton", label: "carton" },
  { value: "bouteille", label: "bouteille" },
  { value: "bidon", label: "bidon" },
  { value: "sac", label: "sac" },
  { value: "metre", label: "mètre" },
  { value: "autre", label: "autre" },
] as const;

export function unitLabel(value: string | null | undefined): string {
  return KAWSCAN_UNITS.find((u) => u.value === value)?.label ?? value ?? "";
}

export const KAWSCAN_CURRENCIES = [
  { code: "XOF", symbol: "FCFA" },
  { code: "EUR", symbol: "€" },
  { code: "USD", symbol: "$" },
] as const;

export function currencySymbol(code: string | null | undefined): string {
  return KAWSCAN_CURRENCIES.find((c) => c.code === code)?.symbol ?? code ?? "";
}

export function formatKawscanPrice(amount: number | null | undefined, currency: string): string {
  if (amount == null || !isFinite(amount)) return "—";
  const decimals = currency === "XOF" ? 0 : 2;
  return `${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount)} ${currencySymbol(currency)}`.trim();
}

/** Formats papier (mm) */
export const PAPER_FORMATS = {
  A3: { label: "A3", width: 297, height: 420 },
  A4: { label: "A4", width: 210, height: 297 },
  A5: { label: "A5", width: 148, height: 210 },
} as const;

export type PaperFormat = keyof typeof PAPER_FORMATS;

/** Divisions de feuille : nombre d'étiquettes par page → grille */
export const SHEET_LAYOUTS: Record<number, { cols: number; rows: number }> = {
  1: { cols: 1, rows: 1 },
  2: { cols: 1, rows: 2 },
  4: { cols: 2, rows: 2 },
  8: { cols: 2, rows: 4 },
  12: { cols: 3, rows: 4 },
  24: { cols: 4, rows: 6 },
};

export const SUBSCRIPTION_STATES = {
  active: { label: "Actif", tone: "bg-emerald-100 text-emerald-800" },
  suspended: { label: "Suspendu", tone: "bg-amber-100 text-amber-800" },
  disabled: { label: "Désactivé", tone: "bg-slate-200 text-slate-700" },
} as const;

export type SubscriptionStatus = keyof typeof SUBSCRIPTION_STATES;

export const ACCESS_STATE_MESSAGES: Record<string, string> = {
  disabled: "Ce magasin est actuellement désactivé.",
  suspended: "L'accès de ce magasin est suspendu.",
  expired: "L'abonnement de ce magasin a expiré.",
  not_started: "L'abonnement de ce magasin n'a pas encore commencé.",
  store_not_found: "Ce magasin est introuvable. Le QR code est peut-être invalide.",
  code_not_found: "Code inconnu : ce produit n'existe pas dans ce magasin.",
};
