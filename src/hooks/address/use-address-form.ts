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
import { findBestGeoMatch, normalizeGeoName } from "@/lib/address/geo-normalize";

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
    
    // Rapport détaillé de détection
    const report: { ok: boolean; field: string; value: string }[] = [];
    
    try {
      // 1. Get GPS coordinates
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 120000,
        });
      });

      const { latitude, longitude } = position.coords;
      report.push({ ok: true, field: "GPS", value: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` });

      // 2. Reverse geocoding via Nominatim
      const detected = await reverseGeocode(latitude, longitude);
      if (!detected) {
        toast.error("Service de géocodage indisponible. Remplissez manuellement.");
        setValues((prev) => ({ ...prev, latitude, longitude }));
        return;
      }

      // 3. Find country in our database
      const { data: countryData } = await sb
        .from("countries")
        .select("id, code, name")
        .eq("code", detected.country_code)
        .maybeSingle();

      if (!countryData) {
        report.push({ ok: false, field: "Pays", value: `${detected.country_name} (${detected.country_code}) — non configuré` });
        // Fill text fallbacks
        setValues((prev) => ({
          ...prev,
          region_text: detected.region || prev.region_text,
          city_text: detected.city || prev.city_text,
          neighborhood_text: detected.neighborhood || prev.neighborhood_text,
          postal_code: detected.postal_code || prev.postal_code,
          address_line1: detected.address_approx || prev.address_line1,
          latitude,
          longitude,
        }));
        toast.info(`Pays "${detected.country_name}" non configuré dans Kawzone. Champs texte pré-remplis.`);
        return;
      }

      report.push({ ok: true, field: "Pays", value: countryData.name });
      const newCountryId = countryData.id;

      // 4. Load ALL regions/cities for this country for smart matching
      const [allRegions, allCities] = await Promise.all([
        fetchRegions(newCountryId),
        (async () => {
          const { data } = await sb.from("geo_cities").select("id, country_id, region_id, name").eq("country_id", newCountryId);
          return (data ?? []) as GeoCity[];
        })(),
      ]);

      // 5. Smart match region with normalization
      let matchedRegion: GeoRegion | null = null;
      if (detected.region) {
        matchedRegion = findBestGeoMatch(detected.region, allRegions, 0.65);
        report.push({
          ok: !!matchedRegion,
          field: countryData.code === "US" ? "State" : "Région",
          value: matchedRegion ? matchedRegion.name : `${detected.region} (texte)`,
        });
      } else {
        report.push({ ok: false, field: "Région", value: "Non détectée" });
      }

      // 6. Smart match city with normalization
      let matchedCity: GeoCity | null = null;
      if (detected.city) {
        // Filter cities by matched region first, then all cities
        const regionCities = matchedRegion
          ? allCities.filter((c) => c.region_id === matchedRegion!.id)
          : allCities;
        
        matchedCity = findBestGeoMatch(detected.city, regionCities, 0.65)
          || findBestGeoMatch(detected.city, allCities, 0.65);
        
        report.push({
          ok: !!matchedCity,
          field: "Ville",
          value: matchedCity ? matchedCity.name : `${detected.city} (texte)`,
        });
      } else {
        report.push({ ok: false, field: "Ville", value: "Non détectée" });
      }

      // 7. Other fields
      if (detected.neighborhood) {
        report.push({ ok: true, field: "Quartier", value: detected.neighborhood });
      }
      if (detected.postal_code) {
        report.push({ ok: true, field: "Code postal", value: detected.postal_code });
      }
      if (detected.address_approx) {
        report.push({ ok: true, field: "Adresse", value: detected.address_approx });
      }

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

      // 9. Build summary message
      const found = report.filter((r) => r.ok).map((r) => r.field).join(", ");
      const notFound = report.filter((r) => !r.ok);
      
      if (notFound.length === 0) {
        toast.success(`Détecté : ${found}. Vérifiez les informations.`);
      } else {
        const msg = `Détecté : ${found}. ${notFound.length} champ(s) manquant(s).`;
        toast.info(msg);
      }
    } catch (err: any) {
      console.error("Geolocation error:", err);
      if (err.code === "PERMISSION_DENIED") {
        toast.error("Accès à la localisation refusé. Activez-la dans les paramètres de votre navigateur.");
      } else if (err.code === "TIMEOUT") {
        toast.error("Délai de géolocalisation dépassé. Réessayez dans un endroit dégagé.");
      } else if (err.code === "POSITION_UNAVAILABLE") {
        toast.error("Position indisponible. Vérifiez votre connexion GPS.");
      } else {
        toast.error("Géolocalisation indisponible. Remplissez le formulaire manuellement.");
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
