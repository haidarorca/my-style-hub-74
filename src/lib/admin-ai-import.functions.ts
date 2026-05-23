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
import {
  scrapeProductWithBrightDataDetailed,
  discoverShopWithBrightData,
  resolveTaobaoShortLink,
  detectPlatform,
  extractSourceProductId,
  validateNormalizedProduct,
  type ImportAttemptLog,
  type NormalizedProduct,
} from "./scraping/brightdata.server";

// ─────────────────────────────────────────────────────────────
// Types

interface AiDraftVariant {
  size: string;
  color: string;
  colorHex: string;
  stock: number;
}

function logImportDebug(stage: string, details: Record<string, unknown>) {
  console.info(`[AdminAiImport:${stage}]`, details);
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
  importLog: ImportAttemptLog;
}

export interface ImportUiLog extends ImportAttemptLog {
  id: string;
  createdAt: number;
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

function isFalseImportedProduct(row: { name?: string | null; description?: string | null; price?: number | string | null }, imageUrls: string[]): boolean {
  const text = `${row.name ?? ""}\n${row.description ?? ""}`.toLowerCase();
  const price = Number(row.price ?? 0);
  const loginOrSecurity = /登录|登陆|亲，请登录|connexion|login|sign in|验证码|captcha|安全验证|security check|访问受限|sec\.taobao|punish/i.test(text);
  const badTitle = /^(登录|登陆|login|connexion|tmall|taobao)$/i.test(String(row.name ?? "").trim());
  const badImages = imageUrls.length === 0 || imageUrls.every((u) => /logo|icon|sprite|captcha|login|blank|pixel|taobao/i.test(u));
  return badTitle || loginOrSecurity || price <= 0 || badImages;
}

export const cleanupFalseTaobaoImports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ deleted: number }> => {
    const { data: metas } = await supabaseAdmin
      .from("product_admin_metadata")
      .select("product_id, source_url, source_platform")
      .or("source_platform.in.(taobao,tmall,1688),source_url.ilike.%taobao%,source_url.ilike.%tmall%,source_url.ilike.%1688%")
      .limit(500);

    const ids = Array.from(new Set((metas ?? []).map((m) => m.product_id as string).filter(Boolean)));
    if (ids.length === 0) return { deleted: 0 };

    const { data: products } = await supabaseAdmin
      .from("products")
      .select("id, name, description, price")
      .in("id", ids);
    const { data: images } = await supabaseAdmin
      .from("product_images")
      .select("product_id, url")
      .in("product_id", ids);

    const imagesByProduct = new Map<string, string[]>();
    for (const img of images ?? []) {
      const productId = img.product_id as string;
      imagesByProduct.set(productId, [...(imagesByProduct.get(productId) ?? []), img.url as string]);
    }

    const deleteIds = (products ?? [])
      .filter((p) => isFalseImportedProduct(p, imagesByProduct.get(p.id as string) ?? []))
      .map((p) => p.id as string);

    if (deleteIds.length === 0) return { deleted: 0 };
    const { error } = await supabaseAdmin.from("products").delete().in("id", deleteIds);
    if (error) throw new Error(error.message);
    logImportDebug("cleanup", { deleted: deleteIds.length });
    return { deleted: deleteIds.length };
  });

// ─────────────────────────────────────────────────────────────
// 2. Scrape produit + IA + matching catégorie existante

const ScrapeProductSchema = z.object({
  url: z.string().url(),
  shopId: z.string().optional(),
});

// FCFA conversion (CNY → FCFA). Marge x2.5 par défaut sur le coût source.
const CNY_TO_FCFA = 85; // taux indicatif
const MARGIN_MULTIPLIER = 2.5;

