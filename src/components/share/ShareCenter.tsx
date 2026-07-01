// ═══════════════════════════════════════════════════════════════
// ShareCenter — véritable Centre de partage marketing KawZone.
// 3 onglets : Envoyer · Visuels · QR & Lien.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Copy, Check, Share2, Download, MessageCircle, Facebook, Send, Mail,
  Twitter, Smartphone, Instagram,
} from "lucide-react";

import {
  productUrl, buildTrackedUrl, shareLinkFor, type SharePlatform,
} from "@/lib/share/links";
import { buildShareMessage, type ShareProduct } from "@/lib/share/messages";
import { PosterTemplate, POSTER_DIMS, type PosterFormat } from "./PosterTemplate";
import { QrBlock } from "./QrBlock";
import { nodeToBlob, downloadBlob, safeFilename } from "@/lib/share/download";

export interface ShareCenterProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  product: {
    id: string;
    name: string;
    imageUrl?: string | null;
    priceLabel: string;
    oldPriceLabel?: string | null;
    promoLabel?: string | null;
    shopName?: string | null;
  };
}

const PLATFORMS: { key: SharePlatform; label: string; icon: any; color: string }[] = [
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, color: "bg-emerald-500 hover:bg-emerald-600" },
  { key: "instagram", label: "Instagram", icon: Instagram, color: "bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 hover:opacity-90" },
  { key: "facebook", label: "Facebook", icon: Facebook, color: "bg-blue-600 hover:bg-blue-700" },
  { key: "messenger", label: "Messenger", icon: Send, color: "bg-sky-500 hover:bg-sky-600" },
  { key: "telegram", label: "Telegram", icon: Send, color: "bg-cyan-500 hover:bg-cyan-600" },
  { key: "twitter", label: "X", icon: Twitter, color: "bg-neutral-900 hover:bg-black" },
  { key: "sms", label: "SMS", icon: Smartphone, color: "bg-violet-500 hover:bg-violet-600" },
  { key: "email", label: "Email", icon: Mail, color: "bg-rose-500 hover:bg-rose-600" },
];

const FORMATS: { key: PosterFormat; label: string; hint: string }[] = [
  { key: "poster", label: "Affiche", hint: "1080×1350 — Feed" },
  { key: "story", label: "Story", hint: "1080×1920 — Vertical" },
  { key: "square", label: "Carré", hint: "1080×1080 — IG" },
  { key: "thumb", label: "Miniature", hint: "600×600 — WhatsApp" },
];

