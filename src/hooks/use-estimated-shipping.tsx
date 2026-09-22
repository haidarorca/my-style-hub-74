// ═══════════════════════════════════════════════════════════════
// useEstimatedShipping — Estimation transport côté client
//
// Pour un produit (et sa VARIANTE sélectionnée), calcule une option de
// transport par mode disponible, en appliquant à chaque fois les règles
// du mode : unité kg ou m³, minimum facturable, diviseur volumétrique.
//
// La variante prime toujours sur le produit parent (moteur `freight.ts`).
// Aucun appel réseau dédié : utilise useShippingServices (cache 5 min).
// ═══════════════════════════════════════════════════════════════
import { useMemo } from "react";
import { useShippingServices } from "@/hooks/use-shipping-services";
import { useDeliveryCountry } from "@/hooks/use-delivery-country";
import { isInternational } from "@/lib/logistics-rules";
import {
  resolveItemLogistics,
  quoteFreight,
  type FreightQuote,
  type ItemLogistics,
} from "@/lib/logistics/freight";
import type { ShippingService } from "@/lib/shipping-services.functions";

export interface EstimatedShippingProduct {
  weight_kg?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  vendor_source_country_id?: string | null;
}

export interface EstimatedShippingVariant {
  weight_kg?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
}

export interface ShippingOptionEstimate {
  service: ShippingService;
  price: number;       // FCFA, déjà arrondi
  delayMin: number | null;
  delayMax: number | null;
  quote: FreightQuote;
}

export interface EstimatedShippingResult {
  /** Cet article est-il international (destination ≠ source vendeur) ? */
  isIntl: boolean;
  /** A-t-on assez d'infos pour estimer ? */
  canEstimate: boolean;
  /** Données logistiques retenues (variante ou produit). */
  logistics: ItemLogistics | null;
  /** Champs logistiques manquants (jamais remplacés par une valeur inventée). */
  missing: string[];
  /** Options triées du moins cher au plus cher. */
  options: ShippingOptionEstimate[];
  /** Option la moins chère (simple suggestion). */
  cheapest: ShippingOptionEstimate | null;
}

const EMPTY: EstimatedShippingResult = {
  isIntl: false,
  canEstimate: false,
  logistics: null,
  missing: [],
  options: [],
  cheapest: null,
};

export function useEstimatedShipping(
  product: EstimatedShippingProduct | null | undefined,
  variant?: EstimatedShippingVariant | null,
  quantity = 1,
): EstimatedShippingResult {
  const { countryId: destinationCountryId } = useDeliveryCountry();
  const { services } = useShippingServices();

  return useMemo(() => {
    if (!product) return EMPTY;
    const sourceId = product.vendor_source_country_id ?? null;
    const logistics = resolveItemLogistics(product, variant ?? null);
    const intl = isInternational({
      destinationCountryId,
      vendorSourceCountryId: sourceId,
      productWeightKg: logistics.weightKg,
    });
    if (!intl) return EMPTY;

    // Filtre par couloir (source/destination), null = service "wildcard".
    const filtered = (services ?? []).filter((s) => {
      if (!s.is_enabled) return false;
      const okSrc = s.source_country_id == null || s.source_country_id === sourceId;
      const okDst = s.destination_country_id == null || s.destination_country_id === destinationCountryId;
      return okSrc && okDst;
    });

    const options: ShippingOptionEstimate[] = filtered
      .map((s) => ({ service: s, quote: quoteFreight({ logistics, quantity, rule: s }) }))
      .filter((o) => o.quote.ok && o.quote.cost > 0)
      .map((o) => ({
        service: o.service,
        quote: o.quote,
        price: o.quote.cost,
        delayMin: o.service.delay_min_days ?? null,
        delayMax: o.service.delay_max_days ?? null,
      }))
      .sort((a, b) => a.price - b.price);

    return {
      isIntl: true,
      canEstimate: options.length > 0,
      logistics,
      missing: logistics.missing,
      options,
      cheapest: options[0] ?? null,
    };
  }, [product, variant, quantity, destinationCountryId, services]);
}

/** Format délai homogène : "10-15 j" / "~15 j" / "délai variable" */
export function formatDelay(min: number | null, max: number | null): string {
  if (min && max) return `${min}-${max} jours`;
  if (max) return `~${max} jours`;
  if (min) return `~${min} jours`;
  return "délai variable";
}
