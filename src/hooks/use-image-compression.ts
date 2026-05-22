/**
 * useImageCompression - Hook utilitaire pour compresser et optimiser les images
 * ------------------------------------------------------------------------------
 * Usage:
 *   const { compress, compressMultiple, isCompressing } = useImageCompression();
 *   const compressedFile = await compress(file, { maxWidth: 1200, quality: 0.85 });
 *
 * Options par defaut (surchargeables):
 *   - maxWidth: 1600px       (redimensionnement si plus large)
 *   - maxHeight: 1600px      (redimensionnement si plus haut)
 *   - quality: 0.85          (qualite JPEG/WebP, 0-1)
 *   - maxSizeMB: 5           (si l'image depasse, qualite reduite progressivement)
 *   - outputType: 'image/jpeg' (format de sortie)
 *
 * Le hook gere automatiquement:
 *   - Redimensionnement proportionnel
 *   - Conversion de format (PNG->JPEG pour reduire la taille)
 *   - Compression progressive si l'image reste trop lourde
 *   - Preservation de la transparence (PNG) quand necessaire
 *   - Rotation automatique basee sur les EXIF
 */

import { useCallback, useRef } from "react";

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxSizeMB?: number;
  outputType?: "image/jpeg" | "image/png" | "image/webp";
}

const DEFAULTS: Required<CompressionOptions> = {
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.85,
  maxSizeMB: 5,
  outputType: "image/jpeg",
};

/** Taille en bytes */
function mbToBytes(mb: number) {
  return mb * 1024 * 1024;
}

/** Redimensionne les dimensions tout en conservant le ratio */
function fitDimensions(
  srcW: number,
  srcH: number,
  maxW: number,
  maxH: number,
): { width: number; height: number } {
  const ratio = Math.min(maxW / srcW, maxH / srcH, 1);
  return {
    width: Math.round(srcW * ratio),
    height: Math.round(srcH * ratio),
  };
}

/** Corrige l'orientation EXIF en lisant les metadonnees */
function getExifOrientation(file: File): Promise<number> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const view = new DataView(e.target?.result as ArrayBuffer);
      if (view.getUint16(0, false) !== 0xffd8) {
        resolve(1);
        return;
      }
      const length = view.byteLength;
      let offset = 2;
      while (offset < length) {
        if (view.getUint16(offset, false) !== 0xffe1) {
          if (view.getUint16(offset, false) === 0xffda) break;
          offset += 2 + view.getUint16(offset + 2, false);
          continue;
        }
        if (view.getUint32(offset + 4, false) !== 0x45786966) {
          offset += 2 + view.getUint16(offset + 2, false);
          continue;
        }
        const little = view.getUint16(offset + 10, false) === 0x4949;
        let o = offset + 12;
        const tags = view.getUint16(o, little);
        o += 2;
        for (let i = 0; i < tags; i++) {
          if (view.getUint16(o + i * 12, little) === 0x0112) {
            resolve(view.getUint16(o + i * 12 + 8, little));
            return;
          }
        }
        offset += 2 + view.getUint16(offset + 2, false);
      }
      resolve(1);
    };
    reader.onerror = () => resolve(1);
    reader.readAsArrayBuffer(file.slice(0, 64 * 1024));
  });
}

/** Applique la rotation EXIF sur le canvas */
function applyOrientation(
  ctx: CanvasRenderingContext2D,
  orientation: number,
  width: number,
  height: number,
) {
  switch (orientation) {
    case 2:
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      break;
    case 3:
      ctx.translate(width, height);
      ctx.rotate(Math.PI);
      break;
    case 4:
      ctx.translate(0, height);
      ctx.scale(1, -1);
      break;
    case 5:
      ctx.translate(height, 0);
      ctx.rotate(Math.PI / 2);
      ctx.scale(1, -1);
      break;
    case 6:
      ctx.translate(height, 0);
      ctx.rotate(Math.PI / 2);
      break;
    case 7:
      ctx.translate(height, 0);
      ctx.rotate(Math.PI / 2);
      ctx.scale(-1, 1);
      break;
    case 8:
      ctx.translate(0, width);
      ctx.rotate(-Math.PI / 2);
      break;
  }
}

