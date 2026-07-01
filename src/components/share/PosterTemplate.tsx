// ═══════════════════════════════════════════════════════════════
// Templates visuels marketing KawZone — inspirés Alibaba / 1688 /
// AliExpress / Temu. 4 thèmes distincts, 4 formats (poster/story/
// square/thumb). Toutes les dimensions internes sont exprimées en
// "unités base 1080" puis multipliées par s = w/1080 pour rester
// pixel-perfect quel que soit le format.
// ═══════════════════════════════════════════════════════════════

import { forwardRef } from "react";

export type PosterFormat = "poster" | "story" | "square" | "thumb";
export type PosterTheme = "alibaba" | "discount" | "spotlight" | "editorial";

export interface PosterData {
  productName: string;
  imageUrl?: string | null;
  priceLabel: string;
  oldPriceLabel?: string | null;
  promoLabel?: string | null;       // ex "-30%", "-3 000 FCFA"
  discountPct?: number | null;      // ex 30 → affichage "-30%"
  shopName?: string | null;
  url: string;
  qrDataUrl?: string | null;
  /** "local" (produit local) ou "import" (produit importé). */
  originType?: "local" | "import" | null;
  /** Ex. "🇨🇳 Chine" ou "🇸🇳 Sénégal". */
  originLabel?: string | null;
  /** Avantages affichés (max 3). Défauts si vide. */
  badges?: string[];
}

interface Props {
  format: PosterFormat;
  theme?: PosterTheme;
  data: PosterData;
}

const DIM: Record<PosterFormat, { w: number; h: number }> = {
  poster: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
  thumb: { w: 600, h: 600 },
};

const DEFAULT_BADGES = ["Produit vérifié", "Paiement sécurisé", "Livraison KawZone"];

const FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";

export const PosterTemplate = forwardRef<HTMLDivElement, Props>(function PosterTemplate(
  { format, theme = "alibaba", data },
  ref,
) {
  const { w, h } = DIM[format];
  return (
    <div ref={ref} style={{ width: w, height: h, position: "relative", overflow: "hidden", fontFamily: FONT }}>
      {theme === "alibaba" && <AlibabaTheme w={w} h={h} format={format} data={data} />}
      {theme === "discount" && <DiscountTheme w={w} h={h} format={format} data={data} />}
      {theme === "spotlight" && <SpotlightTheme w={w} h={h} format={format} data={data} />}
      {theme === "editorial" && <EditorialTheme w={w} h={h} format={format} data={data} />}
    </div>
  );
});

export const POSTER_DIMS = DIM;

// ────────────────────────────────────────────────────────────
// Petits building blocks partagés
// ────────────────────────────────────────────────────────────

function KawzoneWordmark({ s, color = "#111" }: { s: number; color?: string }) {
  return (
    <div style={{ fontWeight: 900, fontSize: 44 * s, letterSpacing: -1.5 * s, color, lineHeight: 1 }}>
      <span style={{ color: "#ea580c" }}>K</span>awZone
    </div>
  );
}

function OriginPill({ s, originType, originLabel }: { s: number; originType?: string | null; originLabel?: string | null }) {
  if (!originType) return null;
  const isImport = originType === "import";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8 * s,
        padding: `${10 * s}px ${18 * s}px`,
        borderRadius: 999,
        fontWeight: 800,
        fontSize: 22 * s,
        color: "#fff",
        background: isImport
          ? "linear-gradient(90deg,#2563eb,#7c3aed)"
          : "linear-gradient(90deg,#059669,#10b981)",
        boxShadow: `0 ${6 * s}px ${16 * s}px rgba(0,0,0,0.2)`,
      }}
    >
      <span>{isImport ? "🌐" : "🇸🇳"}</span>
      {originLabel || (isImport ? "Import" : "Produit local")}
    </div>
  );
}

