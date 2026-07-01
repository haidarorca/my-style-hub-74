// ═══════════════════════════════════════════════════════════════
// Templates visuels marketing style "Alibaba card" :
// - Badges promo (pills rouge/orange à puces) en haut à gauche
// - Grande image produit centrée
// - Bandeau jaune "prix" + bandeau orange "bonus / promo"
// - Bloc titre noir bas + attribution KawZone
// ═══════════════════════════════════════════════════════════════

import { forwardRef } from "react";

export interface PosterData {
  productName: string;
  imageUrl?: string | null;
  priceLabel: string;
  oldPriceLabel?: string | null;
  promoLabel?: string | null;   // ex: "-30%", "-30 USD"
  shopName?: string | null;
  url: string;
  qrDataUrl?: string | null;
  /** Puces avantages affichées en haut (max 3). Défauts si vide. */
  badges?: string[];
  /** Sous-titre du bandeau orange (ex: "Profitez de -30% en plus via ce lien"). */
  promoSubtitle?: string | null;
}

export type PosterFormat = "poster" | "story" | "square" | "thumb";

const DIM: Record<PosterFormat, { w: number; h: number }> = {
  poster: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
  thumb: { w: 600, h: 600 },
};

interface Props {
  format: PosterFormat;
  data: PosterData;
}

const DEFAULT_BADGES = ["Produit vérifié", "Livraison KawZone", "Paiement sécurisé"];

