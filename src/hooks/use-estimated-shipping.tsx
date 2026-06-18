// ═══════════════════════════════════════════════════════════════
// useEstimatedShipping — Calcul d'estimation transport côté client
//
// Pour un produit donné, calcule l'estimation transport (mode le moins
// cher) basée sur :
//   - poids déclaré + dimensions du produit
//   - pays source vendeur vs pays destination client
//   - tarifs des services actifs
//
// Aucun appel réseau dédié : utilise useShippingServices (cache 5 min).
// ═══════════════════════════════════════════════════════════════
import { useMemo } from "react";
import { useShippingServices } from "@/hooks/use-shipping-services";
import { useDeliveryCountry } from "@/hooks/use-delivery-country";
import { chargeableWeight, isInternational } from "@/lib/logistics-rules";
import type { ShippingService } from "@/lib/shipping-services.functions";

export interface EstimatedShippingProduct {
  weight_kg?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  vendor_source_country_id?: string | null;
}

export interface ShippingOptionEstimate {
  service: ShippingService;
  price: number;       // FCFA, déjà arrondi
  delayMin: number | null;
  delayMax: number | null;
}

export interface EstimatedShippingResult {
  /** Cet article est-il international (destination ≠ source vendeur) ? */
  isIntl: boolean;
  /** A-t-on assez d'infos vendeur pour estimer ? */
  canEstimate: boolean;
  /** Options triées du moins cher au plus cher. */
  options: ShippingOptionEstimate[];
  /** Option la moins chère (présélection). */
  cheapest: ShippingOptionEstimate | null;
}

const EMPTY: EstimatedShippingResult = { isIntl: false, canEstimate: false, options: [], cheapest: null };

export function useEstimatedShipping(product: EstimatedShippingProduct | null | undefined): EstimatedShippingResult {
  const { countryId: destinationCountryId } = useDeliveryCountry();
  const { services } = useShippingServices();

  return useMemo(() => {
    if (!product) return EMPTY;
    const sourceId = product.vendor_source_country_id ?? null;
    const ctx = {
      destinationCountryId,
      vendorSourceCountryId: sourceId,
      productWeightKg: product.weight_kg ?? null,
    };
    const intl = isInternational(ctx);
    if (!intl) return EMPTY;
    const w = chargeableWeight({
      weight_kg: product.weight_kg,
      length_cm: product.length_cm,
      width_cm: product.width_cm,
      height_cm: product.height_cm,
      quantity: 1,
    });
    if (w <= 0) return { isIntl: true, canEstimate: false, options: [], cheapest: null };

    // Filtre par couloir (source/destination), accepte null = service "wildcard".
    const filtered = (services ?? []).filter((s) => {
      if (!s.is_enabled) return false;
      const okSrc = s.source_country_id == null || s.source_country_id === sourceId;
      const okDst = s.destination_country_id == null || s.destination_country_id === destinationCountryId;
      return okSrc && okDst;
    });
    if (filtered.length === 0) return { isIntl: true, canEstimate: false, options: [], cheapest: null };

    const options: ShippingOptionEstimate[] = filtered
      .map((s) => ({
        service: s,
        price: Math.round(w * Number(s.price_per_kg ?? 0)),
        delayMin: s.delay_min_days ?? null,
        delayMax: s.delay_max_days ?? null,
      }))
      .filter((o) => o.price > 0)
      .sort((a, b) => a.price - b.price);

    return {
      isIntl: true,
      canEstimate: options.length > 0,
      options,
      cheapest: options[0] ?? null,
    };
  }, [product, destinationCountryId, services]);
}

/** Format délai homogène : "10-15 j" / "~15 j" / "délai variable" */
export function formatDelay(min: number | null, max: number | null): string {
  if (min && max) return `${min}-${max} jours`;
  if (max) return `~${max} jours`;
  if (min) return `~${min} jours`;
  return "délai variable";
}
