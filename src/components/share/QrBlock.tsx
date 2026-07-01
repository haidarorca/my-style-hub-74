// ═══════════════════════════════════════════════════════════════
// Bloc QR Code : génération + téléchargement PNG/SVG.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Download, Copy, Check } from "lucide-react";
import { downloadBlob, safeFilename } from "@/lib/share/download";
import { toast } from "sonner";

interface Props {
  url: string;
  filenameBase: string;
}

export function QrBlock({ url, filenameBase }: Props) {
  const [png, setPng] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#ffffff" },
    })
      .then((d) => !cancelled && setPng(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [url]);

  const downloadPng = async () => {
    if (!png) return;
    const res = await fetch(png);
    const blob = await res.blob();
    downloadBlob(blob, `${safeFilename(filenameBase)}-qr.png`);
    toast.success("QR Code téléchargé");
  };

  const downloadSvg = async () => {
    try {
      const svg = await QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
      downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${safeFilename(filenameBase)}-qr.svg`);
      toast.success("QR Code SVG téléchargé");
    } catch {
      toast.error("Échec du téléchargement SVG");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Lien copié");
    } catch {
      toast.error("Impossible de copier le lien");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100">
        {png ? (
          <img src={png} alt="QR Code produit" className="w-56 h-56 rounded-xl bg-white p-2 shadow-sm" />
        ) : (
          <div className="w-56 h-56 rounded-xl bg-white animate-pulse" />
        )}
        <p className="text-xs text-center text-muted-foreground max-w-xs">
          Imprime ce QR Code sur ta boutique, tes flyers ou tes cartes de visite pour renvoyer directement vers la fiche produit.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={downloadPng} disabled={!png} variant="default" className="w-full">
          <Download className="mr-2 h-4 w-4" /> PNG
        </Button>
        <Button onClick={downloadSvg} variant="outline" className="w-full">
          <Download className="mr-2 h-4 w-4" /> SVG
        </Button>
      </div>

      <div className="rounded-xl border bg-muted/40 p-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Lien du produit</p>
        <div className="flex items-center gap-2">
          <p className="flex-1 text-xs font-mono truncate">{url}</p>
          <Button size="sm" variant="ghost" onClick={copyLink}>
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
