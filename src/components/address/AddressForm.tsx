// ============================================================
// COMPOSANT: AddressForm — Formulaire d'adresse universel
// Utilisé partout: inscription, commande, vendeur, boutique...
// ============================================================

import { useEffect } from "react";
import { MapPin, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCountries } from "@/hooks/use-countries";
import { useAddressForm } from "@/hooks/address/use-address-form";
import { getCountryAddressConfig } from "@/lib/address/country-config";
import type { Address, AddressType, AddressOwnerType } from "@/lib/address/types";

interface AddressFormProps {
  purpose?: AddressType;
  ownerType: AddressOwnerType;
  ownerId: string;
  address?: Address | null;
  showLabelField?: boolean;
  showContactFields?: boolean;
  allowedCountryIds?: string[];
  requirePhone?: boolean;
  onSuccess: (address: Address) => void;
  onCancel?: () => void;
}

export function AddressForm({
  purpose = "shipping",
  ownerType,
  ownerId,
  address,
  showLabelField = true,
  showContactFields = true,
  allowedCountryIds,
  requirePhone = false,
  onSuccess,
  onCancel,
}: AddressFormProps) {
  const { data: countries } = useCountries({ onlyEnabled: true });
  const {
    values,
    setValue,
    regions,
    cities,
    regionsLoading,
    citiesLoading,
    detectLocation,
    isDetecting,
    onSubmit,
    isSubmitting,
    error,
  } = useAddressForm({
    ownerType,
    ownerId,
    address,
    onSuccess,
  });

  // Set purpose on mount
  useEffect(() => {
    setValue("type", purpose);
  }, [purpose]);

  const countryConfig = getCountryAddressConfig(
    countries?.find((c) => c.id === values.country_id)?.code,
  );

  // Filter countries if allowed list provided
  const filteredCountries = allowedCountryIds
    ? (countries ?? []).filter((c) => allowedCountryIds.includes(c.id))
    : (countries ?? []);

  const selectedCountry = countries?.find((c) => c.id === values.country_id);
  const selectedRegion = regions.find((r) => r.id === values.region_id);
  const selectedCity = cities.find((c) => c.id === values.city_id);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* ─── Geolocation button ─── */}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={detectLocation}
        disabled={isDetecting}
      >
        {isDetecting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <MapPin className="mr-2 h-4 w-4" />
        )}
        {isDetecting ? "Localisation en cours..." : "Remplir automatiquement"}
      </Button>

      {/* ─── Error ─── */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ─── Label ─── */}
      {showLabelField && (
        <div>
          <Label className="text-xs">Libellé (optionnel)</Label>
          <Input
            value={values.label ?? ""}
            onChange={(e) => setValue("label", e.target.value || null)}
            placeholder="Maison, Bureau, Entrepôt..."
            className="h-9"
          />
        </div>
      )}

      {/* ─── Contact fields ─── */}
      {showContactFields && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Nom complet *</Label>
            <Input
              value={values.full_name ?? ""}
              onChange={(e) => setValue("full_name", e.target.value || null)}
              placeholder="Jean Dupont"
              className="h-9"
              required
            />
          </div>
          <div>
            <Label className="text-xs">
              Téléphone {requirePhone && "*"}
            </Label>
            <Input
              value={values.phone ?? ""}
              onChange={(e) => setValue("phone", e.target.value || null)}
              placeholder="+221 77 123 45 67"
              className="h-9"
              required={requirePhone}
            />
          </div>
        </div>
      )}

      {/* ─── Country ─── */}
      <div>
        <Label className="text-xs">Pays *</Label>
        <Select
          value={values.country_id ?? "__none__"}
          onValueChange={(v) => setValue("country_id", v === "__none__" ? null : v)}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Sélectionner un pays..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Choisir un pays...</SelectItem>
            {filteredCountries.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.flag_emoji ? `${c.flag_emoji} ` : ""}
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ─── Region ─── */}
      {values.country_id && (
        <div>
          <Label className="text-xs">{countryConfig.regionLabel}</Label>
          {regions.length > 0 ? (
            <Select
              value={values.region_id ?? "__none__"}
              onValueChange={(v) => {
                const val = v === "__none__" ? null : v;
                setValue("region_id", val);
                if (val) setValue("region_text", null);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={`Choisir ${countryConfig.regionLabel.toLowerCase()}...`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Choisir...</SelectItem>
                {regions.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <>
              <Input
                value={values.region_text ?? ""}
                onChange={(e) => setValue("region_text", e.target.value || null)}
                placeholder={`${countryConfig.regionLabel}...`}
                className="h-9"
              />
              {regionsLoading && (
                <p className="text-[10px] text-muted-foreground mt-1">Chargement...</p>
              )}
              {regions.length === 0 && !regionsLoading && (
                <p className="text-[10px] text-amber-600 mt-1">
                  Aucune {countryConfig.regionLabel.toLowerCase()} enregistrée. Saisie libre.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── City ─── */}
      {values.country_id && (
        <div>
          <Label className="text-xs">{countryConfig.cityLabel} *</Label>
          {values.region_id && cities.length > 0 ? (
            <Select
              value={values.city_id ?? "__none__"}
              onValueChange={(v) => {
                const val = v === "__none__" ? null : v;
                setValue("city_id", val);
                if (val) setValue("city_text", null);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={`Choisir ${countryConfig.cityLabel.toLowerCase()}...`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Choisir...</SelectItem>
                {cities.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <>
              <Input
                value={values.city_text ?? ""}
                onChange={(e) => setValue("city_text", e.target.value || null)}
                placeholder={`${countryConfig.cityLabel}...`}
                className="h-9"
                required
              />
              {values.region_id && citiesLoading && (
                <p className="text-[10px] text-muted-foreground mt-1">Chargement...</p>
              )}
              {values.region_id && cities.length === 0 && !citiesLoading && (
                <p className="text-[10px] text-amber-600 mt-1">
                  Aucune {countryConfig.cityLabel.toLowerCase()} enregistrée. Saisie libre.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── Neighborhood ─── */}
      <div>
        <Label className="text-xs">Quartier / Zone (optionnel)</Label>
        <Input
          value={values.neighborhood_text ?? ""}
          onChange={(e) => setValue("neighborhood_text", e.target.value || null)}
          placeholder="Médina, Plateau..."
          className="h-9"
        />
      </div>

      {/* ─── Postal code ─── */}
      {countryConfig.showPostalCode && (
        <div>
          <Label className="text-xs">{countryConfig.postalCodeLabel}</Label>
          <Input
            value={values.postal_code ?? ""}
            onChange={(e) => setValue("postal_code", e.target.value || null)}
            placeholder={countryConfig.postalCodeLabel}
            className="h-9"
          />
        </div>
      )}

      {/* ─── Address line ─── */}
      <div>
        <Label className="text-xs">Adresse complète *</Label>
        <Input
          value={values.address_line1}
          onChange={(e) => setValue("address_line1", e.target.value)}
          placeholder="Route de Dakar, près de la mairie"
          className="h-9"
          required
        />
      </div>

      {/* ─── Address line 2 ─── */}
      <div>
        <Label className="text-xs">Complément d'adresse (optionnel)</Label>
        <Input
          value={values.address_line2 ?? ""}
          onChange={(e) => setValue("address_line2", e.target.value || null)}
          placeholder="Appartement, étage, bâtiment..."
          className="h-9"
        />
      </div>

      {/* ─── Landmark ─── */}
      <div>
        <Label className="text-xs">Point de repère (optionnel)</Label>
        <Input
          value={values.landmark ?? ""}
          onChange={(e) => setValue("landmark", e.target.value || null)}
          placeholder="Face à la mosquée, près de Total..."
          className="h-9"
        />
      </div>

      {/* ─── Note ─── */}
      <div>
        <Label className="text-xs">Note (optionnel)</Label>
        <Input
          value={values.note ?? ""}
          onChange={(e) => setValue("note", e.target.value || null)}
          placeholder="Instructions de livraison..."
          className="h-9"
        />
      </div>

      {/* ─── Default checkbox ─── */}
      <div className="flex items-center gap-2">
        <Checkbox
          checked={values.is_default}
          onCheckedChange={(checked) => setValue("is_default", !!checked)}
        />
        <Label className="text-xs">Adresse par défaut</Label>
      </div>

      {/* ─── Actions ─── */}
      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : address ? (
            "Mettre à jour"
          ) : (
            "Enregistrer"
          )}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Annuler
          </Button>
        )}
      </div>
    </form>
  );
}

// ─── Simple display card for an address ───
export function AddressCard({
  address,
  onEdit,
  onDelete,
}: {
  address: Address;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-1 hover:bg-slate-50 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {address.is_default && (
            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
              Par défaut
            </span>
          )}
          {address.label && (
            <span className="text-xs font-medium">{address.label}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onEdit && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onEdit}>
              Modifier
            </Button>
          )}
          {onDelete && (
            <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={onDelete}>
              Supprimer
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm font-medium">{address.full_name}</p>
      <p className="text-xs text-muted-foreground">
        {address.address_line1}
        {address.address_line2 && `, ${address.address_line2}`}
      </p>
      <p className="text-xs text-muted-foreground">
        {address.neighborhood_text && `${address.neighborhood_text}, `}
        {address.city_text ?? ""}
        {address.postal_code && ` ${address.postal_code}`}
      </p>
      {address.phone && (
        <p className="text-xs text-muted-foreground">{address.phone}</p>
      )}
      {address.landmark && (
        <p className="text-[10px] text-amber-600">{address.landmark}</p>
      )}
    </div>
  );
}

