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
  auth_sender_email: string | null;
  auth_sender_name: string | null;
  banner_autoplay: boolean;
  banner_interval_ms: number;
  banner_transition: "slide" | "fade";
  banner_show_arrows: boolean;
  banner_show_dots: boolean;
  cny_to_xof_rate: number;
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
  auth_sender_email: "haidarorca@gmail.com",
  auth_sender_name: "KawZone",
  banner_autoplay: true,
  banner_interval_ms: 4500,
  banner_transition: "slide",
  banner_show_arrows: true,
  banner_show_dots: true,
  cny_to_xof_rate: 85,
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
  image_url_mobile: string | null;
  image_url_tablet: string | null;
  link_url: string | null;
  title: string | null;
  subtitle: string | null;
  cta_label: string | null;
  text_align: "left" | "center" | "right";
  text_color: string;
  overlay_opacity: number;
  height_mobile: number;
  height_tablet: number;
  height_desktop: number;
  object_fit: "cover" | "contain" | "fill";
  focal_x: number;
  focal_y: number;
  zoom: number;
  rotation: number;
  position: number;
  enabled: boolean;
}

export const BANNER_DEFAULTS: Omit<HomeBanner, "id" | "image_url" | "position"> = {
  image_url_mobile: null,
  image_url_tablet: null,
  link_url: null,
  title: null,
  subtitle: null,
  cta_label: null,
  text_align: "left",
  text_color: "#ffffff",
  overlay_opacity: 0.35,
  height_mobile: 220,
  height_tablet: 320,
  height_desktop: 480,
  object_fit: "cover",
  focal_x: 0.5,
  focal_y: 0.5,
  zoom: 1,
  rotation: 0,
  enabled: true,
};

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
