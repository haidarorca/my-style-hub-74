// ═══════════════════════════════════════════════════════════════
// Templates visuels marketing : Poster (feed), Story (vertical),
// Square, Thumb WhatsApp. Rendus offscreen puis capturés via
// html2canvas → PNG téléchargeable.
// ═══════════════════════════════════════════════════════════════

import { forwardRef } from "react";

export interface PosterData {
  productName: string;
  imageUrl?: string | null;
  priceLabel: string;
  oldPriceLabel?: string | null;
  promoLabel?: string | null;
  shopName?: string | null;
  url: string;
  qrDataUrl?: string | null;
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

export const PosterTemplate = forwardRef<HTMLDivElement, Props>(function PosterTemplate(
  { format, data },
  ref,
) {
  const { w, h } = DIM[format];
  const isVertical = h > w;
  const isThumb = format === "thumb";

  return (
    <div
      ref={ref}
      style={{
        width: w,
        height: h,
        position: "relative",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        color: "#0a0a0a",
        background:
          "linear-gradient(160deg, #fff7ed 0%, #ffe4d1 40%, #fed7aa 100%)",
      }}
    >
      {/* Ornements */}
      <div
        style={{
          position: "absolute",
          top: -160,
          right: -160,
          width: 520,
          height: 520,
          borderRadius: "50%",
          background: "radial-gradient(closest-side, rgba(234,88,12,0.28), transparent 70%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -220,
          left: -180,
          width: 620,
          height: 620,
          borderRadius: "50%",
          background: "radial-gradient(closest-side, rgba(2,132,199,0.18), transparent 70%)",
        }}
      />

      {/* Header logo */}
      <div
        style={{
          position: "absolute",
          top: isThumb ? 20 : 44,
          left: isThumb ? 24 : 56,
          right: isThumb ? 24 : 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 3,
        }}
      >
        <div
          style={{
            fontWeight: 900,
            fontSize: isThumb ? 26 : 44,
            letterSpacing: -1,
            color: "#111",
          }}
        >
          <span style={{ color: "#ea580c" }}>K</span>awZone
        </div>
        {data.promoLabel && !isThumb && (
          <div
            style={{
              background: "#dc2626",
              color: "#fff",
              padding: "10px 20px",
              borderRadius: 999,
              fontWeight: 900,
              fontSize: 32,
              boxShadow: "0 8px 24px rgba(220,38,38,0.35)",
            }}
          >
            {data.promoLabel}
          </div>
        )}
      </div>

      {/* Image produit */}
      <div
        style={{
          position: "absolute",
          top: isThumb ? 70 : isVertical ? 160 : 140,
          left: "50%",
          transform: "translateX(-50%)",
          width: isThumb ? 460 : isVertical ? 900 : 780,
          height: isThumb ? 360 : isVertical ? 900 : 780,
          borderRadius: 32,
          overflow: "hidden",
          background: "#fff",
          boxShadow: "0 30px 80px rgba(0,0,0,0.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2,
        }}
      >
        {data.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.imageUrl}
            alt=""
            crossOrigin="anonymous"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ fontSize: 120, color: "#ddd" }}>📦</div>
        )}
      </div>

      {/* Bloc bas — nom, prix, CTA */}
      <div
        style={{
          position: "absolute",
          bottom: isThumb ? 20 : 60,
          left: isThumb ? 24 : 56,
          right: isThumb ? 24 : 56,
          zIndex: 3,
        }}
      >
        <div
          style={{
            fontSize: isThumb ? 22 : isVertical ? 56 : 48,
            fontWeight: 800,
            lineHeight: 1.1,
            color: "#111",
            marginBottom: isThumb ? 8 : 20,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {data.productName}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: isThumb ? 8 : 16, flexWrap: "wrap" }}>
          <div
            style={{
              fontSize: isThumb ? 36 : isVertical ? 96 : 80,
              fontWeight: 900,
              color: "#ea580c",
              letterSpacing: -2,
              lineHeight: 1,
            }}
          >
            {data.priceLabel}
          </div>
          {data.oldPriceLabel && (
            <div
              style={{
                fontSize: isThumb ? 18 : 36,
                color: "#666",
                textDecoration: "line-through",
                fontWeight: 600,
              }}
            >
              {data.oldPriceLabel}
            </div>
          )}
        </div>

        {!isThumb && (
          <div
            style={{
              marginTop: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 20,
            }}
          >
            <div
              style={{
                background: "#111",
                color: "#fff",
                padding: "22px 36px",
                borderRadius: 999,
                fontWeight: 800,
                fontSize: isVertical ? 34 : 30,
                boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
              }}
            >
              Acheter maintenant →
            </div>
            {data.qrDataUrl && (
              <div
                style={{
                  background: "#fff",
                  padding: 12,
                  borderRadius: 16,
                  boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
                }}
              >
                <img src={data.qrDataUrl} alt="" style={{ width: 130, height: 130, display: "block" }} />
              </div>
            )}
          </div>
        )}

        {!isThumb && (
          <div
            style={{
              marginTop: 20,
              fontSize: isVertical ? 24 : 22,
              color: "#555",
              fontWeight: 600,
            }}
          >
            {data.shopName ? `${data.shopName} · ` : ""}kawzone.com
          </div>
        )}
      </div>
    </div>
  );
});

export const POSTER_DIMS = DIM;
