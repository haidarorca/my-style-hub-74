/**
 * CatalogImage — Affichage catalogue "image entière"
 * --------------------------------------------------
 * Règle : l'image originale est affichée à 100 %, sans recadrage,
 * sans zoom automatique, sans déformation. On conserve une structure de
 * carte uniforme grâce à un cadre de ratio fixe, mais l'image à l'intérieur
 * utilise object-contain (letterboxing autorisé).
 */

import React from "react";
import { cn } from "@/lib/utils";

interface CatalogImageProps {
  src?: string | null;
  alt: string;
  /** Ratio du cadre (uniformité des cartes). Ex: "3/4", "1/1", "4/3". */
  ratio?: string;
  className?: string;
  imgClassName?: string;
  loading?: "lazy" | "eager";
  onClick?: () => void;
  children?: React.ReactNode;
}

export function CatalogImage({
  src,
  alt,
  ratio = "3/4",
  className,
  imgClassName,
  loading = "lazy",
  onClick,
  children,
}: CatalogImageProps) {
  return (
    <div
      className={cn("relative w-full overflow-hidden bg-muted/40", className)}
      style={{ aspectRatio: ratio }}
      onClick={onClick}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          draggable={false}
          className={cn(
            "absolute inset-0 h-full w-full select-none object-contain",
            imgClassName,
          )}
        />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-muted to-accent/30" />
      )}
      {children}
    </div>
  );
}