export const PosterTemplate = forwardRef<HTMLDivElement, Props>(function PosterTemplate(
  { format, data },
  ref,
) {
  const { w, h } = DIM[format];
  const isThumb = format === "thumb";
  const isStory = format === "story";

  // Échelle globale : toutes les dimensions internes sont en "unités" (base 1080)
  // puis multipliées par s. Le layout reste identique sur tous les formats.
  const s = w / 1080;

  const badges = (data.badges && data.badges.length > 0 ? data.badges : DEFAULT_BADGES).slice(0, 3);

  // Cadre principal (marges internes)
  const pad = 48 * s;
  const cardR = 40 * s;

  // Zone image (carrée pour poster/square/thumb, rectangulaire pour story)
  const imgH = isStory ? 1180 * s : 780 * s;

  // Bloc prix jaune
  const priceBarH = isThumb ? 120 * s : 170 * s;

  return (
    <div
      ref={ref}
      style={{
        width: w,
        height: h,
        position: "relative",
        overflow: "hidden",
        fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
        color: "#0a0a0a",
        background: "#f5f5f5",
      }}
    >
      {/* Header KawZone */}
      <div
        style={{
          position: "absolute",
          top: pad * 0.6,
          left: pad,
          right: pad,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 5,
        }}
      >
        <div
          style={{
            fontWeight: 900,
            fontSize: (isThumb ? 32 : 48) * s,
            letterSpacing: -1.5 * s,
            color: "#111",
          }}
        >
          <span style={{ color: "#ea580c" }}>K</span>awZone
        </div>
        <div
          style={{
            fontSize: 22 * s,
            color: "#666",
            fontWeight: 600,
          }}
        >
          kawzone.com
        </div>
      </div>

      {/* Carte principale */}
      <div
        style={{
          position: "absolute",
          top: 130 * s,
          left: pad,
          right: pad,
          bottom: pad,
          background: "#ffffff",
          borderRadius: cardR,
          overflow: "hidden",
          boxShadow: `0 ${30 * s}px ${80 * s}px rgba(0,0,0,0.15)`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Zone image + badges overlay */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: imgH,
            background: "#fafafa",
            flexShrink: 0,
          }}
        >
          {/* Badges avantages (top-left) */}
          <div
            style={{
              position: "absolute",
              top: 32 * s,
              left: 32 * s,
              display: "flex",
              flexDirection: "column",
              gap: 14 * s,
              zIndex: 4,
              maxWidth: "70%",
            }}
          >
            {badges.map((b, i) => (
              <div
                key={i}
                style={{
                  background: "linear-gradient(90deg, #ef4444 0%, #f97316 100%)",
                  color: "#fff",
                  padding: `${14 * s}px ${22 * s}px ${14 * s}px ${18 * s}px`,
                  borderRadius: 999,
                  fontWeight: 800,
                  fontSize: 30 * s,
                  display: "flex",
                  alignItems: "center",
                  gap: 12 * s,
                  boxShadow: `0 ${6 * s}px ${16 * s}px rgba(220,38,38,0.35)`,
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    width: 20 * s,
                    height: 20 * s,
                    borderRadius: "50%",
                    border: `${3 * s}px solid #fff`,
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                {b}
              </div>
            ))}
          </div>

          {/* Image produit */}
          {data.imageUrl ? (
            <img
              src={data.imageUrl}
              alt=""
              crossOrigin="anonymous"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 200 * s,
                color: "#ddd",
              }}
            >
              📦
            </div>
          )}
        </div>

        {/* Bandeau prix (jaune) + promo (orange dégradé) */}
        <div
          style={{
            display: "flex",
            width: "100%",
            height: priceBarH,
            flexShrink: 0,
          }}
        >
          {/* Prix jaune */}
          <div
            style={{
              background: "#fbbf24",
              flex: "0 0 42%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: `0 ${24 * s}px`,
            }}
          >
            <div
              style={{
                fontSize: (isThumb ? 44 : 78) * s,
                fontWeight: 900,
                color: "#111",
                letterSpacing: -2 * s,
                lineHeight: 1,
              }}
            >
              {data.priceLabel}
            </div>
          </div>
          {/* Promo orange */}
          <div
            style={{
              background: "linear-gradient(90deg, #f97316 0%, #ec4899 100%)",
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: `0 ${28 * s}px`,
              textAlign: "center",
              color: "#fff",
            }}
          >
            {data.oldPriceLabel && (
              <div
                style={{
                  fontSize: 24 * s,
                  textDecoration: "line-through",
                  opacity: 0.85,
                  fontWeight: 600,
                  lineHeight: 1,
                  marginBottom: 6 * s,
                }}
              >
                {data.oldPriceLabel}
              </div>
            )}
            <div
              style={{
                fontSize: (isThumb ? 22 : 30) * s,
                fontWeight: 800,
                lineHeight: 1.15,
              }}
            >
              {data.promoSubtitle || (data.promoLabel
                ? `Profitez de ${data.promoLabel} en plus via ce lien`
                : "Meilleur prix garanti via ce lien")}
            </div>
          </div>
        </div>

        {/* Bloc titre (noir) */}
        <div
          style={{
            background: "#0f172a",
            color: "#fff",
            flex: 1,
            padding: `${28 * s}px ${36 * s}px`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 16 * s,
          }}
        >
          <div
            style={{
              fontSize: (isThumb ? 22 : 38) * s,
              fontWeight: 800,
              lineHeight: 1.2,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {data.productName}
          </div>

          {!isThumb && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 20 * s,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 4 * s, minWidth: 0 }}>
                <div style={{ fontSize: 22 * s, color: "#94a3b8", fontWeight: 600 }}>
                  {data.shopName ? `en provenance de ${data.shopName}` : "Boutique vérifiée KawZone"}
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 12 * s,
                    background: "#ea580c",
                    color: "#fff",
                    padding: `${16 * s}px ${28 * s}px`,
                    borderRadius: 999,
                    fontWeight: 900,
                    fontSize: 28 * s,
                    marginTop: 10 * s,
                    alignSelf: "flex-start",
                    boxShadow: `0 ${8 * s}px ${20 * s}px rgba(234,88,12,0.4)`,
                  }}
                >
                  Acheter maintenant →
                </div>
              </div>

              {data.qrDataUrl && (
                <div
                  style={{
                    background: "#fff",
                    padding: 10 * s,
                    borderRadius: 14 * s,
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={data.qrDataUrl}
                    alt=""
                    style={{
                      width: (isStory ? 160 : 130) * s,
                      height: (isStory ? 160 : 130) * s,
                      display: "block",
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export const POSTER_DIMS = DIM;
