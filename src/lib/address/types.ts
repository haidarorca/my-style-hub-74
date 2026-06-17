// ============================================================
// TYPES: Système d'adresses international Kawzone
// ============================================================

/** Types de propriétaires d'adresse (polymorphisme) */
export type AddressOwnerType = "user" | "vendor" | "shop" | "order" | "guest" | "supplier";

/** Types d'adresse */
export type AddressType = "shipping" | "billing" | "pickup" | "warehouse";

/** Configuration vendeur: pays d'origine + pays de vente + entrepôts */
export interface VendorAddressConfig {
  /** Pays d'origine du vendeur (source des produits) */
  source_country_id: string;
  /** Pays où le vendeur accepte de vendre */
  destination_country_ids: string[];
  /** Entrepôts du vendeur (optionnel) */
  warehouses: Warehouse[];
}

/** Entrepôt vendeur */
export interface Warehouse {
  id: string;
  vendor_id: string;
  name: string;                    // "Entrepôt Guangzhou"
  address_id: string;              // FK → addresses (type='warehouse')
  is_default: boolean;
  created_at: string;
}

/** Entité région (ultra-légère) */
export interface GeoRegion {
  id: string;
  country_id: string;
  name: string;
  created_at: string;
}

/** Entité ville (ultra-légère) */
export interface GeoCity {
  id: string;
  country_id: string;
  region_id: string | null;
  name: string;
  created_at: string;
}

/** Adresse complète (table polymorphe) */
export interface Address {
  id: string;
  owner_type: AddressOwnerType;
  owner_id: string;
  type: AddressType;
  label: string | null;
  is_default: boolean;
  full_name: string | null;
  phone: string | null;
  phone_alt: string | null;
  country_id: string | null;
  region_id: string | null;
  city_id: string | null;
  region_text: string | null;
  city_text: string | null;
  neighborhood_text: string | null;
  postal_code: string | null;
  address_line1: string;
  address_line2: string | null;
  landmark: string | null;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** Données détectées par géolocalisation (Nominatim) */
export interface DetectedLocation {
  country_code: string;      // "SN", "FR", "US"...
  country_name: string;
  region: string;            // "Dakar", "California"...
  city: string;              // "Dakar", "Los Angeles"...
  neighborhood: string;      // "Médina", "Downtown"...
  postal_code: string;       // "10000", "90210"...
  address_approx: string;    // "Route de Dakar" — rue/détecté
  latitude: number;
  longitude: number;
}

/** Données pour créer ou mettre à jour une adresse */
export interface AddressInput {
  owner_type: AddressOwnerType;
  owner_id: string;
  type?: AddressType;
  label?: string | null;
  is_default?: boolean;
  full_name?: string | null;
  phone?: string | null;
  phone_alt?: string | null;
  country_id?: string | null;
  region_id?: string | null;
  city_id?: string | null;
  region_text?: string | null;
  city_text?: string | null;
  neighborhood_text?: string | null;
  postal_code?: string | null;
  address_line1: string;
  address_line2?: string | null;
  landmark?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  note?: string | null;
}

/** Props du composant AddressForm */
export interface AddressFormProps {
  purpose: AddressType;
  ownerType: AddressOwnerType;
  ownerId: string;
  addressId?: string | null;      // Pour édition
  showLabelField?: boolean;
  showContactFields?: boolean;
  allowedCountryIds?: string[];   // Restriction pays
  requirePhone?: boolean;
  onSuccess: (address: Address) => void;
  onCancel?: () => void;
}

/** Résultat du hook useAddressForm */
export interface AddressFormState {
  // Valeurs du formulaire
  values: AddressInput;
  setValue: (field: keyof AddressInput, value: any) => void;
  
  // Cascade géographique
  regions: GeoRegion[];
  cities: GeoCity[];
  regionsLoading: boolean;
  citiesLoading: boolean;
  
  // Géolocalisation
  detectLocation: () => Promise<void>;
  isDetecting: boolean;
  
  // Soumission
  onSubmit: (e: React.FormEvent) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}
