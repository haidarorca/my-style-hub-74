import { readTextFromCanvas } from "./ocr";

export type NormalizedSelection = { x: number; y: number; width: number; height: number };
export type ZoneAnalysis = { kind: "barcode"; value: string } | { kind: "text"; value: string } | null;

const BARCODE_FORMATS = [
  "ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "codabar", "itf", "qr_code", "data_matrix",
];

/** Recadre la capture pleine résolution sans agrandir artificiellement ses pixels. */
export function cropSelection(source: HTMLCanvasElement, selection: NormalizedSelection): HTMLCanvasElement | null {
  const sx = Math.max(0, Math.round(selection.x * source.width));
  const sy = Math.max(0, Math.round(selection.y * source.height));
  const sw = Math.min(source.width - sx, Math.max(1, Math.round(selection.width * source.width)));
  const sh = Math.min(source.height - sy, Math.max(1, Math.round(selection.height * source.height)));
  if (sw < 2 || sh < 2) return null;
  const crop = document.createElement("canvas");
  crop.width = sw;
  crop.height = sh;
  const ctx = crop.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return crop;
}

/** Charge une photo (appareil ou galerie) dans un canvas à sa définition native. */
export async function fileToCanvas(file: File | Blob): Promise<HTMLCanvasElement | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas;
  } catch {
    return null;
  }
}

export async function detectBarcode(canvas: HTMLCanvasElement): Promise<string | null> {
  const Detector = (window as unknown as {
    BarcodeDetector?: {
      new (options: { formats: string[] }): { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
      getSupportedFormats?: () => Promise<string[]>;
    };
  }).BarcodeDetector;

  if (Detector) {
    try {
      const supported = Detector.getSupportedFormats ? await Detector.getSupportedFormats() : BARCODE_FORMATS;
      const formats = BARCODE_FORMATS.filter((format) => supported.includes(format));
      if (formats.length) {
        const results = await new Detector({ formats }).detect(canvas);
        const value = results[0]?.rawValue?.trim();
        if (value) return value;
      }
    } catch {
      // ZXing prend le relais ci-dessous.
    }
  }

  try {
    const [{ BrowserMultiFormatReader }, zxing] = await Promise.all([
      import("@zxing/browser"),
      import("@zxing/library"),
    ]);
    const hints = new Map<number, unknown>();
    hints.set(zxing.DecodeHintType.TRY_HARDER, true);
    hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, [
      zxing.BarcodeFormat.EAN_13, zxing.BarcodeFormat.EAN_8, zxing.BarcodeFormat.UPC_A,
      zxing.BarcodeFormat.UPC_E, zxing.BarcodeFormat.CODE_128, zxing.BarcodeFormat.CODE_39,
      zxing.BarcodeFormat.CODE_93, zxing.BarcodeFormat.CODABAR, zxing.BarcodeFormat.ITF,
      zxing.BarcodeFormat.QR_CODE, zxing.BarcodeFormat.DATA_MATRIX,
    ]);
    return new BrowserMultiFormatReader(hints as never).decodeFromCanvas(canvas).getText().trim() || null;
  } catch {
    return null;
  }
}

/** Contraste + légère accentuation des contours, sans modifier la capture originale. */
function prepareForOcr(source: HTMLCanvasElement): HTMLCanvasElement | null {
  const scale = source.width < 1400 ? Math.min(2, 1400 / source.width) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = scale === 1;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = Math.round(pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114);
    pixels[i] = pixels[i + 1] = pixels[i + 2] = gray;
    min = Math.min(min, gray);
    max = Math.max(max, gray);
  }
  const range = Math.max(32, max - min);
  for (let i = 0; i < pixels.length; i += 4) {
    const contrasted = Math.max(0, Math.min(255, ((pixels[i] - min) * 255) / range));
    pixels[i] = pixels[i + 1] = pixels[i + 2] = contrasted;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Analyse locale ponctuelle : code-barres prioritaire, OCR uniquement en secours. */
export async function analyzeSelectedZone(source: HTMLCanvasElement, selection: NormalizedSelection): Promise<ZoneAnalysis> {
  const crop = cropSelection(source, selection);
  if (!crop) return null;
  const barcode = await detectBarcode(crop);
  if (barcode) {
    crop.width = crop.height = 0;
    return { kind: "barcode", value: barcode };
  }
  const prepared = prepareForOcr(crop);
  crop.width = crop.height = 0;
  if (!prepared) return null;
  const text = await readTextFromCanvas(prepared);
  prepared.width = prepared.height = 0;
  return text ? { kind: "text", value: text } : null;
}