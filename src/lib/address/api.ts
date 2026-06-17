// ============================================================
// API: Fonctions Supabase pour le système d'adresses
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import type { Address, AddressInput, GeoRegion, GeoCity, DetectedLocation } from "./types";

const sb = supabase as any;

// ─── REGIONS ───

export async function fetchRegions(countryId: string): Promise<GeoRegion[]> {
  try {
    const { data, error } = await sb
      .from("geo_regions")
      .select("id, country_id, name, created_at")
      .eq("country_id", countryId)
      .order("name");
    if (error?.message?.includes("does not exist") || error?.message?.includes("schema cache")) {
      console.warn("Table geo_regions not found. Run migration: supabase/migrations/20260617_address_system.sql");
      return [];
    }
    if (error) throw error;
    return data ?? [];
  } catch (e: any) {
    if (e?.message?.includes("does not exist") || e?.message?.includes("schema cache")) {
      console.warn("Table geo_regions not found. Run migration SQL.");
      return [];
    }
    throw e;
  }
}

export async function createRegion(countryId: string, name: string): Promise<GeoRegion> {
  const { data, error } = await sb
    .from("geo_regions")
    .insert({ country_id: countryId, name })
    .select("id, country_id, name, created_at")
    .single();
  if (error) throw error;
  return data;
}

