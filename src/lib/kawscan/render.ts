import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import { barcodeFormatFor } from "./codes";

export async function qrDataUrl(value: string, size = 512): Promise<string> {
  return QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: "M" });
}

export function barcodeDataUrl(code: string, opts?: { displayValue?: boolean }): string {
  const canvas = document.createElement("canvas");
  const format = barcodeFormatFor(code);
  try {
    JsBarcode(canvas, code, {
      format,
      displayValue: opts?.displayValue ?? true,
      fontSize: 16,
      height: 70,
      margin: 4,
    });
  } catch {
    // Repli universel si le code ne respecte pas le format détecté.
    JsBarcode(canvas, code, { format: "CODE128", displayValue: true, height: 70, margin: 4 });
  }
  return canvas.toDataURL("image/png");
}
