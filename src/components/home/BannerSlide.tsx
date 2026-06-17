import { useEffect, useState } from "react";
import type { HomeBanner } from "@/hooks/use-site-settings";
import { cn } from "@/lib/utils";

interface BannerSlideProps {
  banner: Partial<HomeBanner> & { image_url: string };
  /** Force a viewport (overrides window-based detection). Useful for admin preview. */
  viewport?: "mobile" | "tablet" | "desktop";
  /** Click handler — used in editor preview to ignore the link. */
  asPreview?: boolean;
  className?: string;
}

function useViewport(): "mobile" | "tablet" | "desktop" {
  const [vp, setVp] = useState<"mobile" | "tablet" | "desktop">("desktop");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const compute = () => {
      const w = window.innerWidth;
      setVp(w < 640 ? "mobile" : w < 1024 ? "tablet" : "desktop");
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  return vp;
}

export function BannerSlide({ banner, viewport, asPreview, className }: BannerSlideProps) {
  const detected = useViewport();
  const vp = viewport ?? detected;

  const height =
    vp === "mobile"
      ? banner.height_mobile ?? 220
      : vp === "tablet"
      ? banner.height_tablet ?? 320
      : banner.height_desktop ?? 480;

  const src =
    (vp === "mobile" && banner.image_url_mobile) ||
    (vp === "tablet" && banner.image_url_tablet) ||
    banner.image_url;

  const focalX = (banner.focal_x ?? 0.5) * 100;
  const focalY = (banner.focal_y ?? 0.5) * 100;
  const zoom = banner.zoom ?? 1;
  const rotation = banner.rotation ?? 0;
  const objectFit = banner.object_fit ?? "cover";
  const overlay = banner.overlay_opacity ?? 0.35;
  const align = banner.text_align ?? "left";
  const textColor = banner.text_color ?? "#ffffff";
  const hasText = banner.title || banner.subtitle || banner.cta_label;

  const Content = (
    <div
      className={cn("relative w-full overflow-hidden", className)}
      style={{ height: `${height}px` }}
    >
      <img
        src={src}
        alt={banner.title ?? "Bannière"}
        loading="eager"
        decoding="async"
        className="absolute inset-0 h-full w-full"
        style={{
          objectFit,
          objectPosition: `${focalX}% ${focalY}%`,
          transform: `scale(${zoom}) rotate(${rotation}deg)`,
          transformOrigin: `${focalX}% ${focalY}%`,
        }}
      />
      {hasText && overlay > 0 && (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: `rgba(0,0,0,${overlay})` }}
          aria-hidden
        />
      )}
      {hasText && (
        <div
          className={cn(
            "absolute inset-0 flex flex-col justify-center gap-2 p-5 sm:p-8 md:p-12",
            align === "center" && "items-center text-center",
            align === "right" && "items-end text-right",
            align === "left" && "items-start text-left",
          )}
          style={{ color: textColor }}
        >
          {banner.title && (
            <h2 className="max-w-2xl text-xl font-extrabold leading-tight drop-shadow-md sm:text-3xl md:text-5xl">
              {banner.title}
            </h2>
          )}
          {banner.subtitle && (
            <p className="max-w-xl text-sm opacity-95 drop-shadow sm:text-base md:text-lg">
              {banner.subtitle}
            </p>
          )}
          {banner.cta_label && (
            <span className="mt-2 inline-flex items-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-md transition hover:opacity-90">
              {banner.cta_label}
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (asPreview || !banner.link_url) return Content;
  return (
    <a
      href={banner.link_url}
      target="_blank"
      rel="noopener noreferrer"
      className="block"
    >
      {Content}
    </a>
  );
}
