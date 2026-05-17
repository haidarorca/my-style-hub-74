// Client-side helper: crop + downscale + re-encode product images to remove
// marketplace UI (price banners, buttons, logos) BEFORE we upload them as
// product photos / variant photos.
//
// Designed for mobile safety:
//  - sequential queue (call site), not Promise.all
//  - per-call timeout
//  - tiny in-memory cache keyed by (size, lastModified, name) + cropHint
//  - falls back to the original File if anything goes wrong

export type CropHint = {
  // Percentages of the source image (0–100). Optional.
  x?: number;
  y?: number;
  w?: number;
  h?: number;
};

const cache = new Map<string, File>();

function keyFor(file: File, hint?: CropHint): string {
  const h = hint ? `${hint.x ?? 0}|${hint.y ?? 0}|${hint.w ?? 100}|${hint.h ?? 100}` : "raw";
  return `${file.name}|${file.size}|${file.lastModified}|${h}`;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

async function decode(file: File): Promise<{ w: number; h: number; bitmap: ImageBitmap | HTMLImageElement; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      return { w: bmp.width, h: bmp.height, bitmap: bmp, close: () => bmp.close?.() };
    } catch {
      /* fall through to HTMLImageElement */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = url;
    });
    return {
      w: img.naturalWidth,
      h: img.naturalHeight,
      bitmap: img,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("image-clean: timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      },
    );
  });
}

/**
 * Clean a product image: crop (Gemini hint or heuristic), downscale to
 * `maxSide`, re-encode JPEG. Returns a new File (or the original on failure).
 */
export async function cleanProductImage(
  file: File,
  options?: { cropHint?: CropHint; maxSide?: number; quality?: number; timeoutMs?: number },
): Promise<File> {
  const maxSide = options?.maxSide ?? 1400;
  const quality = options?.quality ?? 0.82;
  const timeoutMs = options?.timeoutMs ?? 8000;
  const hint = options?.cropHint;

  const k = keyFor(file, hint);
  const cached = cache.get(k);
  if (cached) return cached;

  try {
    const result = await withTimeout(
      (async () => {
        const { w: sw, h: sh, bitmap, close } = await decode(file);
        try {
          // Resolve crop region (Gemini hint > heuristic bottom-strip > full).
          let cx = 0;
          let cy = 0;
          let cw = sw;
          let ch = sh;
          if (hint && (hint.w ?? 0) > 0 && (hint.h ?? 0) > 0) {
            cx = Math.round((clamp(hint.x ?? 0, 0, 100) / 100) * sw);
            cy = Math.round((clamp(hint.y ?? 0, 0, 100) / 100) * sh);
            cw = Math.round((clamp(hint.w ?? 100, 1, 100) / 100) * sw);
            ch = Math.round((clamp(hint.h ?? 100, 1, 100) / 100) * sh);
            cw = Math.min(cw, sw - cx);
            ch = Math.min(ch, sh - cy);
          } else {
            // Heuristic: if bottom 12% strip is much darker (≈ Taobao price bar),
            // drop it. Cheap luminance sample on a tiny scratch canvas.
            try {
              const probe = document.createElement("canvas");
              probe.width = 32;
              probe.height = 32;
              const pctx = probe.getContext("2d");
              if (pctx) {
                pctx.drawImage(bitmap as CanvasImageSource, 0, 0, 32, 32);
                const top = pctx.getImageData(0, 4, 32, 8).data;
                const bot = pctx.getImageData(0, 24, 32, 8).data;
                const avg = (d: Uint8ClampedArray) => {
                  let s = 0;
                  for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
                  return s / ((d.length / 4) * 3);
                };
                if (avg(top) - avg(bot) > 70) {
                  ch = Math.round(sh * 0.88);
                }
              }
            } catch {
              /* probe failed → keep full frame */
            }
          }

          // Downscale crop to maxSide.
          const ratio = Math.min(1, maxSide / Math.max(cw, ch));
          const dw = Math.max(1, Math.round(cw * ratio));
          const dh = Math.max(1, Math.round(ch * ratio));
          const canvas = document.createElement("canvas");
          canvas.width = dw;
          canvas.height = dh;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("ctx");
          ctx.drawImage(bitmap as CanvasImageSource, cx, cy, cw, ch, 0, 0, dw, dh);

          const blob: Blob | null = await new Promise((resolve) =>
            canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
          );
          if (!blob) throw new Error("encode");
          const cleanedName = file.name.replace(/\.(png|webp|gif|jpe?g)$/i, "") + "-clean.jpg";
          return new File([blob], cleanedName, { type: "image/jpeg", lastModified: Date.now() });
        } finally {
          close();
        }
      })(),
      timeoutMs,
    );
    if (cache.size > 60) cache.clear();
    cache.set(k, result);
    return result;
  } catch {
    // Last resort: return original so the flow never breaks.
    return file;
  }
}

export function clearCleanImageCache() {
  cache.clear();
}
