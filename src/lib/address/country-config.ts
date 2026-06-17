// ============================================================
// CONFIGURATION PAYS — Labels et comportements par pays
// Simple objet TypeScript, pas de table SQL
// Ajouter un pays = ajouter une ligne ici
// ============================================================

export interface CountryAddressConfig {
  /** Label pour la région (Région, State, Province, İl...) */
  regionLabel: string;
  /** Label pour la ville (Ville, City, İlçe...) */
  cityLabel: string;
  /** Afficher le champ code postal ? */
  showPostalCode: boolean;
  /** Label pour le code postal */
  postalCodeLabel: string;
  /** Format attendu du code postal (regex simple, optionnel) */
  postalCodePattern?: string;
}

/** Configuration par code pays ISO (2 lettres) */
export const COUNTRY_ADDRESS_CONFIG: Record<string, CountryAddressConfig> = {
  // --- Afrique ---
  SN: {
    regionLabel: "R\u00e9gion",
    cityLabel: "Ville",
    showPostalCode: false,
    postalCodeLabel: "Code postal",
  },
  CI: {
    regionLabel: "R\u00e9gion",
    cityLabel: "Ville",
    showPostalCode: false,
    postalCodeLabel: "Code postal",
  },
  MA: {
    regionLabel: "R\u00e9gion",
    cityLabel: "Ville",
    showPostalCode: true,
    postalCodeLabel: "Code postal",
    postalCodePattern: "^\\d{5}$",
  },
  TN: {
    regionLabel: "Gouvernorat",
    cityLabel: "Ville",
    showPostalCode: true,
    postalCodeLabel: "Code postal",
    postalCodePattern: "^\\d{4}$",
  },

  // --- Europe ---
  FR: {
    regionLabel: "R\u00e9gion",
    cityLabel: "Ville",
    showPostalCode: true,
    postalCodeLabel: "Code postal",
    postalCodePattern: "^\\d{5}$",
  },
  BE: {
    regionLabel: "R\u00e9gion",
    cityLabel: "Ville",
    showPostalCode: true,
    postalCodeLabel: "Code postal",
    postalCodePattern: "^\\d{4}$",
  },
  CH: {
    regionLabel: "Canton",
    cityLabel: "Ville",
    showPostalCode: true,
    postalCodeLabel: "NPA",
    postalCodePattern: "^\\d{4}$",
  },

  // --- Asie ---
  CN: {
    regionLabel: "Province",
    cityLabel: "Ville",
    showPostalCode: true,
    postalCodeLabel: "Code postal",
    postalCodePattern: "^\\d{6}$",
  },
  TR: {
    regionLabel: "\u0130l",
    cityLabel: "\u0130l\u00e7e",
    showPostalCode: true,
    postalCodeLabel: "Posta kodu",
    postalCodePattern: "^\\d{5}$",
  },

  // --- Amériques ---
  US: {
    regionLabel: "State",
    cityLabel: "City",
    showPostalCode: true,
    postalCodeLabel: "ZIP Code",
    postalCodePattern: "^\\d{5}(-\\d{4})?$",
  },
  CA: {
    regionLabel: "Province",
    cityLabel: "City",
    showPostalCode: true,
    postalCodeLabel: "Postal Code",
    postalCodePattern: "^[A-Z]\\d[A-Z] \\d[A-Z]\\d$",
  },

  // --- Proche-Orient ---
  LB: {
    regionLabel: "Mohafaza",
    cityLabel: "Ville",
    showPostalCode: false,
    postalCodeLabel: "Code postal",
  },
};

/** Fallback pour les pays non configurés */
const DEFAULT_CONFIG: CountryAddressConfig = {
  regionLabel: "R\u00e9gion / State / Province",
  cityLabel: "Ville / City",
  showPostalCode: true,
  postalCodeLabel: "Code postal / ZIP",
};

/** Récupère la config pour un pays */
export function getCountryAddressConfig(countryCode?: string | null): CountryAddressConfig {
  if (!countryCode) return DEFAULT_CONFIG;
  return COUNTRY_ADDRESS_CONFIG[countryCode.toUpperCase()] ?? DEFAULT_CONFIG;
}

/** Liste des pays configurés (pour validation) */
export function getConfiguredCountryCodes(): string[] {
  return Object.keys(COUNTRY_ADDRESS_CONFIG);
}
