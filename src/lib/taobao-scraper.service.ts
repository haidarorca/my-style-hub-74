/**
 * taobao-scraper.service.ts
 * -------------------------
 * Scraping Taobao/1688/Tmall via Bright Data Scraping Browser (Playwright CDP).
 * - click.world.taobao.com share links → extract shop name + id only
 * - item.taobao.com product links → scrape product details
 * - shop pages → attempt via Bright Data, fallback to AI if robots.txt blocks
 * - Realistic confidence scoring (never 100% on generic data)
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ── Types ──
export interface ScrapedProduct {
  id: string;
  name: string;
  designation: string;
  description: string;
  price: number;
  sourcePrice: number;
  currency: string;
  images: string[];
  variants: { size: string; color: string; colorHex: string; stock: number }[];
  category: string;
  categoryId: string | null;
  shopName: string;
  shopId: string;
  itemId: string;
  sourceUrl: string;
  canonicalUrl: string;
  platform: "taobao" | "tmall" | "1688";
  confidence: number;
  salesCount?: string;
}

export interface ScrapingResult {
  success: boolean;
  products: ScrapedProduct[];
  logs: string[];
  totalFound: number;
  errors: string[];
  isPartial: boolean; // true = some data missing, user should verify
}

// ── Logger ──
function log(logs: string[], msg: string) {
  const t = new Date().toISOString().slice(11, 19);
  logs.push(`[${t}] ${msg}`);
  console.log(`[TAOBAO-SCRAPER] ${msg}`);
}

// ── URL helpers ──
function detectPlatform(url: string): "taobao" | "tmall" | "1688" {
  const u = url.toLowerCase();
  if (u.includes("1688")) return "1688";
  if (u.includes("tmall")) return "tmall";
  return "taobao";
}

function extractItemId(url: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get("id") ||
      u.searchParams.get("itemId") ||
      u.pathname.match(/offer\/(\d+)/)?.[1] ||
      u.pathname.match(/item\/(\d+)/)?.[1] ||
      null;
  } catch { return null; }
}

function extractShopId(url: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get("targetId") ||
      u.searchParams.get("sellerId") ||
      u.searchParams.get("shop_id") ||
      url.match(/shop(\d+)\.taobao/)?.[1] ||
      null;
  } catch { return null; }
}

function canonicalizeUrl(url: string, platform: string, itemId: string | null): string {
  if (platform === "1688" && itemId) return `https://detail.1688.com/offer/${itemId}.html`;
  if (platform === "tmall" && itemId) return `https://detail.tmall.com/item.htm?id=${itemId}`;
  if (itemId) return `https://item.taobao.com/item.htm?id=${itemId}`;
  return url;
}

function isShareLink(url: string): boolean {
  return url.includes("click.world.taobao.com") ||
    url.includes("s.click.taobao.com") ||
    url.includes("share");
}

// ── Check if text is generic ──
function isGenericText(text: string): boolean {
  const genericPatterns = [
    /taobao est une plateforme/,
    /taobao is an e-commerce/,
    /plateforme de commerce mondiale/,
    /world.*platform/,
    /i shared a taobao page/,
    /tap and open.*taobao/,
    /check it out/,
    / millions de produits/,
    / millions of products/,
  ];
  return genericPatterns.some(p => p.test(text.toLowerCase()));
}

// ── Filter out generic images ──
function filterRealProductImages(images: string[]): string[] {
  const genericPatterns = [
    /\/O1CN01[a-zA-Z0-9]+_!!\d+\.jpg$/i, // Shop avatar
    /favicon/,
    /\/TB1.*\.png$/i, // Taobao assets
    /gtms\d+\.alicdn/, // Taobao marketing assets
    /tps\/i\d+\/TB/, // Old Taobao assets
    /coupon/, /券/,
    /logo/,
    /taobao.*\.png$/i,
  ];
  return images.filter(img => {
    const lower = img.toLowerCase();
    // Keep alicdn product images (they have different patterns)
    const isProductImage = /alicdn\.com/.test(lower) && !genericPatterns.some(p => p.test(lower));
    return isProductImage;
  });
}

// ── Calculate realistic confidence ──
function calculateConfidence(product: Partial<ScrapedProduct>, isGeneric: boolean, hasLoginWall: boolean): number {
  let score = 50; // Start at 50, never 100 by default

  // Positive signals
  if (product.images && product.images.length > 0) score += 15;
  if (product.images && product.images.length >= 3) score += 10;
  if (product.sourcePrice && product.sourcePrice > 0) score += 10;
  if (product.name && product.name.length > 5 && !isGeneric) score += 10;
  if (product.itemId && product.itemId.length > 5) score += 5;
  if (product.variants && product.variants.length > 0) score += 5;

  // Negative signals
  if (isGeneric) score -= 40;
  if (hasLoginWall) score -= 30;
  if (!product.images || product.images.length === 0) score -= 20;
  if (!product.name || product.name.length < 3) score -= 20;
  if (!product.sourcePrice || product.sourcePrice === 0) score -= 15;
  if (!product.itemId) score -= 10;

  // Clamp 5-95
  return Math.max(5, Math.min(95, score));
}

// ── Bright Data CDP connection ──
async function getBrowser() {
  const auth = process.env.BRIGHTDATA_CDP_AUTH || "brd-customer-hl_91aa54ca-zone-scraping_browser1:63fq825zh7ex";
  const endpoint = `wss://${auth}@brd.superproxy.io:9222`;

  // Lazy-load playwright-core
  const { chromium } = await import("playwright-core");
  return chromium.connectOverCDP(endpoint);
}

// ── Extract data from product HTML ──
function extractFromHTML(html: string): {
  name: string; description: string; price: number; images: string[];
  shopName: string; category: string; sales?: string;
} {
  const result: { name: string; description: string; price: number; images: string[]; shopName: string; category: string; sales: string } = { name: "", description: "", price: 0, images: [], shopName: "", category: "", sales: "" };

  // Title
  const titlePatterns = [
    /<h1[^>]*data-spm=["']title["'][^>]*>([^<]+)/i,
    /<h1[^>]*class=["'][^"']*title[^"']*["'][^>]*>([^<]+)/i,
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i,
    /<title>([^<]+)<\/title>/i,
  ];
  for (const re of titlePatterns) {
    const m = html.match(re);
    if (m) {
      result.name = m[1].replace(/ - 淘宝|\s*-\s*tmall|\s*-\s*1688/gi, "").trim();
      break;
    }
  }

  // Description
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i);
  if (descMatch) result.description = descMatch[1].slice(0, 500);

  // Price
  const pricePatterns = [
    /"defaultItemPrice["']?\s*[:=]\s*["']?([\d.]+)/i,
    /"price["']?\s*[:=]\s*["']?([\d.]+)/i,
    /class=["'][^"']*price[^"']*["'][^>]*>\s*([\d.]+)/i,
    /([\d,]+\.?\d*)\s*元/i,
  ];
  for (const re of pricePatterns) {
    const m = html.match(re);
    if (m) { result.price = parseFloat(m[1].replace(",", "")); break; }
  }

  // Images - only real product images
  const imgRe = /https?:\/\/(?:img\.alicdn|gd\d*\.alicdn|sc\d*\.alicdn)[^\s'"<>]+/gi;
  const imgs = html.match(imgRe);
  if (imgs) {
    result.images = [...new Set(imgs)]
      .filter((img: string) => {
        const lower = img.toLowerCase();
        return lower.includes("alicdn.com") &&
          !lower.includes("favicon") &&
          !/gtms\d+\.alicdn/.test(lower) &&
          !/tps\/i\d+\/TB/.test(lower);
      })
      .map((img: string) => img.replace(/_\d+x\d+.*?(?=\.|$)/, "_800x800"))
      .slice(0, 10);
  }

  // Shop name
  const shopMatch = html.match(/["']sellerNick["']?\s*:\s*["']([^"']+)/i) ||
    html.match(/class=["'][^"']*shopname[^"']*["'][^>]*>([^<]+)/i) ||
    html.match(/<a[^>]+class=["'][^"']*shop[^"']*["'][^>]*>([^<]+)/i);
  if (shopMatch) result.shopName = shopMatch[1].trim();

  // Sales count
  const salesMatch = html.match(/(\d+[K+]?)\s*(sold|ventes|vendus|销量)/i) ||
    html.match(/(\d+[K+]?)\s*\+/i);
  if (salesMatch) result.sales = salesMatch[1];

  return result;
}

// ── AI Enhancement ──
async function enhanceWithAI(
  product: Partial<ScrapedProduct>,
  platform: string,
  categories: { id: string; name: string }[],
  logs: string[]
): Promise<ScrapedProduct> {
  log(logs, "[IA] Enrichissement en cours...");

  try {
    const apiKey = process.env.LOVABLE_API_KEY || "";
    if (!apiKey) {
      log(logs, "[IA] Cle API IA non configuree");
      throw new Error("IA non configuree");
    }

    const catNames = categories.map((c) => c.name).slice(0, 100).join(", ");

    const prompt = `Analyse ce produit ${platform.toUpperCase()} et extrais les donnees en FRANCAIS.
Reponds UNIQUEMENT en JSON strict sans markdown:
{"name":"nom francais court 60c max","designation":"designation courte","description":"description marketing max 300c","price_suggested":prix_vente_suggere_fcfa,"category":"categorie exacte","variants":[{"size":"taille","color":"couleur fr","color_hex":"#rrggbb"}]}
Categories disponibles: ${catNames}
Nom original: ${product.name || ""}
Description: ${product.description || ""}
Prix source: ${product.sourcePrice || 0} CNY`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`IA HTTP ${res.status}`);

    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content?.trim() || "";

    let aiResult: any = null;
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      aiResult = JSON.parse(cleaned);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) aiResult = JSON.parse(m[0]);
    }

    // Find matching category
    let categoryId: string | null = null;
    let categoryName: string | null = null;
    if (aiResult?.category) {
      const match = categories.find((c) =>
        c.name.toLowerCase().includes(String(aiResult.category).toLowerCase().slice(0, 20))
      );
      if (match) { categoryId = match.id; categoryName = match.name; }
    }

    // Parse variants
    const rawVariants = Array.isArray(aiResult?.variants) ? aiResult.variants : [];
    const variants = rawVariants.map((v: any) => ({
      size: String(v.size || "").slice(0, 40),
      color: String(v.color || "").slice(0, 60),
      colorHex: /^#[0-9a-fA-F]{6}$/.test(v.color_hex) ? v.color_hex : "",
      stock: 0,
    })).filter((v: any) => v.size || v.color);

    // Images (filter generic)
    const realImages = filterRealProductImages(product.images || []);

    // Check if content is generic
    const isGeneric = isGenericText(aiResult?.name || "") || isGenericText(product.name || "");
    const hasLoginWall = !product.name || product.name.length < 3;

    const confidence = calculateConfidence(
      { ...product, images: realImages, name: String(aiResult?.name || product.name || "").slice(0, 100) },
      isGeneric,
      hasLoginWall
    );

    log(logs, `[IA] Enrichissement OK | Confiance : ${confidence}%`);

    return {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: String(aiResult?.name || product.name || "Produit").slice(0, 100),
      designation: String(aiResult?.designation || aiResult?.name || product.name || "").slice(0, 120),
      description: String(aiResult?.description || product.description || "").slice(0, 2000),
      price: Math.max(0, Number(aiResult?.price_suggested) || (product.sourcePrice ? Math.round(product.sourcePrice * 85) : 0)),
      sourcePrice: product.sourcePrice || 0,
      currency: "CNY",
      images: realImages.length > 0 ? realImages : (product.images || []).slice(0, 5),
      variants,
      category: categoryName || product.category || "",
      categoryId: categoryId || product.categoryId || null,
      shopName: product.shopName || "",
      shopId: product.shopId || "",
      itemId: product.itemId || "",
      sourceUrl: product.sourceUrl || "",
      canonicalUrl: product.canonicalUrl || "",
      platform: (product.platform as any) || "taobao",
      confidence,
      salesCount: product.salesCount,
    };
  } catch (e: any) {
    log(logs, `[IA] Erreur : ${e.message}`);
    const isGeneric = isGenericText(product.name || "");
    const hasLoginWall = !product.name || product.name.length < 3;
    const confidence = calculateConfidence(product, isGeneric, hasLoginWall);

    return {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: product.name || "Produit importe",
      designation: product.name || "",
      description: product.description || "",
      price: product.sourcePrice ? Math.round(product.sourcePrice * 85) : 0,
      sourcePrice: product.sourcePrice || 0,
      currency: "CNY",
      images: filterRealProductImages(product.images || []),
      variants: [],
      category: product.category || "",
      categoryId: null,
      shopName: product.shopName || "",
      shopId: product.shopId || "",
      itemId: product.itemId || "",
      sourceUrl: product.sourceUrl || "",
      canonicalUrl: product.canonicalUrl || "",
      platform: (product.platform as any) || "taobao",
      confidence,
      salesCount: product.salesCount,
    };
  }
}

// ── Scrape share page (click.world.taobao.com) ──
async function scrapeSharePage(url: string, logs: string[]): Promise<{
  shopName: string; shopId: string | null; platform: string;
  isLoginRequired: boolean; itemIds: string[];
}> {
  log(logs, `[Share] Analyse du lien de partage...`);

  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    await page.goto(url, { timeout: 30000, waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, 5000));

    const finalUrl = page.url();
    log(logs, `[Share] URL finale : ${finalUrl.slice(0, 80)}`);

    // Extract shop info from page
    const shopName = await page.evaluate(() => {
      const el = document.querySelector('[class*="shop"]');
      return el?.textContent?.trim() || "";
    });

    const text = await page.evaluate(() => document.body?.innerText || "");
    const html = await page.content();

    // Extract targetId from URL
    const shopId = extractShopId(finalUrl) || extractShopId(url);

    // Check for login requirement
    const isLoginRequired = text.includes("Open Taobao") ||
      text.includes("Download Taobao") ||
      text.includes("Tap and open") ||
      text.includes("登录");

    log(logs, `[Share] Boutique : ${shopName || "?"} | Shop ID : ${shopId || "?"}`);
    log(logs, `[Share] Login requis : ${isLoginRequired}`);

    // Try to find item IDs from page data
    const itemIds: string[] = [];
    const idMatches = html.match(/itemId["']?\s*:\s*["']?(\d{8,})/g);
    if (idMatches) {
      for (const m of idMatches) {
        const id = m.match(/(\d{8,})/)?.[1];
        if (id && !itemIds.includes(id)) itemIds.push(id);
      }
    }

    await browser.close();
    return { shopName: shopName || "", shopId, platform: "taobao", isLoginRequired, itemIds };
  } catch (e: any) {
    log(logs, `[Share] Erreur : ${e.message}`);
    if (browser) await browser.close().catch(() => { });
    return { shopName: "", shopId: null, platform: "taobao", isLoginRequired: true, itemIds: [] };
  }
}

// ── 1. Scrape a single product ──
export const scrapeSingleProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ url: z.string().min(10) }).parse(input))
  .handler(async ({ data }): Promise<ScrapingResult> => {
    const logs: string[] = [];
    const errors: string[] = [];

    log(logs, "=== Scraping Produit ===");

    const rawUrl = data.url;

    // Check if it's a share link
    if (isShareLink(rawUrl) && !extractItemId(rawUrl)) {
      log(logs, "Lien de partage detecte - extraction boutique...");
      const shareInfo = await scrapeSharePage(rawUrl, logs);

      if (shareInfo.isLoginRequired && shareInfo.itemIds.length === 0) {
        log(logs, "⚠️ Cette boutique Taobao necessite l'app mobile ou un compte");
        errors.push("Boutique Taobao necessite l'app mobile. Essayez de copier les liens produit individuels (item.taobao.com/item.htm?id=...)");
      }

      // Load categories
      const { data: cats } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin
        .from("categories")
        .select("id, name")
        .eq("level", 3)
        .limit(200);

      // If we have itemIds, try to scrape them
      const products: ScrapedProduct[] = [];
      for (const itemId of shareInfo.itemIds.slice(0, 5)) {
        const productUrl = `https://item.taobao.com/item.htm?id=${itemId}`;
        log(logs, `[Share] Scraping produit ${itemId}...`);

        let browser;
        try {
          browser = await getBrowser();
          const page = await browser.newPage();
          await page.goto(productUrl, { timeout: 30000, waitUntil: "domcontentloaded" });
          await new Promise(r => setTimeout(r, 5000));

          const html = await page.content();
          const extracted = extractFromHTML(html);
          await browser.close();

          if (extracted.name && extracted.name.length > 2) {
            const product = await enhanceWithAI({
              name: extracted.name,
              description: extracted.description,
              sourcePrice: extracted.price,
              images: extracted.images,
              shopName: extracted.shopName || shareInfo.shopName,
              category: extracted.category,
              itemId,
              sourceUrl: rawUrl,
              canonicalUrl: productUrl,
              platform: "taobao",
            }, "taobao", (cats || []) as any, logs);
            products.push(product);
            log(logs, `✅ Produit ${itemId} : ${product.name.slice(0, 40)} (${product.confidence}%)`);
          }
        } catch (e: any) {
          log(logs, `❌ Produit ${itemId} : ${e.message}`);
          if (browser) await browser.close().catch(() => { });
        }
      }

      // If no products found, create a placeholder with shop info
      if (products.length === 0) {
        log(logs, "Aucun produit trouve, creation d'un brouillon boutique...");
        const placeholder = await enhanceWithAI({
          name: shareInfo.shopName || "Produit de la boutique",
          description: "",
          sourcePrice: 0,
          images: [],
          shopName: shareInfo.shopName,
          category: "",
          itemId: "",
          sourceUrl: rawUrl,
          canonicalUrl: rawUrl,
          platform: "taobao",
        }, "taobao", (cats || []) as any, logs);
        placeholder.confidence = Math.min(placeholder.confidence, 25);
        products.push(placeholder);
      }

      return {
        success: products.length > 0,
        products,
        logs,
        totalFound: products.length,
        errors,
        isPartial: shareInfo.isLoginRequired || products.some(p => p.confidence < 50),
      };
    }

    // Normal product URL
    const platform = detectPlatform(rawUrl);
    const itemId = extractItemId(rawUrl);
    const canonical = canonicalizeUrl(rawUrl, platform, itemId);
    log(logs, `[1/6] URL : ${platform.toUpperCase()} | Item ID : ${itemId || "?"}`);

    // Fetch via Bright Data
    log(logs, "[2/6] Scraping via Bright Data...");
    let html = "";
    let hasLoginWall = false;
    let browser;

    try {
      browser = await getBrowser();
      const page = await browser.newPage();
      await page.goto(canonical, { timeout: 30000, waitUntil: "domcontentloaded" });
      await new Promise(r => setTimeout(r, 5000));

      const finalUrl = page.url();
      html = await page.content();
      await browser.close();

      hasLoginWall = html.includes("登录淘宝") ||
        html.includes("login.taobao") ||
        finalUrl.includes("login");

      log(logs, `[2/6] ✅ Page recuperee : ${html.length} caracteres | Login wall : ${hasLoginWall}`);
    } catch (e: any) {
      log(logs, `[2/6] ❌ Bright Data error : ${e.message}`);
      errors.push(`Erreur de connexion : ${e.message}`);
      if (browser) await browser.close().catch(() => { });
    }

    if (!html || html.length < 200) {
      errors.push("Impossible de charger la page");
      return { success: false, products: [], logs, totalFound: 0, errors, isPartial: true };
    }

    // Extract
    log(logs, "[3/6] Extraction des donnees...");
    const extracted = extractFromHTML(html, platform);
    log(logs, `[3/6] ✅ Titre : ${extracted.name.slice(0, 50)} | Prix : ${extracted.price} | Images : ${extracted.images.length}`);

    // Categories
    log(logs, "[4/6] Chargement categories...");
    const { data: cats } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin
      .from("categories")
      .select("id, name")
      .eq("level", 3)
      .limit(200);
    log(logs, `[4/6] ✅ ${(cats || []).length} categories chargees`);

    // AI
    log(logs, "[5/6] Enrichissement IA...");
    const isGeneric = isGenericText(extracted.name) || isGenericText(extracted.description);
    const product = await enhanceWithAI({
      name: extracted.name,
      description: extracted.description,
      sourcePrice: extracted.price,
      images: extracted.images,
      shopName: extracted.shopName,
      category: extracted.category,
      itemId: itemId || "",
      sourceUrl: rawUrl,
      canonicalUrl: canonical,
      platform,
      salesCount: extracted.sales,
    }, platform, (cats || []) as any, logs);

    // Override confidence with realistic calculation
    product.confidence = calculateConfidence(product, isGeneric, hasLoginWall);

    log(logs, "=== Termine ===");
    return {
      success: product.confidence >= 20,
      products: [product],
      logs,
      totalFound: 1,
      errors,
      isPartial: product.confidence < 70 || hasLoginWall,
    };
  });

// ── 2. Scrape a store ──
export const scrapeStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    url: z.string().min(10),
    maxProducts: z.number().int().min(1).max(50).default(20),
  }).parse(input))
  .handler(async ({ data }): Promise<ScrapingResult> => {
    const logs: string[] = [];
    const errors: string[] = [];
    const allProducts: ScrapedProduct[] = [];

    log(logs, "=== Scraping Boutique ===");
    log(logs, `[1/5] URL : ${data.url.slice(0, 80)}`);

    const platform = detectPlatform(data.url);

    // If share link, extract shop info first
    let shopUrl = data.url;
    let shopName = "";
    let shopId = "";

    if (isShareLink(data.url)) {
      const shareInfo = await scrapeSharePage(data.url, logs);
      shopName = shareInfo.shopName;
      shopId = shareInfo.shopId || "";

      if (shareInfo.isLoginRequired) {
        log(logs, "⚠️ Cette boutique Taobao necessite l'app mobile");
        errors.push("Les boutiques Taobao necessitent l'app mobile ou un compte. Essayez de copier les liens produit individuels (item.taobao.com/item.htm?id=XXX)");
      }

      // Try to construct direct shop URL
      if (shopId) {
        shopUrl = `https://shop${shopId}.taobao.com/search.htm`;
      }
    } else {
      shopId = extractShopId(data.url) || "";
    }

    // Try to scrape via Bright Data
    log(logs, "[2/5] Tentative via Bright Data...");
    let html = "";
    let hasRobotsBlock = false;
    let browser;

    try {
      browser = await getBrowser();
      const page = await browser.newPage();

      try {
        await page.goto(shopUrl, { timeout: 30000, waitUntil: "domcontentloaded" });
        await new Promise(r => setTimeout(r, 5000));
      } catch (navErr: any) {
        if (navErr.message?.includes("robots.txt")) {
          hasRobotsBlock = true;
          log(logs, "[2/5] ❌ Bloque par robots.txt");
        } else {
          log(logs, `[2/5] ❌ Erreur navigation : ${navErr.message}`);
        }
      }

      if (!hasRobotsBlock) {
        html = await page.content();
      }

      await browser.close();
    } catch (e: any) {
      log(logs, `[2/5] ❌ Bright Data error : ${e.message}`);
      if (browser) await browser.close().catch(() => { });
    }

    // Extract product links from HTML
    const productLinks: string[] = [];
    if (html && html.length > 500) {
      log(logs, "[3/5] Extraction des liens produits...");

      const tbLinks = html.matchAll(/href=["'](https?:\/\/item\.taobao\.com\/item\.htm\?[^"']+)["']/gi);
      for (const m of tbLinks) productLinks.push(m[1].replace(/&amp;/g, "&"));

      const tmLinks = html.matchAll(/href=["'](https?:\/\/detail\.tmall\.com\/item\.htm\?[^"']+)["']/gi);
      for (const m of tmLinks) productLinks.push(m[1].replace(/&amp;/g, "&"));

      const itemIds = html.matchAll(/["']itemId["']?\s*:\s*["']?(\d{8,})["']?/gi);
      for (const m of itemIds) {
        productLinks.push(`https://item.taobao.com/item.htm?id=${m[1]}`);
      }

      log(logs, `[3/5] ✅ ${productLinks.length} liens trouves`);
    }

    // If robots.txt blocks or no links found, try item IDs from share page
    if ((hasRobotsBlock || productLinks.length === 0) && shopId) {
      log(logs, "[3/5] Fallback : tentative avec IDs de boutique...");
      // We can't get item IDs without login - inform user
      errors.push("Acces boutique limite par Taobao. Copiez les liens produit individuels depuis l'app Taobao.");
    }

    const uniqueLinks = [...new Set(productLinks)].slice(0, data.maxProducts);

    if (uniqueLinks.length === 0) {
      log(logs, "[4/5] Aucun produit trouve dans la boutique");

      // Load categories for placeholder
      const { data: cats } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin
        .from("categories")
        .select("id, name")
        .eq("level", 3)
        .limit(200);

      // Create placeholder with shop info
      const placeholder = await enhanceWithAI({
        name: shopName || "Produit de la boutique",
        description: `Produit de ${shopName || "la boutique Taobao"}`,
        sourcePrice: 0,
        images: [],
        shopName,
        shopId,
        category: "",
        itemId: "",
        sourceUrl: data.url,
        canonicalUrl: data.url,
        platform: "taobao" as const,
      }, "taobao", (cats || []) as any, logs);
      placeholder.confidence = Math.min(placeholder.confidence, 20);
      allProducts.push(placeholder);

      return {
        success: true,
        products: allProducts,
        logs,
        totalFound: 0,
        errors,
        isPartial: true,
      };
    }

    // Scrape each product
    log(logs, `[4/5] Scraping de ${uniqueLinks.length} produits...`);

    const { data: cats } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin
      .from("categories")
      .select("id, name")
      .eq("level", 3)
      .limit(200);

    for (let i = 0; i < uniqueLinks.length; i++) {
      const link = uniqueLinks[i];
      log(logs, `[4/5] Produit ${i + 1}/${uniqueLinks.length}...`);

      const itemId = extractItemId(link);
      const canonical = canonicalizeUrl(link, platform, itemId);

      let productHtml = "";
      let pBrowser;
      try {
        pBrowser = await getBrowser();
        const page = await pBrowser.newPage();
        await page.goto(canonical, { timeout: 30000, waitUntil: "domcontentloaded" });
        await new Promise(r => setTimeout(r, 3000));
        productHtml = await page.content();
        await pBrowser.close();
      } catch (e: any) {
        log(logs, `[4/5] ⏭️ Produit ${i + 1} : inaccessible (${e.message})`);
        if (pBrowser) await pBrowser.close().catch(() => { });
        continue;
      }

      if (!productHtml || productHtml.length < 200) {
        log(logs, `[4/5] ⏭️ Produit ${i + 1} : HTML vide`);
        continue;
      }

      const extracted = extractFromHTML(productHtml);
      if (!extracted.name || extracted.name.length < 3) {
        log(logs, `[4/5] ⏭️ Produit ${i + 1} : titre vide`);
        continue;
      }

      const isGeneric = isGenericText(extracted.name);
      const hasLoginWall = productHtml.includes("登录");

      const product = await enhanceWithAI({
        name: extracted.name,
        description: extracted.description,
        sourcePrice: extracted.price,
        images: extracted.images,
        shopName: extracted.shopName || shopName,
        category: extracted.category,
        itemId: itemId || "",
        sourceUrl: link,
        canonicalUrl: canonical,
        platform,
      }, platform, (cats || []) as any, logs);

      product.confidence = calculateConfidence(product, isGeneric, hasLoginWall);
      allProducts.push(product);
      log(logs, `[4/5] ✅ Produit ${i + 1} : ${product.name.slice(0, 40)} (${product.confidence}%)`);
    }

    log(logs, `[5/5] === Termine : ${allProducts.length} produits ===`);
    return {
      success: allProducts.length > 0,
      products: allProducts,
      logs,
      totalFound: uniqueLinks.length,
      errors,
      isPartial: hasRobotsBlock || allProducts.some(p => p.confidence < 50),
    };
  });

// ── 3. Check duplicate ──
export const checkDuplicate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ itemId: z.string(), sourceUrl: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const { data: existing } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin
      .from("product_admin_metadata")
      .select("product_id")
      .or(`source_url.eq.${data.sourceUrl},source_url.ilike.%${data.itemId}%`)
      .maybeSingle();

    const { data: existingImport } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin
      .from("import_products")
      .select("id")
      .eq("source_url", data.sourceUrl)
      .maybeSingle();

    return {
      isDuplicate: !!(existing || existingImport),
      existingProductId: existing?.product_id || null,
    };
  });

// ── 4. Batch import from multiple product URLs ──
export const scrapeBatchProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    urls: z.array(z.string().min(10)).max(20),
  }).parse(input))
  .handler(async ({ data }): Promise<ScrapingResult> => {
    const logs: string[] = [];
    const errors: string[] = [];
    const allProducts: ScrapedProduct[] = [];

    log(logs, `=== Import batch : ${data.urls.length} URLs ===`);

    const { data: cats } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin
      .from("categories")
      .select("id, name")
      .eq("level", 3)
      .limit(200);

    for (let i = 0; i < data.urls.length; i++) {
      const url = data.urls[i].trim();
      if (!url) continue;

      log(logs, `[${i + 1}/${data.urls.length}] ${url.slice(0, 60)}...`);

      const platform = detectPlatform(url);
      const itemId = extractItemId(url);
      const canonical = canonicalizeUrl(url, platform, itemId);

      let browser;
      try {
        browser = await getBrowser();
        const page = await browser.newPage();
        await page.goto(canonical, { timeout: 30000, waitUntil: "domcontentloaded" });
        await new Promise(r => setTimeout(r, 4000));

        const html = await page.content();
        await browser.close();

        const extracted = extractFromHTML(html);
        if (!extracted.name || extracted.name.length < 3) {
          log(logs, `  ⏭️ Titre vide`);
          continue;
        }

        const isGeneric = isGenericText(extracted.name);
        const hasLoginWall = html.includes("登录");

        const product = await enhanceWithAI({
          name: extracted.name,
          description: extracted.description,
          sourcePrice: extracted.price,
          images: extracted.images,
          shopName: extracted.shopName,
          category: extracted.category,
          itemId: itemId || "",
          sourceUrl: url,
          canonicalUrl: canonical,
          platform,
        }, platform, (cats || []) as any, logs);

        product.confidence = calculateConfidence(product, isGeneric, hasLoginWall);
        allProducts.push(product);
        log(logs, `  ✅ ${product.name.slice(0, 40)} (${product.confidence}%)`);

      } catch (e: any) {
        log(logs, `  ❌ ${e.message}`);
        if (browser) await browser.close().catch(() => { });
      }
    }

    return {
      success: allProducts.length > 0,
      products: allProducts,
      logs,
      totalFound: data.urls.length,
      errors,
      isPartial: allProducts.some(p => p.confidence < 50),
    };
  });
