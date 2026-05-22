/**
 * SmartImageUpload - Composant d'upload intelligent avec compression auto
 * ---------------------------------------------------------------------
 * Fonctionnalites :
 *   - Compression automatique avant upload
 *   - Preview de l'image
 *   - Support drag & drop
 *   - Gestion des erreurs
 *   - Loader pendant le traitement
 *   - Bouton de suppression
 *
 * Usage pour logo vendeur :
 *   <SmartImageUpload
 *     value={shopLogoUrl}
 *     onUpload={(url) => setLogoUrl(url)}
 *     onRemove={() => setLogoUrl(null)}
 *     bucket="site-assets"
 *     folder={`vendors/${userId}`}
 *     maxWidth={400}
 *     maxHeight={400}
 *     aspectRatio="square"
 *     label="Logo de la boutique"
 *   />
 *
 * Usage pour banniere vendeur :
 *   <SmartImageUpload
 *     value={shopBannerUrl}
 *     onUpload={(url) => setBannerUrl(url)}
 *     onRemove={() => setBannerUrl(null)}
 *     bucket="site-assets"
 *     folder={`vendors/${userId}`}
 *     maxWidth={1200}
 *     maxHeight={400}
 *     aspectRatio="wide"
 *     label="Banniere du magasin"
 *   />
 */

import React, { useCallback, useRef, useState } from "react";
import { ImagePlus, Loader2, X, Upload, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useImageCompression } from "@/hooks/use-image-compression";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ImageAspectRatio = "square" | "wide" | "portrait" | "free";

interface SmartImageUploadProps {
  /** URL actuelle de l'image (null si aucune) */
  value: string | null;
  /** Callback appele avec l'URL publique apres upload reussi */
  onUpload: (url: string) => void;
  /** Callback appele quand l'utilisateur supprime l'image */
  onRemove: () => void;
  /** Bucket Supabase (ex: "site-assets", "product-images") */
  bucket: string;
  /** Dossier dans le bucket (ex: "vendors/123") */
  folder: string;
  /** Label affiche au-dessus */
  label?: string;
  /** Texte d'aide */
  hint?: string;
  /** Ratio d'aspect pour la preview */
  aspectRatio?: ImageAspectRatio;
  /** Largeur max de l'image apres compression */
  maxWidth?: number;
  /** Hauteur max de l'image apres compression */
  maxHeight?: number;
  /** Qualite de compression (0-1) */
  quality?: number;
  /** Taille max en MB */
  maxSizeMB?: number;
  /** Classes CSS additionnelles */
  className?: string;
  /** Desactive le composant */
  disabled?: boolean;
}

const ASPECT_CLASSES: Record<ImageAspectRatio, string> = {
  square: "aspect-square",
  wide: "aspect-[3/1]",
  portrait: "aspect-[3/4]",
  free: "aspect-video",
};

export const SmartImageUpload = React.memo(function SmartImageUpload({
  value,
  onUpload,
  onRemove,
  bucket,
  folder,
  label,
  hint,
  aspectRatio = "free",
  maxWidth = 1600,
  maxHeight = 1600,
  quality = 0.85,
  maxSizeMB = 5,
  className,
  disabled = false,
}: SmartImageUploadProps) {
  const { compress } = useImageCompression();
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("Veuillez selectionner une image (JPEG, PNG, WEBP).");
        return;
      }

      setIsUploading(true);
      setPreviewError(false);

      try {
        // 1. Compresser l'image
        const compressed = await compress(file, {
          maxWidth,
          maxHeight,
          quality,
          maxSizeMB,
        });

        // 2. Generer un nom de fichier unique
        const ext = compressed.name.split(".").pop() || "jpg";
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const path = `${folder}/${timestamp}-${random}.${ext}`;

        // 3. Uploader vers Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(path, compressed, {
            upsert: true,
            contentType: compressed.type,
          });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        // 4. Recuperer l'URL publique
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);

        if (!data?.publicUrl) {
          throw new Error("Impossible de recuperer l'URL de l'image.");
        }

        onUpload(data.publicUrl);
        toast.success("Image telechargee avec succes !");
      } catch (err: any) {
        console.error("[SmartImageUpload] Erreur:", err);
        toast.error(err.message || "Erreur lors du telechargement de l'image.");
      } finally {
        setIsUploading(false);
        // Reset l'input pour permettre de reselectionner le meme fichier
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [bucket, compress, folder, maxHeight, maxSizeMB, maxWidth, onUpload, quality],
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (disabled || isUploading) return;

      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [disabled, handleFile, isUploading],
  );

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled && !isUploading) setIsDragging(true);
    },
    [disabled, isUploading],
  );

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const triggerFileSelect = useCallback(() => {
    if (!disabled && !isUploading) {
      inputRef.current?.click();
    }
  }, [disabled, isUploading]);

  // Si une image existe, afficher la preview
  if (value && !previewError) {
    return (
      <div className={cn("space-y-2", className)}>
        {label && (
          <label className="text-sm font-medium text-foreground">{label}</label>
        )}
        <div
          className={cn(
            "group relative overflow-hidden rounded-xl border border-border bg-muted",
            ASPECT_CLASSES[aspectRatio],
          )}
        >
          <img
            src={value}
            alt={label || "Image"}
            className="h-full w-full object-cover transition-opacity"
            onError={() => setPreviewError(true)}
          />

          {/* Overlay avec actions */}
          <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/0 transition-colors group-hover:bg-black/40">
            <button
              type="button"
              onClick={triggerFileSelect}
              disabled={disabled || isUploading}
              className="flex h-10 items-center gap-2 rounded-full bg-white/90 px-4 text-sm font-medium text-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100 hover:bg-white disabled:opacity-50"
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              Changer
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled || isUploading}
              className="flex h-10 items-center gap-2 rounded-full bg-destructive/90 px-4 text-sm font-medium text-destructive-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100 hover:bg-destructive disabled:opacity-50"
            >
              <X className="h-4 w-4" />
              Supprimer
            </button>
          </div>
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onInputChange}
        />
      </div>
    );
  }

  // Zone d'upload (pas d'image ou erreur de preview)
  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label className="text-sm font-medium text-foreground">{label}</label>
      )}
      <button
        type="button"
        onClick={triggerFileSelect}
        disabled={disabled || isUploading}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={cn(
          "relative flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted p-6 transition-colors hover:bg-accent/50",
          ASPECT_CLASSES[aspectRatio],
          isDragging && "border-primary bg-primary/5",
          (disabled || isUploading) && "cursor-not-allowed opacity-60",
        )}
      >
        {isUploading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-center">
              <p className="text-sm font-medium">Compression et telechargement...</p>
              <p className="text-xs text-muted-foreground">Veuillez patienter</p>
            </div>
          </>
        ) : (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background">
              {isDragging ? (
                <Upload className="h-5 w-5 text-primary" />
              ) : (
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">
                {isDragging ? "Deposez l'image ici" : "Cliquez ou glissez une image"}
              </p>
              <p className="text-xs text-muted-foreground">
                JPEG, PNG, WEBP - Compression automatique
              </p>
            </div>
          </>
        )}
      </button>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onInputChange}
      />
    </div>
  );
});
