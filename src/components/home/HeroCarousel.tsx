import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useHomeBanners, useSiteSettings } from "@/hooks/use-site-settings";
import { BannerSlide } from "./BannerSlide";
import { cn } from "@/lib/utils";

export function HeroCarousel() {
  const { data: banners } = useHomeBanners();
  const settings = useSiteSettings();
  const autoplay = useRef(
    Autoplay({
      delay: settings.banner_interval_ms || 4500,
      stopOnInteraction: false,
      stopOnMouseEnter: true,
    }),
  );

  const isFade = settings.banner_transition === "fade";
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: "start", duration: isFade ? 30 : 25 },
    settings.banner_autoplay ? [autoplay.current] : [],
  );

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setIdx(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    onSelect();
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  if (!banners || banners.length === 0) return null;

  return (
    <section className="mt-4 overflow-hidden rounded-[calc(var(--radius)+6px)] border border-border bg-card">
      <div className="relative">
        <div ref={emblaRef} className="overflow-hidden">
          <div className={cn("flex", isFade && "[&>*]:opacity-0 [&>*]:transition-opacity")}>
            {banners.map((b, i) => (
              <div
                key={b.id}
                className={cn(
                  "min-w-0 shrink-0 grow-0 basis-full",
                  isFade && i === idx && "!opacity-100",
                )}
              >
                <BannerSlide banner={b} />
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Contrôles sous la bannière : ne recouvrent jamais le visuel */}
      {banners.length > 1 && (settings.banner_show_dots || settings.banner_show_arrows) && (
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="flex flex-1 items-center gap-1.5">
            {settings.banner_show_dots &&
              banners.map((_, i) => (
                <button
                  key={i}
                  onClick={() => emblaApi?.scrollTo(i)}
                  aria-label={`Bannière ${i + 1}`}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    i === idx ? "w-6 bg-[var(--brand)]" : "w-1.5 bg-border",
                  )}
                />
              ))}
          </div>

          {settings.banner_show_arrows && (
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={scrollPrev}
                aria-label="Précédent"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground/75 transition-colors hover:border-primary/30 hover:text-foreground active:scale-95"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={scrollNext}
                aria-label="Suivant"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground/75 transition-colors hover:border-primary/30 hover:text-foreground active:scale-95"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