function DiscountBadge({ s, pct, big }: { s: number; pct: number; big?: boolean }) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg,#dc2626,#f97316)",
        color: "#fff",
        borderRadius: "50%",
        width: (big ? 220 : 150) * s,
        height: (big ? 220 : 150) * s,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `0 ${10 * s}px ${30 * s}px rgba(220,38,38,0.5)`,
        transform: "rotate(-8deg)",
        border: `${6 * s}px solid #fff`,
      }}
    >
      <div style={{ fontSize: (big ? 24 : 18) * s, fontWeight: 700, opacity: 0.9, letterSpacing: 2 * s }}>
        PROMO
      </div>
      <div style={{ fontSize: (big ? 88 : 62) * s, fontWeight: 900, lineHeight: 1, letterSpacing: -2 * s }}>
        -{pct}%
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// THEME 1 — Alibaba style : image + bandeau prix jaune + CTA orange
// ────────────────────────────────────────────────────────────

function AlibabaTheme({ w, h, format, data }: { w: number; h: number; format: PosterFormat; data: PosterData }) {
  const s = w / 1080;
  const isThumb = format === "thumb";
  const isStory = format === "story";
  const pad = 48 * s;
  const cardR = 40 * s;
  const imgH = isStory ? 1180 * s : 780 * s;
  const priceBarH = isThumb ? 120 * s : 170 * s;
  const badges = (data.badges?.length ? data.badges : DEFAULT_BADGES).slice(0, 3);
  const pct = computePct(data);

  return (
    <div style={{ width: w, height: h, background: "#f5f5f5", position: "relative" }}>
      {/* Header */}
      <div style={{ position: "absolute", top: pad * 0.6, left: pad, right: pad, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 5 }}>
        <KawzoneWordmark s={s} />
        <div style={{ fontSize: 22 * s, color: "#666", fontWeight: 600 }}>kawzone.com</div>
      </div>

      <div style={{ position: "absolute", top: 130 * s, left: pad, right: pad, bottom: pad, background: "#fff", borderRadius: cardR, overflow: "hidden", boxShadow: `0 ${30 * s}px ${80 * s}px rgba(0,0,0,0.15)`, display: "flex", flexDirection: "column" }}>
        {/* Image + overlays */}
        <div style={{ position: "relative", width: "100%", height: imgH, background: "#fafafa", flexShrink: 0 }}>
          {/* Origin pill top-right */}
          {data.originType && (
            <div style={{ position: "absolute", top: 28 * s, right: 28 * s, zIndex: 5 }}>
              <OriginPill s={s} originType={data.originType} originLabel={data.originLabel} />
            </div>
          )}
          {/* Discount badge top-left */}
          {pct && !isThumb && (
            <div style={{ position: "absolute", top: 40 * s, left: 40 * s, zIndex: 4 }}>
              <DiscountBadge s={s} pct={pct} />
            </div>
          )}
          {/* Advantage pills bottom-left */}
          {!isThumb && (
            <div style={{ position: "absolute", bottom: 24 * s, left: 24 * s, display: "flex", flexDirection: "column", gap: 10 * s, zIndex: 4, maxWidth: "75%" }}>
              {badges.map((b, i) => (
                <div key={i} style={{ background: "rgba(15,23,42,0.85)", color: "#fff", padding: `${10 * s}px ${18 * s}px`, borderRadius: 999, fontWeight: 700, fontSize: 22 * s, display: "flex", alignItems: "center", gap: 10 * s, backdropFilter: "blur(4px)", whiteSpace: "nowrap" }}>
                  <span style={{ width: 14 * s, height: 14 * s, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                  {b}
                </div>
              ))}
            </div>
          )}
          {data.imageUrl ? (
            <img src={data.imageUrl} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : (
            <PlaceholderImg s={s} />
          )}
        </div>

        {/* Bandeau prix jaune + promo */}
        <div style={{ display: "flex", width: "100%", height: priceBarH, flexShrink: 0 }}>
          <div style={{ background: "#fbbf24", flex: "0 0 45%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: `0 ${24 * s}px` }}>
            {data.oldPriceLabel && !isThumb && (
              <div style={{ fontSize: 24 * s, color: "#78350f", textDecoration: "line-through", fontWeight: 600, marginBottom: 4 * s }}>
                {data.oldPriceLabel}
              </div>
            )}
            <div style={{ fontSize: (isThumb ? 44 : 78) * s, fontWeight: 900, color: "#111", letterSpacing: -2 * s, lineHeight: 1 }}>
              {data.priceLabel}
            </div>
          </div>
          <div style={{ background: "linear-gradient(90deg,#f97316,#ec4899)", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: `0 ${28 * s}px`, textAlign: "center", color: "#fff" }}>
            <div style={{ fontSize: (isThumb ? 14 : 20) * s, fontWeight: 700, letterSpacing: 3 * s, opacity: 0.95, marginBottom: 8 * s }}>
              {pct ? `ÉCONOMISEZ ${pct}%` : "OFFRE LIMITÉE"}
            </div>
            <div style={{ fontSize: (isThumb ? 22 : 34) * s, fontWeight: 900, lineHeight: 1.1 }}>
              Acheter maintenant →
            </div>
          </div>
        </div>

        {/* Bloc titre noir */}
        <div style={{ background: "#0f172a", color: "#fff", flex: 1, padding: `${28 * s}px ${36 * s}px`, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 16 * s }}>
          <div style={{ fontSize: (isThumb ? 22 : 38) * s, fontWeight: 800, lineHeight: 1.2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {data.productName}
          </div>
          {!isThumb && (
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20 * s }}>
              <div style={{ fontSize: 22 * s, color: "#94a3b8", fontWeight: 600, minWidth: 0 }}>
                {data.shopName ? `Vendu par ${data.shopName}` : "Boutique vérifiée KawZone"}
              </div>
              {data.qrDataUrl && (
                <div style={{ background: "#fff", padding: 10 * s, borderRadius: 14 * s, flexShrink: 0 }}>
                  <img src={data.qrDataUrl} alt="" style={{ width: (isStory ? 160 : 130) * s, height: (isStory ? 160 : 130) * s, display: "block" }} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// THEME 2 — Discount blast : gros % rouge sur image plein cadre
// ────────────────────────────────────────────────────────────

function DiscountTheme({ w, h, format, data }: { w: number; h: number; format: PosterFormat; data: PosterData }) {
  const s = w / 1080;
  const isThumb = format === "thumb";
  const isStory = format === "story";
  const pct = computePct(data) ?? null;

  return (
    <div style={{ width: w, height: h, position: "relative", background: "#0a0a0a" }}>
      {/* Image plein cadre */}
      {data.imageUrl ? (
        <img src={data.imageUrl} alt="" crossOrigin="anonymous" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,#1f2937,#111)" }} />
      )}
      {/* Voile dégradé bas */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.85) 100%)" }} />

      {/* Header */}
      <div style={{ position: "absolute", top: 40 * s, left: 40 * s, right: 40 * s, display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 5 }}>
        <div style={{ background: "#fff", padding: `${10 * s}px ${20 * s}px`, borderRadius: 999 }}>
          <KawzoneWordmark s={s * 0.85} />
        </div>
        {data.originType && <OriginPill s={s} originType={data.originType} originLabel={data.originLabel} />}
      </div>

      {/* Gros pastille discount */}
      {pct && !isThumb && (
        <div style={{ position: "absolute", top: isStory ? 260 * s : 200 * s, right: 60 * s, zIndex: 6 }}>
          <DiscountBadge s={s} pct={pct} big />
        </div>
      )}

      {/* Bloc bas */}
      <div style={{ position: "absolute", left: 40 * s, right: 40 * s, bottom: 40 * s, color: "#fff", zIndex: 5 }}>
        <div style={{ fontSize: (isThumb ? 24 : 44) * s, fontWeight: 900, lineHeight: 1.15, marginBottom: 20 * s, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}>
          {data.productName}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 20 * s, marginBottom: 24 * s, flexWrap: "wrap" }}>
          <div>
            {data.oldPriceLabel && (
              <div style={{ fontSize: 26 * s, color: "#cbd5e1", textDecoration: "line-through", fontWeight: 600, lineHeight: 1 }}>
                {data.oldPriceLabel}
              </div>
            )}
            <div style={{ fontSize: (isThumb ? 52 : 96) * s, fontWeight: 900, color: "#fbbf24", letterSpacing: -3 * s, lineHeight: 1, marginTop: 4 * s }}>
              {data.priceLabel}
            </div>
          </div>
        </div>
        {!isThumb && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 * s }}>
            <div style={{ background: "linear-gradient(90deg,#ea580c,#dc2626)", padding: `${22 * s}px ${40 * s}px`, borderRadius: 999, fontWeight: 900, fontSize: 30 * s, color: "#fff", boxShadow: `0 ${10 * s}px ${24 * s}px rgba(220,38,38,0.5)` }}>
              Acheter maintenant →
            </div>
            {data.qrDataUrl && (
              <div style={{ background: "#fff", padding: 10 * s, borderRadius: 14 * s }}>
                <img src={data.qrDataUrl} alt="" style={{ width: 130 * s, height: 130 * s, display: "block" }} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// THEME 3 — Spotlight : fond dégradé coloré, produit détouré
// ────────────────────────────────────────────────────────────

function SpotlightTheme({ w, h, format, data }: { w: number; h: number; format: PosterFormat; data: PosterData }) {
  const s = w / 1080;
  const isThumb = format === "thumb";
  const isStory = format === "story";
  const pct = computePct(data);

  return (
    <div style={{ width: w, height: h, position: "relative", background: "linear-gradient(135deg,#fef3c7 0%,#fed7aa 45%,#fbb6ce 100%)", overflow: "hidden" }}>
      {/* Cercles décoratifs */}
      <div style={{ position: "absolute", top: -100 * s, right: -100 * s, width: 500 * s, height: 500 * s, borderRadius: "50%", background: "rgba(255,255,255,0.35)", filter: `blur(${40 * s}px)` }} />
      <div style={{ position: "absolute", bottom: -150 * s, left: -100 * s, width: 400 * s, height: 400 * s, borderRadius: "50%", background: "rgba(234,88,12,0.25)", filter: `blur(${60 * s}px)` }} />

      {/* Header */}
      <div style={{ position: "absolute", top: 40 * s, left: 40 * s, right: 40 * s, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 5 }}>
        <KawzoneWordmark s={s} />
        {data.originType && <OriginPill s={s} originType={data.originType} originLabel={data.originLabel} />}
      </div>

      {/* Image circulaire au centre */}
      <div style={{ position: "absolute", top: (isStory ? 250 : 180) * s, left: "50%", transform: "translateX(-50%)", width: (isStory ? 800 : 720) * s, height: (isStory ? 800 : 720) * s, borderRadius: "50%", overflow: "hidden", boxShadow: `0 ${30 * s}px ${80 * s}px rgba(0,0,0,0.25)`, background: "#fff", border: `${12 * s}px solid #fff` }}>
        {data.imageUrl ? (
          <img src={data.imageUrl} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <PlaceholderImg s={s} />
        )}
      </div>

      {/* Pastille discount */}
      {pct && !isThumb && (
        <div style={{ position: "absolute", top: (isStory ? 220 : 150) * s, right: 60 * s, zIndex: 6 }}>
          <DiscountBadge s={s} pct={pct} />
        </div>
      )}

      {/* Bloc bas */}
      <div style={{ position: "absolute", left: 40 * s, right: 40 * s, bottom: 40 * s, zIndex: 5, textAlign: "center" }}>
        <div style={{ fontSize: (isThumb ? 24 : 42) * s, fontWeight: 900, color: "#111", lineHeight: 1.15, marginBottom: 16 * s, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {data.productName}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 * s, marginBottom: 24 * s }}>
          {data.oldPriceLabel && (
            <div style={{ fontSize: 32 * s, color: "#78350f", textDecoration: "line-through", fontWeight: 600 }}>
              {data.oldPriceLabel}
            </div>
          )}
          <div style={{ fontSize: (isThumb ? 48 : 88) * s, fontWeight: 900, color: "#ea580c", letterSpacing: -3 * s, lineHeight: 1 }}>
            {data.priceLabel}
          </div>
        </div>
        {!isThumb && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20 * s }}>
            <div style={{ background: "#0f172a", color: "#fff", padding: `${22 * s}px ${44 * s}px`, borderRadius: 999, fontWeight: 900, fontSize: 30 * s, boxShadow: `0 ${10 * s}px ${24 * s}px rgba(15,23,42,0.35)` }}>
              Acheter sur KawZone →
            </div>
            {data.qrDataUrl && (
              <div style={{ background: "#fff", padding: 10 * s, borderRadius: 14 * s }}>
                <img src={data.qrDataUrl} alt="" style={{ width: 130 * s, height: 130 * s, display: "block" }} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// THEME 4 — Editorial : minimal magazine, blanc & noir
// ────────────────────────────────────────────────────────────

function EditorialTheme({ w, h, format, data }: { w: number; h: number; format: PosterFormat; data: PosterData }) {
  const s = w / 1080;
  const isThumb = format === "thumb";
  const isStory = format === "story";
  const imgH = isStory ? 1400 * s : (format === "square" ? 700 * s : 900 * s);
  const pct = computePct(data);

  return (
    <div style={{ width: w, height: h, background: "#fafaf9", position: "relative" }}>
      {/* Header rail */}
      <div style={{ position: "absolute", top: 40 * s, left: 48 * s, right: 48 * s, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 5 }}>
        <KawzoneWordmark s={s} />
        <div style={{ fontSize: 20 * s, fontWeight: 700, color: "#111", letterSpacing: 4 * s, textTransform: "uppercase" }}>
          Édition Marketplace
        </div>
      </div>

      {/* Grand visuel */}
      <div style={{ position: "absolute", top: 130 * s, left: 48 * s, right: 48 * s, height: imgH, background: "#e7e5e4", overflow: "hidden" }}>
        {data.imageUrl ? (
          <img src={data.imageUrl} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <PlaceholderImg s={s} />
        )}
        {/* Ruban origin */}
        {data.originType && (
          <div style={{ position: "absolute", top: 24 * s, left: 24 * s }}>
            <OriginPill s={s} originType={data.originType} originLabel={data.originLabel} />
          </div>
        )}
        {/* Pastille pct */}
        {pct && !isThumb && (
          <div style={{ position: "absolute", top: 24 * s, right: 24 * s, background: "#111", color: "#fbbf24", padding: `${16 * s}px ${28 * s}px`, borderRadius: 4 * s, fontWeight: 900, fontSize: 40 * s, letterSpacing: -1 * s }}>
            -{pct}%
          </div>
        )}
      </div>

      {/* Ligne fine */}
      <div style={{ position: "absolute", top: (130 + (imgH / s) + 30) * s, left: 48 * s, right: 48 * s, height: 2 * s, background: "#111" }} />

      {/* Bloc info */}
      <div style={{ position: "absolute", left: 48 * s, right: 48 * s, bottom: 48 * s, display: "flex", flexDirection: "column", gap: 20 * s }}>
        <div style={{ fontSize: (isThumb ? 22 : 44) * s, fontWeight: 900, lineHeight: 1.15, color: "#111", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {data.productName}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20 * s }}>
          <div>
            {data.oldPriceLabel && (
              <div style={{ fontSize: 24 * s, color: "#78716c", textDecoration: "line-through", fontWeight: 600 }}>
                {data.oldPriceLabel}
              </div>
            )}
            <div style={{ fontSize: (isThumb ? 44 : 78) * s, fontWeight: 900, color: "#111", letterSpacing: -2 * s, lineHeight: 1, marginTop: 4 * s }}>
              {data.priceLabel}
            </div>
            <div style={{ fontSize: 20 * s, color: "#57534e", marginTop: 12 * s, fontWeight: 600 }}>
              {data.shopName ? `Par ${data.shopName}` : "Boutique KawZone vérifiée"}
            </div>
          </div>
          {!isThumb && (
            <div style={{ display: "flex", alignItems: "center", gap: 20 * s }}>
              {data.qrDataUrl && (
                <div style={{ background: "#fff", padding: 10 * s, borderRadius: 8 * s, border: `${2 * s}px solid #111` }}>
                  <img src={data.qrDataUrl} alt="" style={{ width: 130 * s, height: 130 * s, display: "block" }} />
                </div>
              )}
              <div style={{ background: "#111", color: "#fff", padding: `${20 * s}px ${36 * s}px`, fontWeight: 900, fontSize: 26 * s, letterSpacing: 2 * s, textTransform: "uppercase" }}>
                Acheter →
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function PlaceholderImg({ s }: { s: number }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 200 * s, color: "#ddd", background: "#fafafa" }}>
      📦
    </div>
  );
}

function computePct(data: PosterData): number | null {
  if (data.discountPct && data.discountPct > 0) return Math.round(data.discountPct);
  if (data.promoLabel) {
    const m = data.promoLabel.match(/-?(\d{1,2})\s*%/);
    if (m) return Math.round(Number(m[1]));
  }
  return null;
}