/** Compresse un fichier image */
async function compressFile(
  file: File,
  opts: Required<CompressionOptions>,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = async () => {
      URL.revokeObjectURL(url);

      // 1. Lire l'orientation EXIF
      const orientation = await getExifOrientation(file);
      const needsSwap = orientation >= 5 && orientation <= 8;

      // 2. Calculer les nouvelles dimensions
      const srcW = needsSwap ? img.naturalHeight : img.naturalWidth;
      const srcH = needsSwap ? img.naturalWidth : img.naturalHeight;
      const { width, height } = fitDimensions(srcW, srcH, opts.maxWidth, opts.maxHeight);

      // 3. Determiner le format de sortie
      const isTransparent =
        opts.outputType === "image/png" ||
        (file.type === "image/png" && opts.outputType !== "image/jpeg");
      const outputType = isTransparent ? "image/png" : opts.outputType;

      // 4. Creer le canvas
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;

      if (needsSwap) {
        canvas.width = height;
        canvas.height = width;
      } else {
        canvas.width = width;
        canvas.height = height;
      }

      // 5. Appliquer la rotation EXIF et dessiner
      ctx.save();
      applyOrientation(ctx, orientation, canvas.width, canvas.height);
      if (needsSwap) {
        ctx.drawImage(img, 0, 0, height, width);
      } else {
        ctx.drawImage(img, 0, 0, width, height);
      }
      ctx.restore();

      // 6. Convertir en blob avec compression progressive
      let quality = opts.quality;
      const maxSizeBytes = mbToBytes(opts.maxSizeMB);

      const tryCompress = (): Promise<Blob> =>
        new Promise((res, rej) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                rej(new Error("Echec de la compression de l'image"));
                return;
              }
              res(blob);
            },
            outputType,
            quality,
          );
        });

      let blob = await tryCompress();

      // 7. Si toujours trop lourd, reduire la qualite progressivement
      while (blob.size > maxSizeBytes && quality > 0.3) {
        quality -= 0.1;
        blob = await tryCompress();
      }

      // 8. Si toujours trop lourd apres qualite min, reduire les dimensions
      if (blob.size > maxSizeBytes) {
        const scale = Math.sqrt(maxSizeBytes / blob.size) * 0.9;
        const newW = Math.round(canvas.width * scale);
        const newH = Math.round(canvas.height * scale);

        const smallCanvas = document.createElement("canvas");
        smallCanvas.width = newW;
        smallCanvas.height = newH;
        const smallCtx = smallCanvas.getContext("2d")!;
        smallCtx.drawImage(canvas, 0, 0, newW, newH);

        blob = await new Promise<Blob>((res, rej) => {
          smallCanvas.toBlob(
            (b) => {
              if (!b) {
                rej(new Error("Echec du redimensionnement"));
                return;
              }
              res(b);
            },
            outputType,
            0.7,
          );
        });
      }

      // 9. Creer le fichier final
      const ext = outputType === "image/png" ? "png" : outputType === "image/webp" ? "webp" : "jpg";
      const name = file.name.replace(/\.[^.]+$/, "");
      const compressedFile = new File([blob], `${name}_optimized.${ext}`, {
        type: outputType,
        lastModified: Date.now(),
      });

      resolve(compressedFile);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de charger l'image"));
    };

    img.src = url;
  });
}

export function useImageCompression() {
  const isCompressing = useRef(false);

  const compress = useCallback(
    async (file: File, options?: CompressionOptions): Promise<File> => {
      // Si ce n'est pas une image, retourner tel quel
      if (!file.type.startsWith("image/")) {
        return file;
      }

      // Si l'image fait moins de 500KB et est deja en JPEG/WEBP, ne pas compresser
      if (file.size < 500 * 1024 && (file.type === "image/jpeg" || file.type === "image/webp")) {
        return file;
      }

      isCompressing.current = true;
      try {
        const opts = { ...DEFAULTS, ...options };
        const compressed = await compressFile(file, opts);
        return compressed;
      } finally {
        isCompressing.current = false;
      }
    },
    [],
  );

  const compressMultiple = useCallback(
    async (files: File[], options?: CompressionOptions): Promise<File[]> => {
      const results: File[] = [];
      for (const file of files) {
        try {
          const compressed = await compress(file, options);
          results.push(compressed);
        } catch (err) {
          console.warn("[useImageCompression] Echec compression, fichier original conserve:", file.name, err);
          results.push(file);
        }
      }
      return results;
    },
    [compress],
  );

  return {
    compress,
    compressMultiple,
    get isCompressing() {
      return isCompressing.current;
    },
  };
}
