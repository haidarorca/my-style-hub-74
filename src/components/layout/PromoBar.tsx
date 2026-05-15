import { useSiteSettings } from "@/hooks/use-site-settings";

export function PromoBar() {
  const s = useSiteSettings();
  if (!s.promo_bar_enabled || !s.promo_bar_text) return null;
  return (
    <div
      className="w-full text-center text-xs font-medium py-1.5 px-3 pt-safe"
      style={{ backgroundColor: s.promo_bar_bg_color, color: s.promo_bar_text_color }}
    >
      {s.promo_bar_text}
    </div>
  );
}
