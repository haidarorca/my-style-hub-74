/**
 * admin-ai-import.functions.ts
 * ----------------------------
 * Server functions pour l'import IA Taobao/1688 dans l'espace admin.
 *
 * - listAdminShops      : Boutiques admin disponibles pour publier
 * - scrapeProductForAi  : Scrape une URL produit et renvoie un brouillon enrichi par IA
 * - publishImportedDraft: Publie un brouillon dans la table products (anti-doublons via source_url)
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ─────────────────────────────────────────────────────────────
// Types

interface AiDraftVariant {
  size: string;
  color: string;
  colorHex: string;
  stock: number;
}

export interface AiDraft {
  name: string;
  description: string;
  designation: string;
  price: number;
  sourcePrice: number;
  sourceCurrency: string;
  images: string[];
  variants: AiDraftVariant[];
  sourceUrl: string;
  categoryId: string | null;
  categoryName: string | null;
  isDuplicate: boolean;
  duplicateProductId?: string;
}

// ─────────────────────────────────────────────────────────────
// 1. Liste des boutiques admin (pour choisir où publier)

export const listAdminShops = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, shop_name, full_name, is_admin_shop")
      .or("is_admin_shop.eq.true")
      .order("shop_name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      name: r.shop_name || r.full_name || "Boutique admin",
    }));
  });

// ─────────────────────────────────────────────────────────────
// Helpers internes

async function fetchHtml(url: string): Promise<{ html: string; title: string; images: string[] }> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  // Try Firecrawl first if available
  if (firecrawlKey) {
    try {
      const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, formats: ["markdown", "html"], onlyMainContent: true, waitFor: 1500 }),
      });
      if (r.ok) {
        const j = (await r.json()) as { data?: { html?: string; markdown?: string; metadata?: { title?: string; ogImage?: string } } };
        const html = j.data?.html || j.data?.markdown || "";
        const title = j.data?.metadata?.title || "";
        const images = extractImages(html);
        if (j.data?.metadata?.ogImage) images.unshift(j.data.metadata.ogImage);
        return { html, title, images: dedupe(images).slice(0, 10) };
      }
    } catch {
      // fallthrough
    }
  }
  // Fallback: allorigins
  try {
    const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}&timeout=10000`);
    if (r.ok) {
      const html = await r.text();
      const titleMatch = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
      const title = titleMatch?.[1]?.trim() ?? "";
      return { html, title, images: dedupe(extractImages(html)).slice(0, 10) };
    }
  } catch {
    // ignore
  }
  return { html: "", title: "", images: [] };
}

function extractImages(html: string): string[] {
  const out: string[] = [];
  const re = /(?:src|data-src|data-original|data-lazy-src)=["'](https?:\/\/[^"']+\.(?:jpe?g|png|webp))[^"']*["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const u = m[1];
    // Skip tiny icons / sprites
    if (/(\b16x16\b|\b32x32\b|sprite|icon|logo)/i.test(u)) continue;
    out.push(u);
  }
  return out;
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function safeJson(raw: string): Record<string, unknown> | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const m = cleaned.match(/\{[\s\S]*\}/);
    return m ? (JSON.parse(m[0]) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// 2. Scrape produit + IA + matching catégorie existante

const ScrapeProductSchema = z.object({
  url: z.string().url(),
  shopId: z.string().uuid(),
});

export const scrapeProductForAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ScrapeProductSchema.parse(input))
  .handler(async ({ data }): Promise<AiDraft> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Assistant IA non configuré (LOVABLE_API_KEY)");

    const url = data.url;

    // Anti-doublons: vérifier si déjà importé
    const { data: existing } = await supabaseAdmin
      .from("product_admin_metadata")
      .select("product_id, products!inner(name, status, is_active)")
      .eq("source_url", url)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return {
        name: "Doublon détecté",
        description: "Ce produit a déjà été importé depuis cette URL.",
        designation: "",
        price: 0,
        sourcePrice: 0,
        sourceCurrency: url.includes("1688") || url.includes("taobao") ? "CNY" : "USD",
        images: [],
        variants: [],
        sourceUrl: url,
        categoryId: null,
        categoryName: null,
        isDuplicate: true,
        duplicateProductId: existing.product_id,
      };
    }

    // Récupération HTML
    const { title, images } = await fetchHtml(url);

    // Récupération des catégories (3 niveaux) pour mapping
    const { data: catsAll } = await supabaseAdmin
      .from("categories")
      .select("id, name, level, parent_id")
      .order("level", { ascending: true })
      .limit(500);
    const cats = catsAll ?? [];

    const tree = cats
      .filter((c) => c.level === 1)
      .slice(0, 30)
      .map((l1) => {
        const l2s = cats.filter((c) => c.level === 2 && c.parent_id === l1.id).slice(0, 10);
        const l2Str = l2s
          .map((l2) => {
            const l3s = cats.filter((c) => c.level === 3 && c.parent_id === l2.id).slice(0, 10);
            return `  - ${l2.name}${l3s.length ? ` > [${l3s.map((l3) => l3.name).join(", ")}]` : ""}`;
          })
          .join("\n");
        return `* ${l1.name}\n${l2Str}`;
      })
      .join("\n");

    const prompt = [
      "Tu es un assistant qui analyse un produit e-commerce chinois (Taobao/1688) pour un marché ouest-africain.",
      "Génère une fiche produit en FRANÇAIS, claire et marketing.",
      "Réponds UNIQUEMENT en JSON strict (pas de markdown, pas de texte autour):",
      '{"name":"...","designation":"... (max 80 car)","description":"... (max 600 car)","price_suggested_fcfa":<int>,"category_path":"Rayon > Catégorie > Sous-catégorie","variants":[{"size":"","color":"","color_hex":"#rrggbb"}]}',
      "",
      "IMPORTANT pour category_path:",
      "- Tu DOIS choisir UNIQUEMENT parmi l'arborescence existante ci-dessous.",
      "- Format strict: 'Rayon > Catégorie > Sous-catégorie' (3 niveaux si dispo, sinon 1 ou 2).",
      "- Si aucune catégorie ne correspond, mets category_path à null.",
      "",
      "Arborescence existante:",
      tree || "(aucune catégorie en base)",
      "",
      `URL produit: ${url}`,
      title ? `Titre extrait: ${title}` : "",
      images.length ? `${images.length} images extraites.` : "Aucune image extraite.",
    ]
      .filter(Boolean)
      .join("\n");

    let aiResult: Record<string, unknown> = {};
    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (r.ok) {
        const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
        const raw = j.choices?.[0]?.message?.content?.trim() ?? "";
        aiResult = safeJson(raw) ?? {};
      } else if (r.status === 429) {
        throw new Error("Limite IA atteinte. Réessayez plus tard.");
      } else if (r.status === 402) {
        throw new Error("Crédits IA épuisés. Ajoutez du crédit dans Settings > Workspace > Usage.");
      }
    } catch (e) {
      if (e instanceof Error && (e.message.includes("Limite IA") || e.message.includes("Crédits"))) throw e;
      // sinon: on continue avec aiResult vide → fallback basique
    }

    // Mapping catégorie par path "L1 > L2 > L3"
    let categoryId: string | null = null;
    let categoryName: string | null = null;
    const path = typeof aiResult.category_path === "string" ? aiResult.category_path : null;
    if (path) {
      const parts = path.split(">").map((s) => s.trim().toLowerCase()).filter(Boolean);
      let parentId: string | null = null;
      for (let level = 1; level <= parts.length; level++) {
        const wanted = parts[level - 1];
        const match = cats.find(
          (c) =>
            c.level === level &&
            (level === 1 ? c.parent_id === null : c.parent_id === parentId) &&
            c.name.toLowerCase() === wanted,
        );
        if (!match) break;
        categoryId = match.id;
        categoryName = match.name;
        parentId = match.id;
      }
    }

    const rawVariants = Array.isArray(aiResult.variants) ? (aiResult.variants as unknown[]) : [];
    const variants: AiDraftVariant[] = rawVariants
      .map((v) => {
        const obj = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
        const colorHexRaw = typeof obj.color_hex === "string" ? obj.color_hex : "";
        return {
          size: String(obj.size ?? "").slice(0, 40),
          color: String(obj.color ?? "").slice(0, 60),
          colorHex: /^#[0-9a-fA-F]{6}$/.test(colorHexRaw) ? colorHexRaw : "",
          stock: 0,
        };
      })
      .filter((v) => v.size || v.color)
      .slice(0, 20);

    const sourceCurrency = url.includes("1688") || url.includes("taobao") ? "CNY" : "USD";

    return {
      name: String(aiResult.name ?? title ?? "Produit importé").slice(0, 100) || "Produit importé",
      description: String(aiResult.description ?? "").slice(0, 2000),
      designation: String(aiResult.designation ?? "").slice(0, 200),
      price: Math.max(0, Number(aiResult.price_suggested_fcfa) || 0),
      sourcePrice: 0,
      sourceCurrency,
      images,
      variants,
      sourceUrl: url,
      categoryId,
      categoryName,
      isDuplicate: false,
    };
  });

// ─────────────────────────────────────────────────────────────
// 3. Publication d'un brouillon (anti-doublons + propre)

const PublishSchema = z.object({
  shopId: z.string().uuid(),
  draft: z.object({
    name: z.string().min(1).max(200),
    designation: z.string().max(300).optional(),
    description: z.string().max(5000).optional(),
    price: z.number().min(0),
    images: z.array(z.string().url()).max(15),
    variants: z
      .array(
        z.object({
          size: z.string().max(40),
          color: z.string().max(60),
          colorHex: z.string().max(20).optional(),
          stock: z.number().int().min(0).max(99999),
        }),
      )
      .max(30),
    sourceUrl: z.string().url(),
    categoryId: z.string().uuid().nullable(),
  }),
});

export const publishImportedDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PublishSchema.parse(input))
  .handler(async ({ data }) => {
    const { shopId, draft } = data;

    // Vérifier que la boutique existe et est bien une boutique admin
    const { data: shop } = await supabaseAdmin
      .from("profiles")
      .select("id, is_admin_shop")
      .eq("id", shopId)
      .maybeSingle();
    if (!shop) throw new Error("Boutique introuvable");

    // Anti-doublons par source_url
    const { data: dupBySource } = await supabaseAdmin
      .from("product_admin_metadata")
      .select("product_id")
      .eq("source_url", draft.sourceUrl)
      .maybeSingle();
    if (dupBySource) {
      return { duplicate: true, productId: dupBySource.product_id as string };
    }

    // Anti-doublons par (vendor + nom)
    const { data: dupByName } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("vendor_id", shopId)
      .ilike("name", draft.name)
      .limit(1)
      .maybeSingle();
    if (dupByName) {
      return { duplicate: true, productId: dupByName.id as string };
    }

    // Insert produit
    const code = `IMP-${Date.now().toString(36).toUpperCase()}`;
    const { data: product, error } = await supabaseAdmin
      .from("products")
      .insert({
        vendor_id: shopId,
        name: draft.name,
        designation: draft.designation ?? null,
        description: draft.description ?? null,
        price: draft.price,
        status: "approved",
        is_active: true,
        category_id: draft.categoryId,
        code,
      })
      .select("id")
      .single();
    if (error || !product) throw new Error(error?.message ?? "Erreur création produit");

    // Images
    if (draft.images.length > 0) {
      await supabaseAdmin.from("product_images").insert(
        draft.images.map((url, i) => ({ product_id: product.id, url, position: i })),
      );
    }

    // Variants
    if (draft.variants.length > 0) {
      await supabaseAdmin.from("product_variants").insert(
        draft.variants.map((v) => ({
          product_id: product.id,
          size: v.size || null,
          color: v.color || null,
          color_hex: v.colorHex || null,
          stock: v.stock,
        })),
      );
    }

    // Métadonnée source pour anti-doublons futur
    await supabaseAdmin
      .from("product_admin_metadata")
      .upsert({ product_id: product.id, source_url: draft.sourceUrl }, { onConflict: "product_id" });

    return { duplicate: false, productId: product.id };
  });

// ─────────────────────────────────────────────────────────────
// 4. Découverte de liens produits depuis une URL de boutique (Taobao/1688)

const DiscoverShopSchema = z.object({
  shopUrl: z.string().url(),
  limit: z.number().int().min(1).max(50).optional(),
});

function isProductLink(url: string): boolean {
  return (
    /item\.taobao\.com\/item\.htm/i.test(url) ||
    /detail\.tmall\.com\/item\.htm/i.test(url) ||
    /detail\.1688\.com\/offer\//i.test(url)
  );
}

export const discoverShopProductLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DiscoverShopSchema.parse(input))
  .handler(async ({ data }): Promise<{ urls: string[]; source: "firecrawl" | "html" | "none" }> => {
    const limit = data.limit ?? 20;
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    const collected: string[] = [];

    // 1) Firecrawl map (rapide, basé sur sitemap + crawling)
    if (firecrawlKey) {
      try {
        const r = await fetch("https://api.firecrawl.dev/v2/map", {
          method: "POST",
          headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url: data.shopUrl, limit: 500, includeSubdomains: true }),
        });
        if (r.ok) {
          const j = (await r.json()) as { links?: string[]; data?: { links?: string[] } };
          const links = j.links ?? j.data?.links ?? [];
          for (const l of links) if (isProductLink(l)) collected.push(l);
        }
      } catch {
        // fallthrough
      }

      // 2) Fallback: scrape de la page boutique pour extraire les liens
      if (collected.length === 0) {
        try {
          const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
            method: "POST",
            headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ url: data.shopUrl, formats: ["links", "html"], waitFor: 2000 }),
          });
          if (r.ok) {
            const j = (await r.json()) as { data?: { links?: string[]; html?: string } };
            const links = j.data?.links ?? [];
            for (const l of links) if (isProductLink(l)) collected.push(l);
            if (collected.length === 0 && j.data?.html) {
              const re = /https?:\/\/[^\s"'<>]+/gi;
              const m = j.data.html.match(re) ?? [];
              for (const l of m) if (isProductLink(l)) collected.push(l);
            }
          }
        } catch {
          // ignore
        }
      }
    }

    // 3) Dernier recours : fetch brut + regex
    if (collected.length === 0) {
      try {
        const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(data.shopUrl)}&timeout=10000`);
        if (r.ok) {
          const html = await r.text();
          const re = /https?:\/\/[^\s"'<>]+/gi;
          const m = html.match(re) ?? [];
          for (const l of m) if (isProductLink(l)) collected.push(l);
        }
      } catch {
        // ignore
      }
    }

    const urls = Array.from(new Set(collected.map((u) => u.split("#")[0]))).slice(0, limit);
    return { urls, source: firecrawlKey ? (urls.length ? "firecrawl" : "none") : (urls.length ? "html" : "none") };
  });
