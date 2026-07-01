// ═══════════════════════════════════════════════════════════════
// ShareCenter — Centre de partage marketing KawZone (v2).
// 3 onglets : Envoyer · Visuels · QR & Lien.
// Nouveautés v2 :
//  • 4 thèmes visuels distincts (Alibaba, Discount, Spotlight, Editorial)
//  • Badge Import / Produit local
//  • Aperçu message pré-plateforme
//  • Format auto-recommandé par réseau (Story pour IG, Carré pour WA…)
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
  Twitter, Smartphone, Instagram, Sparkles,
} from "lucide-react";

import {
  productUrl, buildTrackedUrl, shareLinkFor, type SharePlatform,
} from "@/lib/share/links";
import { buildShareMessage, type ShareProduct } from "@/lib/share/messages";
import { PosterTemplate, POSTER_DIMS, type PosterFormat, type PosterTheme } from "./PosterTemplate";
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
    discountPct?: number | null;
    shopName?: string | null;
    originType?: "local" | "import" | null;
    originLabel?: string | null;
  };
}

const PLATFORMS: {
  key: SharePlatform;
  label: string;
  icon: any;
  color: string;
  recommendedFormat?: PosterFormat;
}[] = [
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, color: "bg-emerald-500 hover:bg-emerald-600", recommendedFormat: "square" },
  { key: "instagram", label: "Instagram", icon: Instagram, color: "bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600", recommendedFormat: "story" },
  { key: "facebook", label: "Facebook", icon: Facebook, color: "bg-blue-600 hover:bg-blue-700", recommendedFormat: "poster" },
  { key: "messenger", label: "Messenger", icon: Send, color: "bg-sky-500 hover:bg-sky-600", recommendedFormat: "square" },
  { key: "telegram", label: "Telegram", icon: Send, color: "bg-cyan-500 hover:bg-cyan-600", recommendedFormat: "poster" },
  { key: "twitter", label: "X", icon: Twitter, color: "bg-neutral-900 hover:bg-black", recommendedFormat: "poster" },
  { key: "sms", label: "SMS", icon: Smartphone, color: "bg-violet-500 hover:bg-violet-600" },
  { key: "email", label: "Email", icon: Mail, color: "bg-rose-500 hover:bg-rose-600", recommendedFormat: "poster" },
];

const FORMATS: { key: PosterFormat; label: string; hint: string; icon: string }[] = [
  { key: "poster", label: "Affiche", hint: "1080×1350", icon: "▭" },
  { key: "story", label: "Story", hint: "1080×1920", icon: "▯" },
  { key: "square", label: "Carré", hint: "1080×1080", icon: "◻" },
  { key: "thumb", label: "Mini", hint: "600×600", icon: "▫" },
];

const THEMES: { key: PosterTheme; label: string; desc: string; gradient: string }[] = [
  { key: "alibaba", label: "Marketplace", desc: "Style Alibaba — prix jaune, CTA orange", gradient: "from-amber-400 via-orange-500 to-pink-500" },
  { key: "discount", label: "Promo Choc", desc: "Fond image plein cadre, -% énorme", gradient: "from-red-600 via-orange-600 to-yellow-500" },
  { key: "spotlight", label: "Coup de cœur", desc: "Produit détouré, ambiance pastel", gradient: "from-amber-200 via-orange-300 to-pink-300" },
  { key: "editorial", label: "Éditorial", desc: "Minimal magazine noir & blanc", gradient: "from-neutral-200 via-neutral-100 to-white" },
];