export function ShareCenter({ open, onOpenChange, product }: ShareCenterProps) {
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<PosterFormat>("poster");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const posterRef = useRef<HTMLDivElement | null>(null);
  const storyRef = useRef<HTMLDivElement | null>(null);

  const baseUrl = useMemo(() => productUrl(product.id), [product.id]);
  const nativeAvailable = typeof navigator !== "undefined" && "share" in navigator;

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(baseUrl, {
      width: 260, margin: 1, errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [open, baseUrl]);

  const shareProduct = (platform: SharePlatform): ShareProduct => ({
    name: product.name,
    priceLabel: product.priceLabel,
    oldPriceLabel: product.oldPriceLabel ?? null,
    promoLabel: product.promoLabel ?? null,
    shopName: product.shopName ?? null,
    url: buildTrackedUrl(baseUrl, platform),
  });

  const handleShare = (platform: SharePlatform) => {
    const sp = shareProduct(platform);
    const msg = buildShareMessage(sp, platform);
    const url = shareLinkFor(platform, sp.url, msg);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCopy = async () => {
    const sp = shareProduct("copy");
    const msg = buildShareMessage(sp, "copy");
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Message copié");
    } catch {
      toast.error("Impossible de copier");
    }
  };

  const handleNativeShare = async () => {
    const sp = shareProduct("native");
    const msg = buildShareMessage(sp, "native");
    try {
      await (navigator as any).share({
        title: product.name,
        text: msg,
        url: sp.url,
      });
    } catch {
      /* dismissed */
    }
  };

  const handleDownloadVisual = async () => {
    if (!posterRef.current) return;
    setBusy(true);
    try {
      const blob = await nodeToBlob(posterRef.current, 1);
      downloadBlob(blob, `${safeFilename(product.name)}-${format}.png`);
      toast.success("Visuel téléchargé");
    } catch (e: any) {
      toast.error(e?.message || "Génération impossible");
    } finally {
      setBusy(false);
    }
  };

  const dims = POSTER_DIMS[format];
  // scale d'aperçu (largeur max 340px sur mobile)
  const previewScale = Math.min(340 / dims.w, 420 / dims.h);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="p-0 h-[92vh] rounded-t-3xl overflow-hidden flex flex-col">
        <SheetHeader className="px-4 py-3 border-b bg-gradient-to-r from-orange-50 to-amber-50">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Share2 className="h-5 w-5 text-orange-600" />
            Centre de partage
          </SheetTitle>
          <p className="text-[11px] text-muted-foreground line-clamp-1 text-left">
            {product.name} · {product.priceLabel}
          </p>
        </SheetHeader>

        <Tabs defaultValue="send" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-3 mx-3 mt-3">
            <TabsTrigger value="send">Envoyer</TabsTrigger>
            <TabsTrigger value="visuals">Visuels</TabsTrigger>
            <TabsTrigger value="qr">QR & Lien</TabsTrigger>
          </TabsList>

          {/* ─── ENVOYER ─── */}
          <TabsContent value="send" className="flex-1 overflow-y-auto p-4 space-y-4 mt-0">
            {nativeAvailable && (
              <Button onClick={handleNativeShare} className="w-full h-12 text-base font-semibold" size="lg">
                <Share2 className="mr-2 h-5 w-5" />
                Partager via mon téléphone
              </Button>
            )}

            <div className="grid grid-cols-4 gap-3">
              {PLATFORMS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => handleShare(p.key)}
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white transition-transform group-active:scale-95 ${p.color}`}>
                    <p.icon className="h-6 w-6" />
                  </div>
                  <span className="text-[10px] font-medium text-center leading-tight">{p.label}</span>
                </button>
              ))}
              <button onClick={handleCopy} className="flex flex-col items-center gap-1.5 group">
                <div className="w-14 h-14 rounded-2xl bg-neutral-200 hover:bg-neutral-300 flex items-center justify-center transition-transform group-active:scale-95">
                  {copied ? <Check className="h-6 w-6 text-emerald-600" /> : <Copy className="h-6 w-6 text-neutral-700" />}
                </div>
                <span className="text-[10px] font-medium">Copier</span>
              </button>
            </div>

            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-[11px] uppercase tracking-wide font-bold text-muted-foreground mb-1">Aperçu du message</p>
              <p className="text-xs whitespace-pre-line leading-relaxed">
                {buildShareMessage(shareProduct("whatsapp"), "whatsapp")}
              </p>
            </div>

            <div className="text-[11px] text-muted-foreground text-center">
              💡 Chaque partage est tracé pour mesurer les ventes générées.
            </div>
          </TabsContent>

          {/* ─── VISUELS ─── */}
          <TabsContent value="visuals" className="flex-1 overflow-y-auto p-4 space-y-4 mt-0">
            <div className="grid grid-cols-4 gap-2">
              {FORMATS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFormat(f.key)}
                  className={`p-2 rounded-xl border-2 text-center transition-colors ${
                    format === f.key
                      ? "border-orange-500 bg-orange-50"
                      : "border-neutral-200 bg-white hover:bg-neutral-50"
                  }`}
                >
                  <div className="text-[11px] font-bold">{f.label}</div>
                  <div className="text-[9px] text-muted-foreground leading-tight mt-0.5">{f.hint}</div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-center bg-neutral-100 rounded-2xl p-4 min-h-[380px]">
              <div
                style={{
                  width: dims.w * previewScale,
                  height: dims.h * previewScale,
                  boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
                  borderRadius: 16,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    transform: `scale(${previewScale})`,
                    transformOrigin: "top left",
                    width: dims.w,
                    height: dims.h,
                  }}
                >
                  <PosterTemplate
                    format={format}
                    data={{
                      productName: product.name,
                      imageUrl: product.imageUrl ?? null,
                      priceLabel: product.priceLabel,
                      oldPriceLabel: product.oldPriceLabel ?? null,
                      promoLabel: product.promoLabel ?? null,
                      shopName: product.shopName ?? null,
                      url: baseUrl,
                      qrDataUrl,
                    }}
                  />
                </div>
              </div>
            </div>

            <Button onClick={handleDownloadVisual} disabled={busy} className="w-full h-12 text-base font-semibold">
              <Download className="mr-2 h-5 w-5" />
              {busy ? "Génération…" : `Télécharger le visuel ${dims.w}×${dims.h}`}
            </Button>

            <p className="text-[11px] text-muted-foreground text-center px-4">
              Astuce : la Story se prête parfaitement à WhatsApp Status et Instagram/Facebook Stories.
            </p>

            {/* Node offscreen pour capture haute-résolution */}
            <div style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }} aria-hidden>
              <PosterTemplate
                ref={posterRef}
                format={format}
                data={{
                  productName: product.name,
                  imageUrl: product.imageUrl ?? null,
                  priceLabel: product.priceLabel,
                  oldPriceLabel: product.oldPriceLabel ?? null,
                  promoLabel: product.promoLabel ?? null,
                  shopName: product.shopName ?? null,
                  url: baseUrl,
                  qrDataUrl,
                }}
              />
            </div>
          </TabsContent>

          {/* ─── QR & LIEN ─── */}
          <TabsContent value="qr" className="flex-1 overflow-y-auto p-4 mt-0">
            <QrBlock url={baseUrl} filenameBase={product.name} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
