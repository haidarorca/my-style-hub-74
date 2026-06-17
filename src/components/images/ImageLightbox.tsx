/**
 * ImageLightbox - Visionneuse d'images plein ecran avec swipe
 * -----------------------------------------------------------
 * Fonctionnalites :
 *   - Ouverture en plein ecran sur clic
 *   - Navigation swipe gauche/droite (touch + souris)
 *   - Navigation clavier (fleches gauche/droite, Escape)
 *   - Fond assombli avec backdrop-blur
 *   - Compteur d'images
 *   - Thumbnails en bas (scrollable)
 *   - Fermeture par clic sur fond, bouton X, ou Escape
 *   - Animations fluides
 *   - Accessible (ARIA)
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageLightboxProps {
  images: string[];
  alt: string;
  open: boolean;
  initialIndex?: number;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
}

export const ImageLightbox = React.memo(function ImageLightbox({
  images,
  alt,
  open,
  initialIndex = 0,
  onClose,
  onIndexChange,
}: ImageLightboxProps) {
  const [current, setCurrent] = useState(initialIndex);
  const [direction, setDirection] = useState(0); // -1 left, 1 right, 0 none
  const [isAnimating, setIsAnimating] = useState(false);
  const [loaded, setLoaded] = useState<Set<number>>(new Set([initialIndex]));
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);

  // Synchroniser l'index initial quand le lightbox s'ouvre
  useEffect(() => {
    if (open) {
      setCurrent(initialIndex);
      setLoaded(new Set([initialIndex]));
      setScale(1);
    }
  }, [open, initialIndex]);

  // Precharger les images adjacentes
  useEffect(() => {
    if (!open) return;
    const toLoad = new Set(loaded);
    [-1, 0, 1].forEach((offset) => {
      const idx = current + offset;
      if (idx >= 0 && idx < images.length) {
        toLoad.add(idx);
      }
    });
    setLoaded(toLoad);
  }, [current, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = useCallback(
    (index: number) => {
      if (isAnimating || index === current) return;
      if (index < 0 || index >= images.length) return;

      setDirection(index > current ? 1 : -1);
      setIsAnimating(true);
      setScale(1);

      setTimeout(() => {
        setCurrent(index);
        onIndexChange?.(index);
        setDirection(0);
        setIsAnimating(false);
      }, 250);
    },
    [current, images.length, isAnimating, onIndexChange],
  );

  const goNext = useCallback(() => goTo(current + 1), [goTo, current]);
  const goPrev = useCallback(() => goTo(current - 1), [goTo, current]);

  // Clavier
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowRight":
          goNext();
          break;
        case "ArrowLeft":
          goPrev();
          break;
        case "Escape":
          onClose();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, goNext, goPrev, onClose]);

  // Touch swipe
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    isDragging.current = false;
  }, []);

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStart.current) return;
      const t = e.touches[0];
      const dx = t.clientX - touchStart.current.x;
      const dy = t.clientY - touchStart.current.y;

      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
        isDragging.current = true;
      }
    },
    [],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStart.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.current.x;
      touchStart.current = null;

      if (!isDragging.current) return;

      if (dx < -50) goNext();
      else if (dx > 50) goPrev();
      isDragging.current = false;
    },
    [goNext, goPrev],
  );

  // Mouse swipe (desktop)
  const mouseStart = useRef<{ x: number } | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    mouseStart.current = { x: e.clientX };
  }, []);

  const onMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!mouseStart.current) return;
      const dx = e.clientX - mouseStart.current.x;
      mouseStart.current = null;

      if (Math.abs(dx) > 80) {
        if (dx < 0) goNext();
        else goPrev();
      }
    },
    [goNext, goPrev],
  );

  // Zoom
  const toggleZoom = useCallback(() => {
    setScale((s) => (s === 1 ? 2 : 1));
  }, []);

  // Scroll lock
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open) return null;

  const hasNext = current < images.length - 1;
  const hasPrev = current > 0;

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Visionneuse d'images"
    >
      {/* Bouton fermer */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        aria-label="Fermer"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Compteur */}
      <div className="absolute left-4 top-4 z-10 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur">
        {current + 1} / {images.length}
      </div>

      {/* Zoom */}
      <button
        onClick={toggleZoom}
        className="absolute right-16 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        aria-label="Zoom"
      >
        <ZoomIn className="h-5 w-5" />
      </button>

      {/* Fleche gauche */}
      {hasPrev && (
        <button
          onClick={goPrev}
          className="absolute left-2 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:left-4"
          aria-label="Image precedente"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {/* Fleche droite */}
      {hasNext && (
        <button
          onClick={goNext}
          className="absolute right-2 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:right-4"
          aria-label="Image suivante"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* Zone d'image avec swipe */}
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden px-16 py-20"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
      >
        <div
          className={cn(
            "relative flex h-full w-full max-w-4xl items-center justify-center transition-transform duration-300 ease-out",
            direction === 1 && "-translate-x-full opacity-0",
            direction === -1 && "translate-x-full opacity-0",
          )}
        >
          {images.map((url, i) => (
            <div
              key={`${url}-${i}`}
              className={cn(
                "absolute inset-0 flex items-center justify-center",
                i === current ? "visible" : "invisible",
              )}
            >
              {(loaded.has(i) || i === current) && (
                <img
                  src={url}
                  alt={`${alt} ${i + 1}`}
                  className="max-h-full max-w-full select-none object-contain transition-transform duration-200"
                  style={{ transform: `scale(${i === current ? scale : 1})`, cursor: scale === 1 ? "grab" : "grab" }}
                  draggable={false}
                  onDoubleClick={toggleZoom}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Thumbnails en bas */}
      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 z-10 flex max-w-[80vw] -translate-x-1/2 gap-2 overflow-x-auto rounded-xl bg-black/40 p-2 backdrop-blur scrollbar-hide">
          {images.map((url, i) => (
            <button
              key={`thumb-${url}-${i}`}
              onClick={() => goTo(i)}
              className={cn(
                "h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition",
                i === current
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-transparent opacity-60 hover:opacity-100",
              )}
              aria-label={`Image ${i + 1}`}
            >
              <img
                src={url}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
});
