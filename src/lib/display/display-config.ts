/**
 * Configuration d'affichage du catalogue (cartes produits).
 * Règle absolue : jamais de recadrage. L'image est toujours affichée
 * en entier (object-contain), seul le cadre change de taille.
 */

export type CardStyle = "compact" | "normal" | "large";
export type GapSize = "tight" | "normal" | "wide";
export type ImageRatio = "3/4" | "1/1" | "4/3" | "16/9";

export interface DisplayConfig {
  imageRatio: ImageRatio;
  cardStyle: CardStyle;
  showPrice: boolean;
  showButton: boolean;
  showBadges: boolean;
  showName: boolean;
  gap: GapSize;
  colsMobile: number;
  colsDesktop: number;
}

export const DEFAULT_DISPLAY: DisplayConfig = {
  imageRatio: "3/4",
  cardStyle: "normal",
  showPrice: true,
  showButton: true,
  showBadges: true,
  showName: true,
  gap: "normal",
  colsMobile: 2,
  colsDesktop: 5,
};

export function normalizeDisplay(raw: unknown, base: DisplayConfig = DEFAULT_DISPLAY): DisplayConfig {
  const o = (raw ?? {}) as Partial<DisplayConfig>;
  return {
    imageRatio: o.imageRatio ?? base.imageRatio,
    cardStyle: o.cardStyle ?? base.cardStyle,
    showPrice: o.showPrice ?? base.showPrice,
    showButton: o.showButton ?? base.showButton,
    showBadges: o.showBadges ?? base.showBadges,
    showName: o.showName ?? base.showName,
    gap: o.gap ?? base.gap,
    colsMobile: o.colsMobile ?? base.colsMobile,
    colsDesktop: o.colsDesktop ?? base.colsDesktop,
  };
}

export const GAP_PX: Record<GapSize, { mobile: number; desktop: number }> = {
  tight: { mobile: 6, desktop: 10 },
  normal: { mobile: 10, desktop: 16 },
  wide: { mobile: 16, desktop: 24 },
};

/** Styles inline de la grille produits (responsive via CSS variables). */
export function gridStyle(cfg: DisplayConfig): React.CSSProperties {
  const gap = GAP_PX[cfg.gap];
  return {
    display: "grid",
    gridTemplateColumns: `repeat(var(--pg-cols, ${cfg.colsMobile}), minmax(0, 1fr))`,
    gap: "var(--pg-gap)",
    // variables consommées par la media query utilitaire
    ["--pg-cols" as string]: String(cfg.colsMobile),
    ["--pg-cols-desktop" as string]: String(cfg.colsDesktop),
    ["--pg-gap" as string]: `${gap.mobile}px`,
    ["--pg-gap-desktop" as string]: `${gap.desktop}px`,
  } as React.CSSProperties;
}

export const CARD_PADDING: Record<CardStyle, string> = {
  compact: "p-1.5",
  normal: "p-[clamp(0.5rem,2vw,0.75rem)]",
  large: "p-3 sm:p-4",
};

export const NAME_CLASS: Record<CardStyle, string> = {
  compact: "text-[11px] leading-snug",
  normal: "text-[clamp(11px,3.2vw,13px)] leading-snug",
  large: "text-[clamp(13px,3.6vw,15px)] leading-snug font-medium",
};

export const PRICE_CLASS: Record<CardStyle, string> = {
  compact: "text-[12px]",
  normal: "text-[clamp(13px,3.6vw,15px)]",
  large: "text-[clamp(15px,4.2vw,18px)]",
};
