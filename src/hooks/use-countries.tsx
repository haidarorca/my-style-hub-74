import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { pickI18n } from "@/lib/i18n/localized";
import { useI18n } from "@/hooks/use-i18n";

export interface Country {
  id: string;
  code: string;
  name: string;
  name_i18n: Record<string, string> | null;
  flag_emoji: string | null;
  is_enabled: boolean;
  position: number;
}

export function useCountries(opts: { onlyEnabled?: boolean } = {}) {
  const { onlyEnabled = false } = opts;
  return useQuery({
    queryKey: ["countries", { onlyEnabled }],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let q = (supabase as any)
        .from("countries")
        .select("id, code, name, name_i18n, flag_emoji, is_enabled, position")
        .order("position", { ascending: true })
        .order("name", { ascending: true });
      if (onlyEnabled) q = q.eq("is_enabled", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Country[];
    },
  });
}

export function useCountryLabel() {
  const { lang } = useI18n();
  return (c: Country | null | undefined) => {
    if (!c) return "—";
    const name = pickI18n(c.name, c.name_i18n ?? {}, lang);
    return c.flag_emoji ? `${c.flag_emoji} ${name}` : name;
  };
}