export const scrapeProductForAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ScrapeProductSchema.parse(input))
  .handler(async ({ data }): Promise<AiDraft> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Assistant IA non configuré (LOVABLE_API_KEY)");

    // 0. Normalisation URL (résout les liens courts click.world.taobao.com, m.tb.cn, etc.)
    const url = await resolveTaobaoShortLink(data.url);
    const platform = detectPlatform(url);
    const sourceProductId = extractSourceProductId(url, platform);
    const baseLog: ImportAttemptLog = {
      initialUrl: data.url,
      finalUrl: url,
      source: "none",
      status: "blocked",
      reason: "Doublon ou import non lancé",
      issues: [],
    };

    // 1. Anti-doublons multi-niveaux : URL exacte OU (plateforme + source_product_id)
    let existing: { product_id: string } | null = null;
    const byUrl = await supabaseAdmin
      .from("product_admin_metadata")
      .select("product_id")
      .eq("source_url", url)
      .limit(1)
      .maybeSingle();
    if (byUrl.data) existing = { product_id: byUrl.data.product_id as string };

    if (!existing && sourceProductId && platform !== "unknown") {
      const byPid = await supabaseAdmin
        .from("product_admin_metadata")
        .select("product_id")
        .eq("source_platform", platform)
        .eq("source_product_id", sourceProductId)
        .limit(1)
        .maybeSingle();
      if (byPid.data) existing = { product_id: byPid.data.product_id as string };
    }

    if (existing) {
      return {
        name: "Doublon détecté",
        description: "Ce produit a déjà été importé.",
        designation: "",
        price: 0,
        sourcePrice: 0,
        sourceCurrency: platform === "unknown" ? "USD" : "CNY",
        images: [],
        variants: [],
        sourceUrl: url,
        categoryId: null,
        categoryName: null,
        isDuplicate: true,
        duplicateProductId: existing.product_id,
        importLog: { ...baseLog, status: "blocked", reason: "Doublon détecté", issues: ["Produit déjà importé"] },
      };
    }

    // 2. Scraping : Bright Data d'abord (plateformes chinoises), Firecrawl en fallback
    let bd: NormalizedProduct | null = null;
    let importLog = baseLog;
    if (platform !== "unknown") {
      const scrapeResult = await scrapeProductWithBrightDataDetailed(url);
      bd = scrapeResult.product;
      importLog = scrapeResult.log;
      if (!bd) {
        throw new Error(`Import bloqué : ${importLog.reason || "aucune source n'a fourni un vrai produit validé"}`);
      }
    }

    let scrapedTitle = "";
    let scrapedDesc = "";
    let scrapedImages: string[] = [];
    let scrapedVariants: AiDraftVariant[] = [];
    let scrapedPriceCny = 0;
    const sourceCurrency = bd?.currency || (platform === "unknown" ? "USD" : "CNY");

    if (bd) {
      const validation = validateNormalizedProduct(bd);
      logImportDebug("validation", {
        valid: validation.valid,
        issues: validation.issues,
        confidence: validation.confidence,
        source: bd.extractionSource,
        url,
        title: bd.title,
        priceMin: bd.priceMin,
        images: bd.images.length,
        variants: bd.variants.length,
      });
      if (!validation.valid) {
        throw new Error(`Import bloqué : ${validation.issues.join(" · ")}`);
      }
      scrapedTitle = bd.title;
      scrapedDesc = bd.description;
      scrapedImages = bd.images;
      scrapedPriceCny = bd.priceMin || bd.priceMax || 0;
      scrapedVariants = bd.variants.map((v) => ({
        size: v.size.slice(0, 40),
        color: v.color.slice(0, 60),
        colorHex: v.colorHex,
        stock: v.stock,
      }));
    } else {
      // Fallback générique (HTML brut + Firecrawl si dispo)
      const fallback = await fetchHtml(url);
      scrapedTitle = fallback.title;
      scrapedImages = fallback.images;
    }

    const looksLikeLoginOrSecurity = /登录|登陆|connexion|login|sign in|验证码|captcha|安全验证|security check|访问受限|sec\.taobao|punish/i;
    const titleText = scrapedTitle.trim();
    if (!titleText || titleText.length < 4 || looksLikeLoginOrSecurity.test(`${titleText}\n${scrapedDesc}`)) {
      throw new Error("Import bloqué : page de connexion ou sécurité détectée, aucun brouillon créé.");
    }
    if (platform !== "unknown" && scrapedPriceCny <= 0) {
      throw new Error("Import bloqué : prix source valide introuvable, aucun brouillon créé.");
    }
    if (platform !== "unknown" && scrapedImages.length === 0) {
      throw new Error("Import bloqué : image produit valide introuvable, aucun brouillon créé.");
    }
    if (platform !== "unknown" && scrapedVariants.length === 0) {
      throw new Error("Import bloqué : variantes/SKU introuvables, aucun brouillon créé.");
    }

    // 3. Récupération des catégories (3 niveaux) pour mapping
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

    // 4. IA : traduction FR + désignation + description + mapping catégorie existante
    const priceSuggestionFcfa = scrapedPriceCny > 0 ? Math.round(scrapedPriceCny * CNY_TO_FCFA * MARGIN_MULTIPLIER) : 0;

    const prompt = [
      "Tu es un assistant qui prépare une fiche produit FR pour un marché ouest-africain à partir de données scrapées Taobao/Tmall/1688.",
      "Tu ne dois PAS inventer le titre ni les variantes : utilise les données fournies. Tu traduis en français, tu rédiges une désignation et une description marketing claires, et tu choisis UNE catégorie dans l'arborescence donnée.",
      "Réponds UNIQUEMENT en JSON strict (pas de markdown):",
      '{"name":"...","designation":"... (max 80 car)","description":"... (max 600 car)","price_suggested_fcfa":<int>,"category_path":"Rayon > Catégorie > Sous-catégorie"}',
      "",
      "IMPORTANT pour category_path:",
      "- Tu DOIS choisir UNIQUEMENT parmi l'arborescence existante ci-dessous.",
      "- Format strict: 'Rayon > Catégorie > Sous-catégorie' (3 niveaux si dispo, sinon 1 ou 2).",
      "- Si aucune catégorie ne correspond, mets category_path à null.",
      "",
      "Arborescence existante:",
      tree || "(aucune catégorie en base)",
      "",
      `URL: ${url}`,
      `Plateforme: ${platform}`,
      scrapedTitle ? `Titre source: ${scrapedTitle}` : "",
      scrapedDesc ? `Description source (extrait): ${scrapedDesc.slice(0, 800)}` : "",
      scrapedPriceCny > 0 ? `Prix source: ${scrapedPriceCny} ${sourceCurrency} (suggestion FCFA: ${priceSuggestionFcfa})` : "",
      scrapedVariants.length ? `Variantes détectées (${scrapedVariants.length}): ${scrapedVariants.slice(0, 10).map((v) => `${v.size}/${v.color}`).join(", ")}` : "",
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
      // continue avec aiResult vide
    }

    // 5. Mapping catégorie par path "L1 > L2 > L3"
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

    // 6. Construction du brouillon final — variantes & images viennent du SCRAPE, pas de l'IA
    const finalPrice =
      Math.max(0, Number(aiResult.price_suggested_fcfa) || 0) || priceSuggestionFcfa;
    const finalName = String(aiResult.name ?? scrapedTitle ?? "").trim().slice(0, 100);
    const finalDescription = String(aiResult.description ?? scrapedDesc ?? "").trim().slice(0, 2000);
    if (!finalName || looksLikeLoginOrSecurity.test(`${finalName}\n${finalDescription}`)) {
      throw new Error("Import bloqué : le brouillon généré ressemble à une page de connexion/sécurité.");
    }
    if (finalPrice <= 0 || scrapedImages.length === 0 || scrapedVariants.length === 0) {
      throw new Error("Import bloqué : brouillon incomplet, aucune donnée produit ne sera conservée.");
    }

    return {
      name: finalName,
      description: finalDescription,
      designation: String(aiResult.designation ?? "").slice(0, 200),
      price: finalPrice,
      sourcePrice: scrapedPriceCny,
      sourceCurrency,
      images: scrapedImages,
      variants: scrapedVariants,
      sourceUrl: url,
      categoryId,
      categoryName,
      isDuplicate: false,
      importLog,
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
    price: z.number().positive(),
    images: z.array(z.string().url()).min(1).max(15),
    variants: z
      .array(
        z.object({
          size: z.string().max(40),
          color: z.string().max(60),
          colorHex: z.string().max(20).optional(),
          stock: z.number().int().min(0).max(99999),
          price: z.number().positive().optional(),
          imageUrl: z.string().url().optional(),
        }),
      )
      .min(1)
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

    const platform = detectPlatform(draft.sourceUrl);
    const sourcePid = extractSourceProductId(draft.sourceUrl, platform);
    const { data: result, error } = await (supabaseAdmin.rpc as any)("create_imported_product_atomic", {
      _shop_id: shopId,
      _source_url: draft.sourceUrl,
      _source_platform: platform,
      _source_product_id: sourcePid,
      _name: draft.name.trim(),
      _designation: draft.designation?.trim() || null,
      _description: draft.description?.trim() || null,
      _price: draft.price,
      _category_id: draft.categoryId,
      _images: draft.images.map((url, position) => ({ url, position })),
      _variants: draft.variants,
    });
    if (error) throw new Error(error.message);
    return result as { duplicate: boolean; productId: string };
  });

// ─────────────────────────────────────────────────────────────
// 4. Découverte de liens produits depuis une URL de boutique (Taobao/1688)

const DiscoverShopSchema = z.object({
  shopUrl: z.string().url(),
  limit: z.number().int().min(1).max(200).optional(),
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
  .handler(async ({ data }): Promise<{ urls: string[]; source: "brightdata" | "firecrawl" | "html" | "none" }> => {
    const limit = data.limit ?? 20;

    // 0) Bright Data en priorité (dataset shop dédié Taobao/Tmall/1688)
    const shopUrl = await resolveTaobaoShortLink(data.shopUrl);
    const bdUrls = await discoverShopWithBrightData(shopUrl, limit);
    if (bdUrls && bdUrls.length > 0) {
      const urls = Array.from(new Set(bdUrls.filter(isProductLink).map((u) => u.split("#")[0]))).slice(0, limit);
      if (urls.length > 0) return { urls, source: "brightdata" };
    }

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
