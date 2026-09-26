// ═══════════════════════════════════════════════════════════════
// Lien court de partage : /s/{code}
//
// Deux publics sur la même URL :
//  • les robots des réseaux sociaux (WhatsApp, Facebook, Telegram,
//    LinkedIn, X) lisent le HTML et s'arrêtent aux balises Open Graph ;
//  • les humains sont redirigés vers la fiche produit avec les
//    paramètres d'attribution.
//
// Le clic est journalisé côté serveur (compteur + événement).
// ═══════════════════════════════════════════════════════════════

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const SITE = "https://kawzone.com";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const Route = createFileRoute("/s/$code")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !supabaseKey) {
          return Response.redirect(SITE, 302);
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

        const { data: link } = await supabase
          .from("share_links")
          .select("code, product_id, platform")
          .eq("code", params.code)
          .maybeSingle();

        if (!link) {
          return Response.redirect(SITE, 302);
        }

        const { data: product } = await supabase
          .from("products")
          .select("id, name, description, price, product_images(url, position, media_type)")
          .order("position", { referencedTable: "product_images", ascending: true })
          .eq("id", link.product_id)
          .maybeSingle();

        // Journalisation du clic — jamais bloquant.
        try {
          await supabase.rpc("register_share_click", {
            _code: params.code,
            _referer: request.headers.get("referer"),
            _user_agent: request.headers.get("user-agent"),
          } as never);
        } catch {
          /* ignore */
        }

        const name = product?.name ?? "Produit";
        const title = `${name} — KawZone`;
        const description = (
          product?.description ??
          `${name} disponible sur KawZone, votre marketplace au Sénégal.`
        ).slice(0, 200);
        const primaryImage = product?.product_images?.find(
          (media) => (media.media_type ?? "image") === "image",
        );
        const imageVersion = primaryImage?.url
          ? primaryImage.url.split("/").pop()?.split("?")[0] ?? params.code
          : params.code;
        const ogImage = `${SITE}/api/public/og/product/${link.product_id}?v=${encodeURIComponent(imageVersion)}`;
        const target = `${SITE}/product/${link.product_id}?ref=share&via=${encodeURIComponent(
          link.platform ?? "link",
        )}&sc=${encodeURIComponent(params.code)}`;

        const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${SITE}/product/${link.product_id}" />
<meta property="og:site_name" content="KawZone" />
<meta property="og:locale" content="fr_FR" />
<meta property="og:type" content="product" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${escapeHtml(target)}" />
<meta property="og:image" content="${escapeHtml(ogImage)}" />
<meta property="og:image:width" content="800" />
<meta property="og:image:height" content="420" />
${
  product?.price != null
    ? `<meta property="product:price:amount" content="${product.price}" />
<meta property="product:price:currency" content="XOF" />`
    : ""
}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(ogImage)}" />
<meta http-equiv="refresh" content="0; url=${escapeHtml(target)}" />
</head>
<body>
<p>Redirection vers <a href="${escapeHtml(target)}">${escapeHtml(name)}</a>…</p>
<script>window.location.replace(${JSON.stringify(target)});</script>
</body>
</html>`;

        return new Response(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=300",
          },
        });
      },
    },
  },
});