export function ShareCenter({ open, onOpenChange, product }: ShareCenterProps) {
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<PosterFormat>("poster");
  const [themeKey, setThemeKey] = useState<PosterTheme>("alibaba");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewPlatform, setPreviewPlatform] = useState<SharePlatform>("whatsapp");
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
    originType: product.originType ?? null,
    originLabel: product.originLabel ?? null,
    url: buildTrackedUrl(baseUrl, platform),
  });

  const handleShare = async (platform: SharePlatform) => {
    if (platform === "instagram") return handleInstagramShare();
    const sp = shareProduct(platform);
    const msg = buildShareMessage(sp, platform);
    const url = shareLinkFor(platform, sp.url, msg);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleInstagramShare = async () => {
    setBusy(true);
    try {
      const sp = shareProduct("instagram");
      const msg = buildShareMessage(sp, "instagram");
      try { await navigator.clipboard.writeText(msg); } catch { /* ignore */ }
      if (storyRef.current) {
        const blob = await nodeToBlob(storyRef.current, 1);
        downloadBlob(blob, `${safeFilename(product.name)}-instagram-story.png`);
      }
      toast.success("Visuel téléchargé + légende copiée", {
        description: "Ouverture d'Instagram… collez la légende sur votre Story ou publication.",
        duration: 4500,
      });
      setTimeout(() => {
        window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
      }, 400);
    } catch (e: any) {
      toast.error(e?.message || "Instagram : action impossible");
    } finally {
      setBusy(false);
    }
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
      await (navigator as any).share({ title: product.name, text: msg, url: sp.url });
    } catch { /* dismissed */ }
  };

  const handleDownloadVisual = async () => {
    if (!posterRef.current) return;
    setBusy(true);
    try {
      const blob = await nodeToBlob(posterRef.current, 1);
      downloadBlob(blob, `${safeFilename(product.name)}-${themeKey}-${format}.png`);
      toast.success("Visuel téléchargé");
    } catch (e: any) {
      toast.error(e?.message || "Génération impossible");
    } finally {
      setBusy(false);
    }
  };

  const dims = POSTER_DIMS[format];
  const previewScale = Math.min(320 / dims.w, 460 / dims.h);

  const posterData = {
    productName: product.name,
    imageUrl: product.imageUrl ?? null,
    priceLabel: product.priceLabel,
    oldPriceLabel: product.oldPriceLabel ?? null,
    promoLabel: product.promoLabel ?? null,
    discountPct: product.discountPct ?? null,
    shopName: product.shopName ?? null,
    originType: product.originType ?? null,
    originLabel: product.originLabel ?? null,
    url: baseUrl,
    qrDataUrl,
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="p-0 h-[94vh] rounded-t-3xl overflow-hidden flex flex-col">
        <SheetHeader className="px-4 py-3 border-b bg-gradient-to-r from-orange-50 via-amber-50 to-rose-50">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-orange-600" />
            Centre de partage marketing
          </SheetTitle>
          <div className="flex items-center gap-2 text-left">
            {product.imageUrl && (
              <img src={product.imageUrl} alt="" className="h-9 w-9 rounded-md object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold line-clamp-1">{product.name}</p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <span className="font-bold text-orange-700">{product.priceLabel}</span>
                {product.oldPriceLabel && <span className="line-through opacity-60">{product.oldPriceLabel}</span>}
                {product.originType && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-white ${product.originType === "import" ? "bg-blue-600" : "bg-emerald-600"}`}>
                    {product.originType === "import" ? "IMPORT" : "LOCAL"}
                  </span>
                )}
              </p>
            </div>
          </div>
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
              <Button onClick={handleNativeShare} className="w-full h-12 text-base font-semibold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600" size="lg">
                <Share2 className="mr-2 h-5 w-5" />
                Partager depuis mon téléphone
              </Button>
            )}

            <div className="grid grid-cols-4 gap-3">
              {PLATFORMS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => { setPreviewPlatform(p.key); handleShare(p.key); }}
                  onMouseEnter={() => setPreviewPlatform(p.key)}
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white transition-transform group-active:scale-95 shadow-sm ${p.color}`}>
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

            <div className="rounded-xl border bg-gradient-to-br from-neutral-50 to-white p-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] uppercase tracking-wide font-bold text-muted-foreground">
                  Aperçu — {PLATFORMS.find((p) => p.key === previewPlatform)?.label ?? previewPlatform}
                </p>
                {PLATFORMS.find((p) => p.key === previewPlatform)?.recommendedFormat && (
                  <button
                    onClick={() => {
                      const rf = PLATFORMS.find((p) => p.key === previewPlatform)?.recommendedFormat;
                      if (rf) setFormat(rf);
                    }}
                    className="text-[10px] text-orange-600 font-semibold hover:underline"
                  >
                    → Visuel recommandé
                  </button>
                )}
              </div>
              <p className="text-xs whitespace-pre-line leading-relaxed text-neutral-800 max-h-40 overflow-y-auto">
                {buildShareMessage(shareProduct(previewPlatform), previewPlatform)}
              </p>
            </div>

            <div className="text-[11px] text-muted-foreground text-center">
              💡 Chaque lien est tracé pour mesurer vos ventes issues du partage.
            </div>
          </TabsContent>

          {/* ─── VISUELS ─── */}
          <TabsContent value="visuals" className="flex-1 overflow-y-auto p-4 space-y-4 mt-0">
            {/* Thèmes */}
            <div>
              <p className="text-[11px] uppercase tracking-wide font-bold text-muted-foreground mb-2">
                Style de l'affiche
              </p>
              <div className="grid grid-cols-2 gap-2">
                {THEMES.map((t) => {
                  const active = themeKey === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setThemeKey(t.key)}
                      className={`text-left rounded-xl border-2 p-2.5 transition-all ${
                        active ? "border-orange-500 ring-2 ring-orange-200" : "border-neutral-200 hover:border-neutral-300"
                      }`}
                    >
                      <div className={`h-8 w-full rounded-md bg-gradient-to-r ${t.gradient} mb-1.5`} />
                      <div className="text-[12px] font-bold text-neutral-900">{t.label}</div>
                      <div className="text-[10px] text-muted-foreground leading-tight">{t.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Formats */}
            <div>
              <p className="text-[11px] uppercase tracking-wide font-bold text-muted-foreground mb-2">
                Format
              </p>
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
                    <div className="text-lg leading-none">{f.icon}</div>
                    <div className="text-[11px] font-bold mt-1">{f.label}</div>
                    <div className="text-[9px] text-muted-foreground leading-tight">{f.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Aperçu */}
            <div className="flex items-center justify-center bg-gradient-to-br from-neutral-100 to-neutral-200 rounded-2xl p-4 min-h-[400px]">
              <div
                style={{
                  width: dims.w * previewScale,
                  height: dims.h * previewScale,
                  boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
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
                  <PosterTemplate format={format} theme={themeKey} data={posterData} />
                </div>
              </div>
            </div>

            <Button
              onClick={handleDownloadVisual}
              disabled={busy}
              className="w-full h-12 text-base font-semibold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
            >
              <Download className="mr-2 h-5 w-5" />
              {busy ? "Génération…" : `Télécharger ${dims.w}×${dims.h}`}
            </Button>

            <p className="text-[11px] text-muted-foreground text-center px-4">
              Astuce : le format <b>Story</b> passe partout — WhatsApp Status, Instagram, Facebook, TikTok.
            </p>
          </TabsContent>

          {/* ─── QR & LIEN ─── */}
          <TabsContent value="qr" className="flex-1 overflow-y-auto p-4 mt-0">
            <QrBlock url={baseUrl} filenameBase={product.name} />
          </TabsContent>
        </Tabs>

        {/* Nodes offscreen persistants pour capture haute-résolution */}
        <div style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }} aria-hidden>
          <PosterTemplate ref={posterRef} format={format} theme={themeKey} data={posterData} />
          <PosterTemplate ref={storyRef} format="story" theme={themeKey} data={posterData} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
