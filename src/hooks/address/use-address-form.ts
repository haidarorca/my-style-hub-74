// ============================================================
// HOOK: useAddressForm — Logique unifiée pour tous les formulaires d'adresse
// Gère le formulaire, la cascade geo, et la géolocalisation
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Address, AddressInput, GeoRegion, GeoCity } from "@/lib/address/types";
import {
  fetchRegions,
  fetchCities,
  createAddress,
  updateAddress,
  reverseGeocode,
  fuzzyMatchRegion,
  fuzzyMatchCity,
} from "@/lib/address/api";

const sb = supabase as any;

interface UseAddressFormOptions {
  ownerType: AddressInput["owner_type"];
  ownerId: string;
  address?: Address | null;    // Pour édition
  onSuccess?: (address: Address) => void;
}

export function useAddressForm({ ownerType, ownerId, address, onSuccess }: UseAddressFormOptions) {
  // ─── Form state ───
  const [values, setValues] = useState<AddressInput>({
    owner_type: ownerType,
    owner_id: ownerId,
    type: "shipping",
    label: null,
    is_default: false,
    full_name: null,
    phone: null,
    phone_alt: null,
    country_id: null,
    region_id: null,
    city_id: null,
    region_text: null,
    city_text: null,
    neighborhood_text: null,
    postal_code: null,
    address_line1: "",
    address_line2: null,
    landmark: null,
    latitude: null,
    longitude: null,
    note: null,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Populate form for editing ───
  useEffect(() => {
    if (address) {
      setValues({
        owner_type: address.owner_type,
        owner_id: address.owner_id,
        type: address.type,
        label: address.label,
        is_default: address.is_default,
        full_name: address.full_name,
        phone: address.phone,
        phone_alt: address.phone_alt,
        country_id: address.country_id,
        region_id: address.region_id,
        city_id: address.city_id,
        region_text: address.region_text,
        city_text: address.city_text,
        neighborhood_text: address.neighborhood_text,
        postal_code: address.postal_code,
        address_line1: address.address_line1,
        address_line2: address.address_line2,
        landmark: address.landmark,
        latitude: address.latitude,
        longitude: address.longitude,
        note: address.note,
      });
    }
  }, [address?.id]);

  // ─── Cascade: fetch regions when country changes ───
  const countryId = values.country_id;
  const regionId = values.region_id;

  const { data: regions, isLoading: regionsLoading } = useQuery({
    queryKey: ["geo_regions", countryId],
    queryFn: () => fetchRegions(countryId!),
    enabled: !!countryId,
    staleTime: 24 * 60 * 60 * 1000, // 24h — données très stables
  });

  const { data: cities, isLoading: citiesLoading } = useQuery({
    queryKey: ["geo_cities", regionId],
    queryFn: () => fetchCities(regionId!),
    enabled: !!regionId,
    staleTime: 24 * 60 * 60 * 1000,
  });

  // ─── Reset cascade children when parent changes ───
  useEffect(() => {
    // Country changed → reset region and city
    setValues((prev) => ({
      ...prev,
      region_id: null,
      city_id: null,
      region_text: null,
      city_text: null,
    }));
  }, [countryId]);

  useEffect(() => {
    // Region changed → reset city
    setValues((prev) => ({
      ...prev,
      city_id: null,
      city_text: null,
    }));
  }, [regionId]);

  // ─── Set field value ───
  const setValue = useCallback(<K extends keyof AddressInput>(field: K, value: AddressInput[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  }, []);

  // ─── Geolocation ───
  const detectLocation = useCallback(async () => {
    setIsDetecting(true);
    setError(null);
    try {
      // 1. Get GPS coordinates
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 60000,
        });
      });

      const { latitude, longitude } = position.coords;

      // 2. Reverse geocoding via Nominatim
      const detected = await reverseGeocode(latitude, longitude);
      if (!detected) {
        toast.error("Géolocalisation impossible. Veuillez remplir manuellement.");
        return;
      }

      // 3. Find country in our database
      const { data: countryData } = await sb
        .from("countries")
        .select("id, code")
        .eq("code", detected.country_code)
        .maybeSingle();

      if (!countryData) {
        // Country not in our system → fill text fallbacks only
        setValues((prev) => ({
          ...prev,
          region_text: detected.region || prev.region_text,
          city_text: detected.city || prev.city_text,
          neighborhood_text: detected.neighborhood || prev.neighborhood_text,
          postal_code: detected.postal_code || prev.postal_code,
          latitude,
          longitude,
        }));
        toast.info("Pays non supporté. Champs texte pré-remplis.");
        return;
      }

      // 4. Set country
      const newCountryId = countryData.id;

      // 5. Try to match region (after regions are loaded)
      let matchedRegion: GeoRegion | null = null;
      if (detected.region) {
        matchedRegion = await fuzzyMatchRegion(newCountryId, detected.region);
      }

      // 6. Try to match city
      let matchedCity: GeoCity | null = null;
      if (detected.city) {
        matchedCity = await fuzzyMatchCity(
          matchedRegion?.id ?? null,
          newCountryId,
          detected.city,
        );
      }

      // 7. Build informative status
      const foundItems: string[] = ["Pays"];
      if (matchedRegion) foundItems.push(countryData.code === "US" ? "State" : "R\u00e9gion");
      else if (detected.region) foundItems.push("R\u00e9gion (texte)");
      if (matchedCity) foundItems.push("Ville");
      else if (detected.city) foundItems.push("Ville (texte)");
      if (detected.neighborhood) foundItems.push("Quartier");
      if (detected.postal_code) foundItems.push("Code postal");

      // 8. Update form
      setValues((prev) => ({
        ...prev,
        country_id: newCountryId,
        region_id: matchedRegion?.id ?? null,
        city_id: matchedCity?.id ?? null,
        region_text: matchedRegion ? null : detected.region || prev.region_text,
        city_text: matchedCity ? null : detected.city || prev.city_text,
        neighborhood_text: detected.neighborhood || prev.neighborhood_text,
        postal_code: detected.postal_code || prev.postal_code,
        address_line1: detected.address_approx || prev.address_line1,
        latitude,
        longitude,
      }));

      toast.success(`D\u00e9tect\u00e9 : ${foundItems.join(", ")}. V\u00e9rifiez les informations.`);
    } catch (err: any) {
      if (err.code === "PERMISSION_DENIED") {
        toast.error("Accès à la localisation refusé. Activez-la dans vos paramètres.");
      } else if (err.code === "TIMEOUT") {
        toast.error("Délai de géolocalisation dépassé. Réessayez.");
      } else {
        toast.error("Géolocalisation indisponible. Remplissez manuellement.");
      }
    } finally {
      setIsDetecting(false);
    }
  }, []);

  // ─── Submit ───
  const onSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      setError(null);

      // Validation minimale
      if (!values.address_line1.trim()) {
        setError("L'adresse est obligatoire.");
        return;
      }
      if (!values.country_id) {
        setError("Le pays est obligatoire.");
        return;
      }

      setIsSubmitting(true);
      try {
        const payload: AddressInput = {
          ...values,
          address_line1: values.address_line1.trim(),
          address_line2: values.address_line2?.trim() || null,
        };

        let result: Address;
        if (address?.id) {
          result = await updateAddress(address.id, payload);
          toast.success("Adresse mise à jour.");
        } else {
          result = await createAddress(payload);
          toast.success("Adresse créée.");
        }

        onSuccess?.(result);
      } catch (err: any) {
        setError(err.message ?? "Erreur lors de l'enregistrement.");
        toast.error(err.message ?? "Erreur lors de l'enregistrement.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [values, address, onSuccess],
  );

  return {
    values,
    setValue,
    regions: regions ?? [],
    cities: cities ?? [],
    regionsLoading,
    citiesLoading,
    detectLocation,
    isDetecting,
    onSubmit,
    isSubmitting,
    error,
  };
}
