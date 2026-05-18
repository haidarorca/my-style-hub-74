import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

const BASE_URL = "https://kawzone.com";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

function xmlEscape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "daily", priority: "1.0" },
          { path: "/categories", changefreq: "weekly", priority: "0.8" },
          { path: "/search", changefreq: "weekly", priority: "0.6" },
          { path: "/become-vendor", changefreq: "monthly", priority: "0.5" },
          { path: "/support", changefreq: "monthly", priority: "0.4" },
        ];

        try {
          const { data: cats } = await supabase
            .from("categories")
            .select("id, created_at")
            .limit(1000);
          for (const c of cats ?? []) {
            entries.push({
              path: `/c/${c.id}`,
              lastmod: (c as { created_at?: string }).created_at?.slice(0, 10),
              changefreq: "weekly",
              priority: "0.7",
            });
          }
        } catch {
          // ignore — keep static entries
        }

        try {
          const { data: products } = await supabase
            .from("products")
            .select("id, updated_at")
            .eq("status", "approved")
            .order("updated_at", { ascending: false })
            .limit(5000);
          for (const p of products ?? []) {
            entries.push({
              path: `/product/${p.id}`,
              lastmod: (p as { updated_at?: string }).updated_at?.slice(0, 10),
              changefreq: "weekly",
              priority: "0.6",
            });
          }
        } catch {
          // ignore
        }

        try {
          const { data: shops } = await supabase
            .from("public_vendor_profiles" as never)
            .select("id")
            .limit(2000);
          for (const s of (shops ?? []) as Array<{ id: string }>) {
            entries.push({ path: `/shop/${s.id}`, changefreq: "weekly", priority: "0.5" });
          }
        } catch {
          // ignore
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${xmlEscape(BASE_URL + e.path)}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ].filter(Boolean).join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
          },
        });
      },
    },
  },
});