export async function updateRegion(id: string, name: string): Promise<void> {
  const { error } = await sb.from("geo_regions").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function deleteRegion(id: string): Promise<void> {
  const { error } = await sb.from("geo_regions").delete().eq("id", id);
  if (error) throw error;
}

// ─── CITIES ───

function isMissingTableError(e: any): boolean {
  const msg = e?.message || "";
  return msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("not found");
}

export async function fetchCities(regionId: string): Promise<GeoCity[]> {
  try {
    const { data, error } = await sb
      .from("geo_cities")
      .select("id, country_id, region_id, name, created_at")
      .eq("region_id", regionId)
      .order("name");
    if (isMissingTableError(error)) return [];
    if (error) throw error;
    return data ?? [];
  } catch (e) { if (isMissingTableError(e)) return []; throw e; }
}

export async function fetchCitiesByCountry(countryId: string): Promise<GeoCity[]> {
  try {
    const { data, error } = await sb
      .from("geo_cities")
      .select("id, country_id, region_id, name, created_at")
      .eq("country_id", countryId)
      .order("name");
    if (isMissingTableError(error)) return [];
    if (error) throw error;
    return data ?? [];
  } catch (e) { if (isMissingTableError(e)) return []; throw e; }
}

export async function createCity(countryId: string, regionId: string | null, name: string): Promise<GeoCity> {
  const { data, error } = await sb
    .from("geo_cities")
    .insert({ country_id: countryId, region_id: regionId, name })
    .select("id, country_id, region_id, name, created_at")
    .single();
  if (error) throw error;
  return data;
}

export async function updateCity(id: string, name: string): Promise<void> {
  const { error } = await sb.from("geo_cities").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function deleteCity(id: string): Promise<void> {
  const { error } = await sb.from("geo_cities").delete().eq("id", id);
  if (error) throw error;
}

// ─── ADDRESSES ───

export async function fetchAddresses(
  ownerType: string,
  ownerId: string,
  type?: string,
): Promise<Address[]> {
  let q = sb
    .from("addresses")
    .select("*")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (type) q = q.eq("type", type);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchAddressById(id: string): Promise<Address | null> {
  const { data, error } = await sb.from("addresses").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createAddress(input: AddressInput): Promise<Address> {
  const { data, error } = await sb.from("addresses").insert(input).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateAddress(id: string, input: Partial<AddressInput>): Promise<Address> {
  const { data, error } = await sb.from("addresses").update(input).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function deleteAddress(id: string): Promise<void> {
  const { error } = await sb.from("addresses").delete().eq("id", id);
  if (error) throw error;
}

export async function setDefaultAddress(
  ownerType: string,
  ownerId: string,
  addressId: string,
  type: string,
): Promise<void> {
  // Retirer le défaut des autres adresses du même type
  await sb
    .from("addresses")
    .update({ is_default: false })
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .eq("type", type);
  // Mettre celle-ci par défaut
  await sb.from("addresses").update({ is_default: true }).eq("id", addressId);
}

// ─── GEOLOCALISATION (Nominatim OSM) ───

export async function reverseGeocode(lat: number, lng: number): Promise<DetectedLocation | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fr,en&addressdetails=1&extratags=1`,
      { headers: { "User-Agent": "Kawzone/1.0" } },
    );
    if (!response.ok) return null;
    const json = await response.json();
    const addr = json.address;
    if (!addr) return null;

    // Extraction robuste de la région (nombreuses variantes selon les pays)
    const region =
      addr.state ??
      addr.province ??
      addr.region ??
      addr.county ??
      addr.state_district ??
      addr.district ??
      addr.department ??
      addr.municipality ??
      "";

    // Extraction robuste de la ville
    const city =
      addr.city ??
      addr.town ??
      addr.village ??
      addr.municipality ??
      addr.district ??
      addr.suburb ??
      addr.locality ??
      addr.hamlet ??
      "";

    // Extraction du quartier
    const neighborhood =
      addr.suburb ??
      addr.neighbourhood ??
      addr.quarter ??
      addr.city_district ??
      addr.residential ??
      "";

    // Extraction de l'adresse (rue)
    const address_approx =
      json.display_name ??
      addr.road ??
      addr.street ??
      addr.pedestrian ??
      addr.footway ??
      addr.cycleway ??
      addr.path ??
      addr.address29 ??
      "";

    // Truncate display_name to reasonable length
    const truncatedAddress = address_approx.length > 120
      ? address_approx.substring(0, 120) + "..."
      : address_approx;

    return {
      country_code: (addr.country_code ?? "").toUpperCase(),
      country_name: addr.country ?? "",
      region,
      city,
      neighborhood,
      postal_code: addr.postcode ?? addr.postal_code ?? "",
      address_approx: truncatedAddress,
      latitude: lat,
      longitude: lng,
    };
  } catch {
    return null;
  }
}

// ─── FUZZY MATCH (simple ILIKE) ───

export async function fuzzyMatchRegion(
  countryId: string,
  name: string,
): Promise<GeoRegion | null> {
  const { data, error } = await sb
    .from("geo_regions")
    .select("id, country_id, name, created_at")
    .eq("country_id", countryId)
    .ilike("name", `%${name}%`)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data;
}

export async function fuzzyMatchCity(
  regionId: string | null,
  countryId: string,
  name: string,
): Promise<GeoCity | null> {
  let q = sb
    .from("geo_cities")
    .select("id, country_id, region_id, name, created_at")
    .eq("country_id", countryId)
    .ilike("name", `%${name}%`)
    .limit(1);
  if (regionId) q = q.eq("region_id", regionId);
  const { data, error } = await q.maybeSingle();
  if (error) return null;
  return data;
}

// ─── EXPORT CSV ───

export function exportRegionsToCSV(regions: GeoRegion[]): string {
  return ["region"].concat(regions.map((r) => r.name)).join("\n");
}

export function exportCitiesToCSV(cities: GeoCity[]): string {
  return ["region,city"].concat(cities.map((c) => `${c.region_id || ""},${c.name}`)).join("\n");
}

// ─── IMPORT CSV ───

export async function importRegionsFromCSV(
  countryId: string,
  names: string[],
): Promise<{ created: number; duplicates: number }> {
  // Dédupliquer
  const uniqueNames = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const { data: existing } = await sb
    .from("geo_regions")
    .select("name")
    .eq("country_id", countryId);
  const existingNames = new Set((existing ?? []).map((r: any) => r.name.toLowerCase()));

  const toCreate = uniqueNames.filter((n) => !existingNames.has(n.toLowerCase()));
  if (toCreate.length === 0) return { created: 0, duplicates: uniqueNames.length };

  const { error } = await sb
    .from("geo_regions")
    .insert(toCreate.map((name) => ({ country_id: countryId, name })));
  if (error) throw error;

  return { created: toCreate.length, duplicates: uniqueNames.length - toCreate.length };
}

export async function importCitiesFromCSV(
  countryId: string,
  rows: { regionName: string; cityName: string }[],
): Promise<{ created: number; skipped: number }> {
  // Récupérer toutes les régions du pays
  const { data: regions } = await sb
    .from("geo_regions")
    .select("id, name")
    .eq("country_id", countryId);
  const regionMap = new Map((regions ?? []).map((r: any) => [r.name.toLowerCase(), r.id]));

  // Récupérer les villes existantes
  const { data: existingCities } = await sb
    .from("geo_cities")
    .select("name, region_id")
    .eq("country_id", countryId);
  const existingSet = new Set((existingCities ?? []).map((c: any) => `${(c.region_id ?? "null")}:${c.name.toLowerCase()}`));

  const toCreate: any[] = [];
  let skipped = 0;

  for (const row of rows) {
    const regionId = regionMap.get(row.regionName.trim().toLowerCase()) ?? null;
    const cityName = row.cityName.trim();
    const key = `${regionId ?? "null"}:${cityName.toLowerCase()}`;

    if (existingSet.has(key)) {
      skipped++;
      continue;
    }
    toCreate.push({ country_id: countryId, region_id: regionId, name: cityName });
  }

  if (toCreate.length > 0) {
    const { error } = await sb.from("geo_cities").insert(toCreate);
    if (error) throw error;
  }

  return { created: toCreate.length, skipped };
}
