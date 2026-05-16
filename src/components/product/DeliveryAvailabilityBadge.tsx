import { useQuery } from "@tanstack/react-query";
import { Check, X, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDeliveryCountry } from "@/hooks/use-delivery-country";
import { useCountries } from "@/hooks/use-countries";
import { useI18n } from "@/hooks/use-i18n";
import { pickI18n } from "@/lib/i18n/localized";

interface VendorShipping {
  source_country_id: string | null;
  ships_internationally: boolean | null;
  allowed_destination_country_ids: string[] | null;
}

export function DeliveryAvailabilityBadge({ vendorId }: { vendorId: string }) {
  const { countryId } = useDeliveryCountry();
  const { data: countries } = useCountries({ onlyEnabled: false });
  const { lang } = useI18n();

  const { data: vendor } = useQuery({
    queryKey: ["vendor-shipping", vendorId],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("source_country_id, ships_internationally, allowed_destination_country_ids")
        .eq("id", vendorId)
        .maybeSingle();
      if (error) throw error;
      return data as VendorShipping | null;
    },
  });

  if (!vendor || !countryId || !countries) return null;

  const selected = countries.find((c) => c.id === countryId);
  const source = vendor.source_country_id ? countries.find((c) => c.id === vendor.source_country_id) : null;
  const allowedIds = vendor.allowed_destination_country_ids ?? [];

  const matchesSource = vendor.source_country_id === countryId;
  const matchesIntl = vendor.ships_internationally === true && allowedIds.includes(countryId);
  const available = matchesSource || matchesIntl;

  const selectedLabel = selected
    ? `${selected.flag_emoji ?? ""} ${pickI18n(selected.name, selected.name_i18n ?? {}, lang)}`.trim()
    : "—";
  const sourceLabel = source
    ? `${source.flag_emoji ?? ""} ${pickI18n(source.name, source.name_i18n ?? {}, lang)}`.trim()
    : null;

  let reason = "";
  if (available) {
    reason = matchesSource
      ? `Le vendeur est basé dans votre pays (${selectedLabel}).`
      : `Le vendeur livre à l'international vers ${selectedLabel}.`;
  } else {
    if (sourceLabel && !vendor.ships_internationally) {
      reason = `Ce vendeur est basé au ${sourceLabel} et ne livre pas à l'international.`;
    } else if (vendor.ships_internationally) {
      reason = `Ce vendeur livre à l'international, mais pas vers ${selectedLabel}.`;
    } else {
      reason = `Ce vendeur ne livre pas vers ${selectedLabel}.`;
    }
  }

  return (
    <div
      className={`flex items-start gap-2 rounded-xl border p-2.5 text-xs ${
        available
          ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
          : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
      }`}
    >
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background/60">
        {available ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {available
            ? `Disponible pour ${selectedLabel}`
            : `Non disponible pour ${selectedLabel}`}
        </p>
        <p className="mt-0.5 opacity-90">{reason}</p>
        {vendor.ships_internationally && allowedIds.length > 0 && (
          <p className="mt-1 flex items-center gap-1 opacity-75">
            <Globe className="h-3 w-3" />
            Livre vers {allowedIds.length} pays
          </p>
        )}
      </div>
    </div>
  );
}
