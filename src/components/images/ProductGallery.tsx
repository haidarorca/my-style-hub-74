/**
 * ProductGallery - Galerie de produit avec carousel et lightbox
 * ---------------------------------------------------------------
 * Ameliorations par rapport a l'ancienne version :
 *   - Lightbox plein ecran sur clic d'image
 *   - Swipe tactile pour naviguer
 *   - Navigation clavier (fleches, Escape)
 *   - Thumbnails en bas
 *   - Compteur d'images
 *   - Animations fluides
 *
 * Props :
 *   - urls: string[]            URLs des images
 *   - alt: string               Texte alternatif
 *   - activeIndex: number       Index actif
 *   - onIndexChange: (i) => {}  Callback changement d'index
 *   - dir: "ltr" | "rtl"        Direction du texte
 */

import React, { useEffect, useState } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { ChevronLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { ImageLightbox } from "./ImageLightbox";

interface ProductGalleryProps {
  urls: string[];
  alt: string;
  activeIndex: number;
  onIndexChange: (i: number) => void;
  dir: "ltr" | "rtl";
}

export const ProductGallery = React.memo(function ProductGallery({
  urls,
  alt,
  activeIndex,
  onIndexChange,
  dir,
}: ProductGalleryProps) {
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Synchroniser le carousel avec l'index actif
  useEffect(() => {
    if (!api) return;
    const onSelect = () => onIndexChange(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api, onIndexChange]);

  useEffect(() => {
    if (!api) return;
    if (api.selectedScrollSnap() !== activeIndex) {
      api.scrollTo(activeIndex);
    }
  }, [api, activeIndex]);

  // Ouvrir le lightbox quand on clique sur l'image
  const openLightbox = () => {
    if (urls.length > 0) {
      setLightboxOpen(true);
    }
  };

  if (urls.length === 0) {
    return (
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        <Link
          to="/"
          className={`absolute top-3 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 backdrop-blur ${dir === "rtl" ? "right-3" : "left-3"}`}
        >
          <ChevronLeft className={`h-5 w-5 ${dir === "rtl" ? "rotate-180" : ""}`} />
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        <Carousel setApi={setApi} opts={{ loop: false, align: "start" }}>
          <CarouselContent className="ml-0">
            {urls.map((url, i) => (
              <CarouselItem key={`${url}-${i}`} className="pl-0 basis-full">
                <div
                  className="relative aspect-square w-full cursor-zoom-in overflow-hidden bg-muted"
                  onClick={openLightbox}
                >
                  <img
                    src={url}
                    alt={`${alt} ${i + 1}`}
                    className="h-full w-full object-cover select-none"
                    draggable={false}
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>

        {/* Bouton retour */}
        <Link
          to="/"
          className={`absolute top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 backdrop-blur ${dir === "rtl" ? "right-3" : "left-3"}`}
        >
          <ChevronLeft className={`h-5 w-5 ${dir === "rtl" ? "rotate-180" : ""}`} />
        </Link>

        {/* Compteur d'images */}
        {urls.length > 1 && (
          <>
            <div className="absolute right-3 top-3 z-10 rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium backdrop-blur">
              {activeIndex + 1} / {urls.length}
            </div>
            {/* Indicateurs de pagination */}
            <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
              {urls.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === activeIndex ? "w-5 bg-primary" : "w-1.5 bg-background/70",
                  )}
                />
              ))}
            </div>
          </>
        )}

        {/* Message "Appuyez pour agrandir" */}
        {urls.length > 0 && (
          <div className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[10px] text-white backdrop-blur">
            Appuyez pour agrandir
          </div>
        )}
      </div>

      {/* Lightbox plein ecran */}
      <ImageLightbox
        images={urls}
        alt={alt}
        open={lightboxOpen}
        initialIndex={activeIndex}
        onClose={() => setLightboxOpen(false)}
        onIndexChange={onIndexChange}
      />
    </>
  );
});
