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
    <section className="mt-3 overflow-hidden rounded-2xl bg-card shadow-soft">
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

        {settings.banner_show_arrows && banners.length > 1 && (
          <>
            <button
              type="button"
              onClick={scrollPrev}
              aria-label="Précédent"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/70 p-2 text-foreground shadow backdrop-blur transition hover:bg-background"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={scrollNext}
              aria-label="Suivant"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/70 p-2 text-foreground shadow backdrop-blur transition hover:bg-background"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {settings.banner_show_dots && banners.length > 1 && (
        <div className="flex justify-center gap-1.5 py-2">
          {banners.map((_, i) => (
            <button
              key={i}
              onClick={() => emblaApi?.scrollTo(i)}
              aria-label={`Bannière ${i + 1}`}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === idx ? "w-5 bg-primary" : "w-1.5 bg-muted",
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}
