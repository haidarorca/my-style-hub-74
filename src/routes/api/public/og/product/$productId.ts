// ═══════════════════════════════════════════════════════════════
// Image d'aperçu social générée dynamiquement (1200×630 PNG).
// Utilisée comme og:image / twitter:image par WhatsApp, Facebook,
// Telegram, LinkedIn, X… Ces crawlers n'exécutent pas de JavaScript :
// l'image DOIT être produite côté serveur.
//
// Pipeline : Satori (JSX-like → SVG) puis resvg-wasm (SVG → PNG).
// Ces deux bibliothèques sont compatibles runtime edge/Worker
// (sharp / canvas / puppeteer y sont impossibles).
//
// En cas d'échec, on redirige vers la photo produit brute : jamais
// d'aperçu vide.
// ═══════════════════════════════════════════════════════════════

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { buildOgTemplate, OG_WIDTH, OG_HEIGHT } from "@/lib/share/og-template";

const FONT_REGULAR =
  "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-400-normal.woff";
const FONT_BOLD =
  "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-700-normal.woff";

let fontCache: Array<{ name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }> | null =
  null;
let wasmReady: Promise<void> | null = null;

async function loadFonts() {
  if (fontCache) return fontCache;
  const [regular, bold] = await Promise.all([
    fetch(FONT_REGULAR).then((r) => r.arrayBuffer()),
    fetch(FONT_BOLD).then((r) => r.arrayBuffer()),
  ]);
  fontCache = [
    { name: "Inter", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Inter", data: bold, weight: 700 as const, style: "normal" as const },
  ];
  return fontCache;
}

function formatXof(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")} FCFA`;
}

export const Route = createFileRoute("/api/public/og/product/$productId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !supabaseKey) {
          return new Response("Not configured", { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey, {
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input, init) => {
              const headers = new Headers(init?.headers);
              if (
                supabaseKey.startsWith("sb_") &&
                headers.get("Authorization") === `Bearer ${supabaseKey}`
              ) {
                headers.delete("Authorization");
              }
              headers.set("apikey", supabaseKey);
              return fetch(input, { ...init, headers });
            },
          },
        });

        const { data } = await supabase
          .from("products")
          .select("id, name, price, product_images(url, position, media_type)")
          .order("position", { referencedTable: "product_images", ascending: true })
          .eq("id", params.productId)
          .eq("status", "approved")
          .maybeSingle();

        const row = data as
          | {
              name?: string;
              price?: number | null;
              product_images?: Array<{ url: string; media_type?: string | null }>;
            }
          | null;

        const image =
          row?.product_images?.find((m) => (m.media_type ?? "image") === "image")?.url ?? null;

        if (!row) {
          return new Response("Not found", { status: 404 });
        }

        const price = row.price ?? null;
        const old: number | null = null;
        const discount: number | null = null;

        try {
          const [{ default: satori }, resvg, fonts] = await Promise.all([
            import("satori"),
            import("@resvg/resvg-wasm"),
            loadFonts(),
          ]);

          if (!wasmReady) {
            wasmReady = (async () => {
              const wasmResponse = await fetch(
                "https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm",
              );
              await resvg.initWasm(await wasmResponse.arrayBuffer());
            })();
          }
          await wasmReady;

          const svg = await satori(
            buildOgTemplate({
              name: row.name ?? "Produit",
              priceLabel: price != null ? formatXof(price) : "Prix sur demande",
              oldPriceLabel: old != null && discount ? formatXof(old) : null,
              discountPct: discount,
              imageUrl: image,
            }) as never,
            { width: OG_WIDTH, height: OG_HEIGHT, fonts },
          );

          const renderer = new resvg.Resvg(svg, {
            fitTo: { mode: "width", value: 800 },
            background: "#233857",
          });
          const png = renderer.render().asPng();

          return new Response(png as unknown as BodyInit, {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "public, max-age=86400, s-maxage=604800",
            },
          });
        } catch (err) {
          console.error("[og] generation failed", err);
          if (image) return Response.redirect(image, 302);
          return new Response("Preview unavailable", { status: 500 });
        }
      },
    },
  },
});
