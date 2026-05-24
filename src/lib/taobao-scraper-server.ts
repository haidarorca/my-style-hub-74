/**
 * taobao-scraper-server.ts
 * ------------------------
 * Fonctions serveur pour le scraping Taobao via Bright Data proxy.
 * S'executent cote serveur (pas dans le navigateur).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Bright Data proxy config
const BRIGHTDATA_PROXY = process.env.BRIGHTDATA_PROXY || "https://brd-customer-hl_91aa54ca-zone-scraping_browser1:63fq825zh7ex@brd.superproxy.io:22225";

// ── Helper: fetch via Bright Data proxy ──
async function fetchViaProxy(url: string, opts: RequestInit = {}): Promise<{ html: string; status: number; ok: boolean }> {
  try {
    // Parse proxy URL
    const proxyUrl = new URL(BRIGHTDATA_PROXY);
    const proxyHost = proxyUrl.hostname;
    const proxyPort = proxyUrl.port || "22225";
    const proxyUser = proxyUrl.username;
    const proxyPass = proxyUrl.password;

    // Build target URL with proxy auth
    const target = new URL(url);
    const proxyEndpoint = `https://${proxyHost}:${proxyPort}`;

    const res = await fetch(proxyEndpoint, {
      ...opts,
      headers: {
        ...opts.headers,
        "Proxy-Authorization": `Basic ${Buffer.from(`${proxyUser}:${proxyPass}`).toString("base64")}`,
        "X-BRD-Url": url,
        "X-BRD-Response-Format": "html",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(20000),
    });

    const html = await res.text();
    return { html, status: res.status, ok: res.ok };
  } catch (e: any) {
    return { html: "", status: 0, ok: false };
  }
}

// ── Alternative: direct fetch with allorigins proxy ──
async function fetchViaAllOrigins(url: string): Promise<{ html: string; status: number; ok: boolean }> {
  try {
    const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}&timeout=15000`, {
      signal: AbortSignal.timeout(20000),
    });
    const html = await res.text();
    return { html, status: res.status, ok: res.ok };
  } catch {
    return { html: "", status: 0, ok: false };
  }
}

// ── 1. Scrape a product page ──
export const scrapeTaobaoProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ url: z.string().url() }).parse(input))
  .handler(async ({ data }) => {
    const logs: string[] = [];
    const log = (msg: string) => logs.push(msg);

    log(`[1/4] URL recue : ${data.url.slice(0, 60)}`);

    // Try Bright Data first
    log("[2/4] Tentative via Bright Data proxy...");
    let result = await fetchViaProxy(data.url);

    // Fallback to allorigins
    if (!result.ok || result.html.length < 500) {
      log("[2/4] Bright Data indisponible - fallback allorigins...");
      result = await fetchViaAllOrigins(data.url);
    }

    if (!result.ok || result.html.length < 100) {
      log("[3/4] ❌ Impossible de recuperer la page");
      return { success: false, logs, data: null };
    }

    log(`[3/4] Page recuperee : ${result.html.length} caracteres`);

    // Extract data from HTML
    const html = result.html;

    // Title
    const titleMatch = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
    let title = titleMatch?.[1]?.trim() || "";
    title = title.replace(/ - 淘宝|\s*-\s*tmall|\s*-\s*阿里巴巴/gi, "").trim();

    // Check if login wall
    const isLoginWall = html.includes("登录") && html.includes("login") || html.length < 2000;
    if (isLoginWall) {
      log("[3/4] ⚠️ Login wall detecte - donnees limitees");
    }

    // Price
    const pricePatterns = [
      /"price["']?\s*[:=]\s*["']?(\d+[.,]?\d*)/i,
      /class=["'][^"']*price[^"']*["'][^>]*>(\d+[.,]?\d*)/i,
      /([\d,]+\.?\d*)\s*元/i,
      /&yen;\s*(\d+[.,]?\d*)/i,
    ];
    let price = 0;
    for (const re of pricePatterns) {
      const m = html.match(re);
      if (m) { price = parseFloat(m[1].replace(",", "")); break; }
    }

    // Images
    const imgRe = /https?:\/\/(?:img\.alicdn|gd\d*\.alicdn|sc\d*\.alicdn)[^\s'"<>]+/gi;
    const imgMatches = html.match(imgRe);
    const images = imgMatches ? [...new Set(imgMatches)].map((img: string) => img.replace(/_\d+x\d+/, "_800x800")).slice(0, 8) : [];

    // Item ID from URL
    let itemId: string | null = null;
    try {
      const u = new URL(data.url);
      itemId = u.searchParams.get("id") || u.pathname.match(/offer\/(\d+)/)?.[1] || null;
    } catch { /* ignore */ }

    // Platform detection
    let platform = "taobao";
    if (data.url.includes("1688")) platform = "1688";
    else if (data.url.includes("tmall")) platform = "tmall";

    // Extract description
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    let description = descMatch?.[1]?.trim() || "";
    if (description.length > 500) description = description.slice(0, 500);

    log(`[4/4] ✅ Extraction OK | Titre : ${title.slice(0, 40)} | Prix : ${price} | Images : ${images.length}`);

    return {
      success: true,
      logs,
      data: {
        name: title || "Produit importe",
        description,
        price: price ? Math.round(price * 85) : 0, // Convert to FCFA
        sourcePrice: price,
        currency: platform === "1688" ? "CNY" : "CNY",
        images,
        platform,
        itemId,
        sourceUrl: data.url,
        isLoginWall,
      },
    };
  });

// ── 2. Check if Bright Data is available ──
export const checkBrightDataStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    try {
      const test = await fetchViaProxy("https://httpbin.org/ip");
      return { available: test.ok, proxy: BRIGHTDATA_PROXY.includes("superproxy") ? "configured" : "missing" };
    } catch {
      return { available: false, proxy: "error" };
    }
  });
