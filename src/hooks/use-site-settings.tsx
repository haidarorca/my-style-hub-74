import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SiteSettings {
  id: string;
  site_name: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  whatsapp_number: string | null;
  whatsapp_default_message: string | null;
  commission_whatsapp_number: string | null;
  promo_bar_enabled: boolean;
  promo_bar_text: string | null;
  promo_bar_bg_color: string;
  promo_bar_text_color: string;
  hero_title: string | null;
  hero_subtitle: string | null;
  footer_text: string | null;
}

const DEFAULTS: SiteSettings = {
  id: "main",
  site_name: "KawZone",
  logo_url: null,
  primary_color: "#e85d3a",
  accent_color: "#1a1a1a",
  whatsapp_number: "221776533606",
  whatsapp_default_message: "Bonjour, je suis intéressé par vos produits.",
  commission_whatsapp_number: null,
  promo_bar_enabled: false,
  promo_bar_text: "",
  promo_bar_bg_color: "#000000",
  promo_bar_text_color: "#ffffff",
  hero_title: "",
  hero_subtitle: "",
  footer_text: "",
};

// Mutable global so non-React code (whatsapp.ts) can read latest WhatsApp number
export const runtimeSettings = {
  whatsapp_number: DEFAULTS.whatsapp_number,
  whatsapp_default_message: DEFAULTS.whatsapp_default_message,
  commission_whatsapp_number: DEFAULTS.commission_whatsapp_number,
};

const Ctx = createContext<SiteSettings>(DEFAULTS);

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: ["site_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings" as never)
        .select("*")
        .eq("id", "main")
        .maybeSingle();
      if (error) throw error;
      return (data as SiteSettings | null) ?? DEFAULTS;
    },
    staleTime: 60_000,
  });

  const settings = data ?? DEFAULTS;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (settings.primary_color) root.style.setProperty("--primary", settings.primary_color);
    if (settings.accent_color) root.style.setProperty("--accent", settings.accent_color);
    if (settings.site_name) document.title = settings.site_name;
    runtimeSettings.whatsapp_number = settings.whatsapp_number || DEFAULTS.whatsapp_number!;
    runtimeSettings.whatsapp_default_message = settings.whatsapp_default_message || DEFAULTS.whatsapp_default_message!;
    runtimeSettings.commission_whatsapp_number = settings.commission_whatsapp_number ?? null;
  }, [settings.primary_color, settings.accent_color, settings.site_name, settings.whatsapp_number, settings.whatsapp_default_message, settings.commission_whatsapp_number]);

  return <Ctx.Provider value={settings}>{children}</Ctx.Provider>;
}

export function useSiteSettings() {
  return useContext(Ctx);
}

export interface HomeBanner {
  id: string;
  image_url: string;
  link_url: string | null;
  title: string | null;
  position: number;
  enabled: boolean;
}

export function useHomeBanners() {
  return useQuery({
    queryKey: ["home_banners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("home_banners" as never)
        .select("*")
        .eq("enabled", true)
        .order("position");
      if (error) throw error;
      return (data ?? []) as unknown as HomeBanner[];
    },
    staleTime: 60_000,
  });
}
