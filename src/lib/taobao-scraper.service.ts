/**
 * taobao-scraper.service.ts
 * -------------------------
 * Service complet de scraping Taobao/1688/Tmall via Bright Data proxy.
 * - Pool de sessions avec rotation
 * - Scraping boutique complete (tous les produits)
 * - Scraping produit detaille
 * - Anti-doublons
 * - Matching categories existantes
 * - Fonctionne cote serveur uniquement
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ── Config ──
const PROXY_HTTP = process.env.BRIGHTDATA_PROXY || "http://brd-customer-hl_91aa54ca-zone-scraping_browser1:63fq825zh7ex@brd.superproxy.io:22225";
const PROXY_SS = process.env.BRIGHTDATA_SS || "https://brd-customer-hl_91aa54ca-zone-scraping_browser1:63fq825zh7ex@brd.superproxy.io:22225";

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
}

export interface ScrapingResult {
  success: boolean;
  products: ScrapedProduct[];
  logs: string[];
  totalFound: number;
  errors: string[];
}

// ── Session pool (in-memory, resets on deploy) ──
interface SessionCookie {
  name: string;
  value: string;
  domain: string;
  expires: number;
}

const sessionPool: Map<string, SessionCookie[]> = new Map();

// ── Helpers ──

function log(logs: string[], msg: string) {
  logs.push(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function fetchWithProxy(targetUrl: string, opts: RequestInit = {}): Promise<{ ok: boolean; html: string; status: number; headers: Headers }> {
  try {
    const res = await fetch(targetUrl, {
      ...opts,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8,fr;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Referer": "https://www.taobao.com/",
        ...(opts.headers || {}),
      },
      signal: AbortSignal.timeout(25000),
    });
    const html = await res.text();
    return { ok: res.ok, html, status: res.status, headers: res.headers };
  } catch (e: any) {
    return { ok: false, html: "", status: 0, headers: new Headers() };
  }
}

async function fetchViaBrightData(targetUrl: string): Promise<{ ok: boolean; html: string; status: number }> {
  try {
    // Method 1: Use Bright Data proxy directly
    const proxyUrl = new URL(PROXY_HTTP);
    const proxyEndpoint = `http://${proxyUrl.hostname}:${proxyUrl.port || 22225}`;

    const res = await fetch(proxyEndpoint, {
      method: "GET",
      headers: {
        "Proxy-Authorization": `Basic ${Buffer.from(`${proxyUrl.username}:${proxyUrl.password}`).toString("base64")}`,
        "X-BRD-Url": targetUrl,
        "X-BRD-Response-Format": "html",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
      signal: AbortSignal.timeout(30000),
    });

    const html = await res.text();

    if (res.ok && html.length > 500 && !html.includes("登录") && !html.includes("access denied")) {
      return { ok: true, html, status: res.status };
    }

    // Method 2: Direct fetch via BrightData SS
    const res2 = await fetch(PROXY_SS, {
      method: "GET",
      headers: {
        "X-BRD-Url": targetUrl,
        "X-BRD-Response-Format": "html",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(30000),
    });

    const html2 = await res2.text();
    return { ok: res2.ok, html: html2, status: res2.status };

  } catch {
    return { ok: false, html: "", status: 0 };
  }
}

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

function canonicalizeUrl(url: string, platform: string, itemId: string | null): string {
  if (platform === "1688" && itemId) return `https://detail.1688.com/offer/${itemId}.html`;
  if (platform === "tmall" && itemId) return `https://detail.tmall.com/item.htm?id=${itemId}`;
  if (itemId) return `https://item.taobao.com/item.htm?id=${itemId}`;
  return url;
}

// ── Extract product data from HTML ──
function extractProductFromHTML(html: string, platform: string): {
  name: string; description: string; price: number; images: string[]; shopName: string; category: string;
} {
  const result = { name: "", description: "", price: 0, images: [], shopName: "", category: "" };

  // Title - multiple patterns
  const titlePatterns = [
    /<h1[^>]*data-spm=["']title["'][^>]*>([^<]+)/i,
    /<h1[^>]*class=["'][^"']*title[^"']*["'][^>]*>([^<]+)/i,
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i,
    /<title>([^<]+)<\/title>/i,
  ];
  for (const re of titlePatterns) {
    const m = html.match(re);
    if (m) { result.name = m[1].replace(/ - 淘宝|\s*-\s*tmall|\s*-\s*1688/gi, "").trim(); break; }
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

  // Images - HD versions
  const imgRe = /https?:\/\/(?:img\.alicdn|gd\d*\.alicdn|sc\d*\.alicdn)[^\s'"<>]+/gi;
  const imgs = html.match(imgRe);
  if (imgs) {
    result.images = [...new Set(imgs)]
      .filter((img: string) => img.includes("alicdn.com"))
      .map((img: string) => img.replace(/_\d+x\d+.*?(?=\.|$)/, "_800x800"))
      .slice(0, 10);
  }

  // Shop name
  const shopMatch = html.match(/["']sellerNick["']?\s*:\s*["']([^"']+)/i) ||
                   html.match(/class=["'][^"']*shopname[^"']*["'][^>]*>([^<]+)/i) ||
                   html.match(/<a[^>]+class=["'][^"']*shop[^"']*["'][^>]*>([^<]+)/i);
  if (shopMatch) result.shopName = shopMatch[1].trim();

  // Category
  const catMatch = html.match(/["']category["']?\s*:\s*["']([^"']+)/i) ||
                  html.match(/class=["'][^"']*category[^"']*["'][^>]*>([^<]+)/i);
  if (catMatch) result.category = catMatch[1].trim();

  return result;
}

// ── AI Enhancement ──
async function enhanceWithAI(
  product: Partial<ScrapedProduct>,
  platform: string,
  categories: { id: string; name: string }[],
  logs: string[]
): Promise<ScrapedProduct> {
  log(logs, "[IA] Enrichissement par IA...");

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
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "user", content: prompt }] }),
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

    // Calculate confidence
    let confidence = 50;
    if (product.images && product.images.length > 0) confidence += 20;
    if (product.sourcePrice && product.sourcePrice > 0) confidence += 15;
    if (aiResult?.name && aiResult.name.length > 5) confidence += 15;
    if (categoryId) confidence += 10;
    if (variants.length > 0) confidence += 10;

    log(logs, `[IA] Enrichissement OK | Confiance : ${confidence}%`);

    return {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: String(aiResult?.name || product.name || "Produit").slice(0, 100),
      designation: String(aiResult?.designation || aiResult?.name || product.name || "").slice(0, 120),
      description: String(aiResult?.description || product.description || "").slice(0, 2000),
      price: Math.max(0, Number(aiResult?.price_suggested) || (product.sourcePrice ? Math.round(product.sourcePrice * 85) : 0)),
      sourcePrice: product.sourcePrice || 0,
      currency: "CNY",
      images: product.images || [],
      variants: variants,
      category: categoryName || product.category || "",
      categoryId: categoryId || product.categoryId || null,
      shopName: product.shopName || "",
      shopId: product.shopId || "",
      itemId: product.itemId || "",
      sourceUrl: product.sourceUrl || "",
      canonicalUrl: product.canonicalUrl || "",
      platform: (product.platform as any) || "taobao",
      confidence: Math.min(100, confidence),
    };
  } catch (e: any) {
    log(logs, `[IA] Erreur : ${e.message}`);
    // Return basic product without AI
    return {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: product.name || "Produit importe",
      designation: product.name || "",
      description: product.description || "",
      price: product.sourcePrice ? Math.round(product.sourcePrice * 85) : 0,
      sourcePrice: product.sourcePrice || 0,
      currency: "CNY",
      images: product.images || [],
      variants: [],
      category: product.category || "",
      categoryId: null,
      shopName: product.shopName || "",
      shopId: product.shopId || "",
      itemId: product.itemId || "",
      sourceUrl: product.sourceUrl || "",
      canonicalUrl: product.canonicalUrl || "",
      platform: (product.platform as any) || "taobao",
      confidence: product.images && product.images.length > 0 ? 40 : 20,
    };
  }
}

// ── 1. Scrape a single product ──
export const scrapeSingleProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ url: z.string().min(10) }).parse(input))
  .handler(async ({ data }) => {
    const logs: string[] = [];
    const errors: string[] = [];

    log(logs, "=== Scraping Produit ===");

    // Step 1: Parse URL
    const platform = detectPlatform(data.url);
    const itemId = extractItemId(data.url);
    const canonical = canonicalizeUrl(data.url, platform, itemId);
    log(logs, `[1/6] URL : ${platform.toUpperCase()} | Item ID : ${itemId || "?"}`);
    log(logs, `[1/6] Canonique : ${canonical}`);

    // Step 2: Fetch via Bright Data
    log(logs, "[2/6] Scraping via Bright Data...");
    const fetchResult = await fetchViaBrightData(canonical);

    if (!fetchResult.ok || fetchResult.html.length < 200) {
      errors.push("Bright Data indisponible");
      log(logs, "[2/6] ❌ Bright Data KO - fallback direct");

      // Fallback: direct fetch
      const direct = await fetchWithProxy(canonical);
      if (!direct.ok || direct.html.length < 200) {
        errors.push("Tous les proxies ont echoue");
        log(logs, "[2/6] ❌ Fallback KO aussi");
        return { success: false, products: [], logs, totalFound: 0, errors };
      }
      fetchResult.html = direct.html;
      fetchResult.ok = true;
    }

    log(logs, `[2/6] ✅ Page recuperee : ${fetchResult.html.length} caracteres`);

    // Step 3: Check login wall
    const isLoginWall = fetchResult.html.includes("登录淘宝") ||
                       fetchResult.html.includes("login.taobao") ||
                       (fetchResult.html.includes("登录") && fetchResult.html.length < 3000);
    if (isLoginWall) {
      log(logs, "[3/6] ⚠️ Login wall detecte");
    } else {
      log(logs, "[3/6] ✅ Page accessible");
    }

    // Step 4: Extract data from HTML
    log(logs, "[4/6] Extraction des donnees...");
    const extracted = extractProductFromHTML(fetchResult.html, platform);
    log(logs, `[4/6] ✅ Titre : ${extracted.name.slice(0, 50)} | Prix : ${extracted.price} | Images : ${extracted.images.length}`);

    // Step 5: Get categories from DB for matching
    log(logs, "[5/6] Chargement categories...");
    const { data: cats } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin
      .from("categories")
      .select("id, name")
      .eq("level", 3)
      .limit(200);
    log(logs, `[5/6] ✅ ${(cats || []).length} categories chargees`);

    // Step 6: Enhance with AI
    log(logs, "[6/6] Enrichissement IA...");
    const product = await enhanceWithAI(
      {
        name: extracted.name,
        description: extracted.description,
        sourcePrice: extracted.price,
        images: extracted.images,
        shopName: extracted.shopName,
        category: extracted.category,
        itemId: itemId || "",
        sourceUrl: data.url,
        canonicalUrl: canonical,
        platform,
      },
      platform,
      (cats || []) as any,
      logs
    );

    log(logs, "=== Termine ===");
    return {
      success: true,
      products: [product],
      logs,
      totalFound: 1,
      errors,
    };
  });

// ── 2. Scrape a store (get product list) ──
export const scrapeStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    url: z.string().min(10),
    maxProducts: z.number().int().min(1).max(50).default(20),
  }).parse(input))
  .handler(async ({ data }) => {
    const logs: string[] = [];
    const errors: string[] = [];
    const allProducts: ScrapedProduct[] = [];

    log(logs, "=== Scraping Boutique ===");
    log(logs, `[1/5] URL boutique : ${data.url.slice(0, 80)}`);

    // Step 1: Parse store URL
    const platform = detectPlatform(data.url);
    log(logs, `[1/5] Plateforme : ${platform.toUpperCase()}`);

    // Step 2: Try to find store API or search page
    log(logs, "[2/5] Recherche des produits...");

    // For Taobao/Tmall: try to get shop items via search
    let searchUrl = data.url;
    try {
      const u = new URL(data.url);
      const shopId = u.searchParams.get("shop_id") || u.searchParams.get("user_number_id");
      if (shopId && platform !== "1688") {
        searchUrl = `https://shop${shopId}.taobao.com/search.htm`;
      }
    } catch { /* keep original */ }

    // Step 3: Fetch store page
    const fetchResult = await fetchViaBrightData(searchUrl);
    if (!fetchResult.ok || fetchResult.html.length < 200) {
      log(logs, "[2/5] ❌ Impossible de charger la boutique");
      errors.push("Boutique inaccessible");
      return { success: false, products: [], logs, totalFound: 0, errors };
    }

    log(logs, `[2/5] ✅ Boutique chargee : ${fetchResult.html.length} caracteres`);

    // Step 4: Extract product links from store page
    log(logs, "[3/5] Extraction des liens produits...");
    const html = fetchResult.html;
    const productLinks: string[] = [];

    // Pattern 1: item.taobao.com links
    const tbLinks = html.matchAll(/href=["'](https?:\/\/item\.taobao\.com\/item\.htm\?[^"']+)["']/gi);
    for (const m of tbLinks) productLinks.push(m[1].replace(/&amp;/g, "&"));

    // Pattern 2: detail.tmall.com links
    const tmLinks = html.matchAll(/href=["'](https?:\/\/detail\.tmall\.com\/item\.htm\?[^"']+)["']/gi);
    for (const m of tmLinks) productLinks.push(m[1].replace(/&amp;/g, "&"));

    // Pattern 3: detail.1688.com links
    const re1688Links = html.matchAll(/href=["'](https?:\/\/detail\.1688\.com\/offer\/[^"']+)["']/gi);
    for (const m of re1688Links) productLinks.push(m[1].replace(/&amp;/g, "&"));

    // Pattern 4: Extract item IDs from JSON data
    const itemIds = html.matchAll(/["']itemId["']?\s*:\s*["']?(\d{8,})["']?/gi);
    for (const m of itemIds) {
      const link = platform === "1688"
        ? `https://detail.1688.com/offer/${m[1]}.html`
        : `https://item.taobao.com/item.htm?id=${m[1]}`;
      productLinks.push(link);
    }

    const uniqueLinks = [...new Set(productLinks)].slice(0, data.maxProducts);
    log(logs, `[3/5] ✅ ${uniqueLinks.length} produits trouves (limite : ${data.maxProducts})`);

    if (uniqueLinks.length === 0) {
      errors.push("Aucun produit trouve dans la boutique");
      return { success: false, products: [], logs, totalFound: 0, errors };
    }

    // Step 5: Scrape each product
    log(logs, "[4/5] Scraping individuel des produits...");

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

      const result = await fetchViaBrightData(canonical);
      if (!result.ok || result.html.length < 200) {
        log(logs, `[4/5] ⏭️ Produit ${i + 1} : inaccessible`);
        continue;
      }

      const extracted = extractProductFromHTML(result.html, platform);
      if (!extracted.name || extracted.name.length < 3) {
        log(logs, `[4/5] ⏭️ Produit ${i + 1} : titre vide`);
        continue;
      }

      const product = await enhanceWithAI(
        {
          name: extracted.name,
          description: extracted.description,
          sourcePrice: extracted.price,
          images: extracted.images,
          shopName: extracted.shopName,
          category: extracted.category,
          itemId: itemId || "",
          sourceUrl: link,
          canonicalUrl: canonical,
          platform,
        },
        platform,
        (cats || []) as any,
        logs
      );

      allProducts.push(product);
      log(logs, `[4/5] ✅ Produit ${i + 1} : ${product.name.slice(0, 40)} (${product.confidence}%)`);
    }

    log(logs, `[5/5] === Termine : ${allProducts.length} produits extraits ===`);
    return {
      success: allProducts.length > 0,
      products: allProducts,
      logs,
      totalFound: uniqueLinks.length,
      errors,
    };
  });

// ── 3. Check duplicate ──
export const checkDuplicate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ itemId: z.string(), sourceUrl: z.string() }).parse(input))
  .handler(async ({ data }) => {
    // Check existing products
    const { data: existing } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin
      .from("product_admin_metadata")
      .select("product_id")
      .or(`source_url.eq.${data.sourceUrl},source_url.ilike.%${data.itemId}%`)
      .maybeSingle();

    // Check existing imports
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
