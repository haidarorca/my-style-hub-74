import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCountries } from "@/hooks/use-countries";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "kawzone.delivery_country_id.v1";
const MANUAL_KEY = "kawzone.delivery_country_manual.v1";

interface Ctx {
  countryId: string | null;
  setCountryId: (id: string | null) => void;
  ready: boolean;
}

const DeliveryCountryContext = createContext<Ctx | undefined>(undefined);

async function detectCountryCode(): Promise<string | null> {
  try {
    const res = await fetch("https://ipapi.co/json/", { cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json();
    return typeof j?.country_code === "string" ? j.country_code.toUpperCase() : null;
  } catch {
    return null;
  }
}

export function DeliveryCountryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data: countries } = useCountries({ onlyEnabled: true });
  const qc = useQueryClient();
  const [countryId, setCountryIdState] = useState<string | null>(null);
  const [isManual, setIsManual] = useState(false);
  const [ready, setReady] = useState(false);

  // 1) hydrate from localStorage (only honor stored id if user picked it manually)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const manual = window.localStorage.getItem(MANUAL_KEY) === "1";
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (manual && stored) {
        setCountryIdState(stored);
        setIsManual(true);
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  // 2) for logged-in users without a manual pick, use their default address country
  useEffect(() => {
    if (!ready || isManual || !user) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("customer_addresses")
        .select("destination_country_id")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();
      if (!cancelled && data?.destination_country_id) {
        setCountryIdState(data.destination_country_id);
      }
    })();
    return () => { cancelled = true; };
  }, [ready, isManual, user]);

  // 3) auto-detect via geo-IP if still nothing and no manual pick
  useEffect(() => {
    if (!ready || isManual || countryId || !countries || countries.length === 0) return;
    let cancelled = false;
    (async () => {
      const code = await detectCountryCode();
      if (cancelled) return;
      if (code) {
        const match = countries.find((c) => c.code?.toUpperCase() === code);
        if (match) {
          setCountryIdState(match.id);
          return;
        }
      }
      // fallback: first enabled country
      setCountryIdState(countries[0].id);
    })();
    return () => { cancelled = true; };
  }, [ready, isManual, countryId, countries]);

  const setCountryId = useCallback((id: string | null) => {
    setCountryIdState(id);
    setIsManual(!!id);
    if (typeof window !== "undefined") {
      try {
        if (id) {
          window.localStorage.setItem(STORAGE_KEY, id);
          window.localStorage.setItem(MANUAL_KEY, "1");
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
          window.localStorage.removeItem(MANUAL_KEY);
        }
      } catch {
        /* ignore */
      }
    }
    qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && (q.queryKey.includes("display-prices") || q.queryKey.includes("display-price-lines") || q.queryKey.includes("deliverable-vendors")) });
  }, [qc]);

  const value = useMemo(() => ({ countryId, setCountryId, ready }), [countryId, setCountryId, ready]);
  return <DeliveryCountryContext.Provider value={value}>{children}</DeliveryCountryContext.Provider>;
}

export function useDeliveryCountry() {
  const ctx = useContext(DeliveryCountryContext);
  if (!ctx) throw new Error("useDeliveryCountry must be used inside <DeliveryCountryProvider>");
  return ctx;
}
