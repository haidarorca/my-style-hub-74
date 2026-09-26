// ═══════════════════════════════════════════════════════════════
// Template de l'image d'aperçu social (1200×630) au format Satori.
// Aucun JSX : Satori accepte directement des objets {type, props}.
// Module isomorphe et sans dépendance — testable et réutilisable.
// ═══════════════════════════════════════════════════════════════

export interface OgProductData {
  name: string;
  priceLabel: string;
  oldPriceLabel?: string | null;
  discountPct?: number | null;
  shopName?: string | null;
  imageUrl?: string | null;
  originLabel?: string | null;
}

type El = { type: string; props: Record<string, unknown> };

const el = (type: string, props: Record<string, unknown>): El => ({ type, props });

const BRAND = "#233857";
const ACCENT = "#d58c48";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export function buildOgTemplate(p: OgProductData): El {
  const children: El[] = [];

  // Colonne image
  children.push(
    el("div", {
      style: {
        display: "flex",
        width: "520px",
        height: "630px",
        backgroundColor: "#ffffff",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      },
      children: p.imageUrl
        ? el("img", {
            src: p.imageUrl,
            width: 520,
            height: 630,
             style: { objectFit: "contain" },
          })
        : el("div", {
            style: {
              display: "flex",
              width: "520px",
              height: "630px",
              backgroundColor: "#e5e7eb",
            },
          }),
    }),
  );

  // Colonne texte
  const textChildren: El[] = [];

  textChildren.push(
    el("div", {
      style: { display: "flex", alignItems: "center", gap: "12px" },
      children: [
        el("div", {
          style: {
            display: "flex",
            fontSize: "28px",
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: "2px",
          },
          children: "KAWZONE",
        }),
        el("div", {
          style: {
            display: "flex",
            fontSize: "16px",
            color: "rgba(255,255,255,0.7)",
          },
          children: "kawzone.com",
        }),
      ],
    }),
  );

  if (p.discountPct && p.discountPct > 0) {
    textChildren.push(
      el("div", {
        style: {
          display: "flex",
          marginTop: "18px",
          backgroundColor: "#dc2626",
          color: "#ffffff",
          fontSize: "30px",
          fontWeight: 700,
          padding: "6px 20px",
           borderRadius: "6px",
        },
        children: `-${Math.round(p.discountPct)}%`,
      }),
    );
  }

  textChildren.push(
    el("div", {
      style: {
        display: "flex",
        marginTop: "22px",
        fontSize: p.name.length > 55 ? "44px" : "56px",
        fontWeight: 700,
        color: "#ffffff",
        lineHeight: 1.1,
        maxHeight: "200px",
        overflow: "hidden",
      },
      children: p.name.slice(0, 90),
    }),
  );

  const priceRow: El[] = [
    el("div", {
      style: { display: "flex", fontSize: "62px", fontWeight: 700, color: ACCENT },
      children: p.priceLabel,
    }),
  ];
  if (p.oldPriceLabel) {
    priceRow.push(
      el("div", {
        style: {
          display: "flex",
          fontSize: "30px",
          color: "rgba(255,255,255,0.55)",
          textDecoration: "line-through",
          marginLeft: "16px",
        },
        children: p.oldPriceLabel,
      }),
    );
  }
  textChildren.push(
    el("div", {
      style: { display: "flex", alignItems: "flex-end", marginTop: "26px" },
      children: priceRow,
    }),
  );

  const meta = [p.shopName, p.originLabel].filter(Boolean).join(" · ");
  if (meta) {
    textChildren.push(
      el("div", {
        style: {
          display: "flex",
          marginTop: "14px",
          fontSize: "24px",
          color: "rgba(255,255,255,0.75)",
        },
        children: meta,
      }),
    );
  }

  textChildren.push(
    el("div", {
      style: {
        display: "flex",
        marginTop: "auto",
        backgroundColor: ACCENT,
        color: "#1c1917",
        fontSize: "28px",
        fontWeight: 700,
        padding: "14px 34px",
        borderRadius: "16px",
      },
       children: "Voir sur KawZone →",
    }),
  );

  children.push(
    el("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        width: "680px",
        height: "630px",
        padding: "48px",
      },
      children: textChildren,
    }),
  );

  return el("div", {
    style: {
      display: "flex",
      width: "1200px",
      height: "630px",
      backgroundColor: BRAND,
      fontFamily: "Inter",
    },
    children,
  });
}
