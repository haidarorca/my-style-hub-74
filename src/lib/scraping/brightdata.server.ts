/**
 * brightdata.server.ts
 * --------------------
 * Moteur de scraping Taobao / Tmall / 1688 via Bright Data.
 * Server-only — ne jamais importer côté client.
 *
 * Flow:
 *   1. Détecte la plateforme depuis l'URL.
 *   2. Essaie Bright Data Browser/Web Unlocker si une zone est configurée.
 *   3. Essaie le dataset Bright Data correspondant.
 *   4. Essaie Firecrawl en dernier recours.
 *   5. Valide strictement avant de renvoyer un NormalizedProduct.
 *
 * Fallback : si Bright Data échoue ou n'est pas configuré, retourne null
 * (l'appelant peut alors basculer sur Firecrawl).
 */

export type Platform = "taobao" | "tmall" | "1688" | "unknown";

export interface NormalizedVariant {
  size: string;
  color: string;
  colorHex: string;
  stock: number;
  price?: number; // prix par variante en monnaie source
  imageUrl?: string;
  sku?: string;
}

export interface NormalizedProduct {
  platform: Platform;
  sourceUrl: string;
  sourceProductId: string | null;
  title: string;
  description: string;
  priceMin: number; // monnaie source
  priceMax: number;
  currency: string; // "CNY"
  images: string[]; // HD, dédupliquées
  variants: NormalizedVariant[];
  vendorName: string | null;
  extractionSource?: "brightdata_browser" | "brightdata_dataset" | "firecrawl" | "html";
  raw: unknown; // payload brut pour debug
}

export interface ProductValidationResult {
  valid: boolean;
  reason: string | null;
  issues: string[];
}

// ──────────────────────────────────────────────
// Détection plateforme + résolution liens courts

export function detectPlatform(url: string): Platform {
  if (/(?:^|\.)1688\.com/i.test(url)) return "1688";
  if (/(?:^|\.)(?:tmall|tmall\.hk)\.(?:com|hk)|detail\.tmall\./i.test(url)) return "tmall";
  if (/(?:^|\.)(?:taobao|tb|worldtaobao)\.(?:com|cn)|item\.taobao\./i.test(url)) return "taobao";
  return "unknown";
}

function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    const id = u.searchParams.get("id") || u.searchParams.get("itemId") || u.searchParams.get("item_id");
    const platform = detectPlatform(u.toString());
    if (id && /^\d{5,}$/.test(id) && (platform === "taobao" || platform === "tmall")) {
      const host = platform === "tmall" ? "detail.tmall.com" : "item.taobao.com";
      return `https://${host}/item.htm?id=${id}`;
    }
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Résout les liens courts Taobao (click.world.taobao.com, m.tb.cn, ...).
 * Suit jusqu'à 5 redirections et renvoie l'URL finale item.htm.
 */
export async function resolveTaobaoShortLink(url: string): Promise<string> {
  if (!/(?:click\.world\.taobao\.com|m\.tb\.cn|s\.click\.taobao\.com|uland\.taobao\.com|item\.world\.taobao\.com|tb\.cn|taobao\.com|tmall\.com)/i.test(url)) {
    return canonicalizeUrl(url);
  }
  let current = url;
  for (let i = 0; i < 8; i++) {
    try {
      const r = await fetch(current, {
        method: i === 0 ? "GET" : "HEAD",
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7,fr;q=0.6",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      const loc = r.headers.get("location");
      if (!loc) {
        const text = await r.text().catch(() => "");
        const embedded = text.match(/https?:\\?\/\\?\/(?:item\.taobao\.com|detail\.tmall\.com)[^"'\\\s<>]+/i)?.[0]
          ?.replace(/\\\//g, "/")
          ?.replace(/&amp;/g, "&");
        if (embedded) current = embedded;
        break;
      }
      current = new URL(loc, current).toString();
      if (/item\.taobao\.com\/item\.htm|detail\.tmall\.com\/item\.htm/i.test(current)) break;
    } catch {
      break;
    }
  }
  return canonicalizeUrl(current);
}

export function extractSourceProductId(url: string, platform: Platform): string | null {
  try {
    const u = new URL(url);
    if (platform === "taobao" || platform === "tmall") {
      const id = u.searchParams.get("id");
      if (id && /^\d+$/.test(id)) return id;
    }
    if (platform === "1688") {
      const m = u.pathname.match(/offer\/(\d+)\.html/i);
      if (m) return m[1];
    }
  } catch {
    // ignore
  }
  return null;
}

// ──────────────────────────────────────────────
// Bright Data API

const BRIGHTDATA_BASE = "https://api.brightdata.com/datasets/v3";

function datasetIdFor(platform: Platform): string | null {
  switch (platform) {
    case "taobao":
      return process.env.BRIGHTDATA_DATASET_TAOBAO_PRODUCT ?? null;
    case "tmall":
      return (
        process.env.BRIGHTDATA_DATASET_TMALL_PRODUCT ??
        process.env.BRIGHTDATA_DATASET_TAOBAO_PRODUCT ??
        null
      );
    case "1688":
      return process.env.BRIGHTDATA_DATASET_1688_PRODUCT ?? null;
    default:
      return null;
  }
}

export function shopDatasetIdFor(platform: Platform): string | null {
  switch (platform) {
    case "taobao":
    case "tmall":
      return process.env.BRIGHTDATA_DATASET_TAOBAO_SHOP ?? null;
    case "1688":
      return process.env.BRIGHTDATA_DATASET_1688_SHOP ?? null;
    default:
      return null;
  }
}

/**
 * Trigger un dataset Bright Data et poll jusqu'à récupération du snapshot.
 * Retourne le tableau d'enregistrements bruts ou null en cas d'échec.
 */
export async function triggerAndPoll(
  datasetId: string,
  inputs: Array<Record<string, unknown>>,
  opts: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<unknown[] | null> {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) return null;

  const timeoutMs = opts.timeoutMs ?? 90_000;
  const pollIntervalMs = opts.pollIntervalMs ?? 3_000;

  // 1. Trigger
  let snapshotId: string;
  try {
    const triggerUrl = `${BRIGHTDATA_BASE}/trigger?dataset_id=${encodeURIComponent(datasetId)}&include_errors=true`;
    const r = await fetch(triggerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(inputs),
    });
    if (!r.ok) {
      console.error(`[BrightData] trigger HTTP ${r.status}:`, await r.text().catch(() => ""));
      return null;
    }
    const j = (await r.json()) as { snapshot_id?: string; id?: string };
    snapshotId = j.snapshot_id ?? j.id ?? "";
    if (!snapshotId) {
      console.error("[BrightData] trigger: pas de snapshot_id");
      return null;
    }
  } catch (e) {
    console.error("[BrightData] trigger error:", e);
    return null;
  }

  // 2. Poll
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    try {
      const progressUrl = `${BRIGHTDATA_BASE}/progress/${snapshotId}`;
      const r = await fetch(progressUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!r.ok) continue;
      const j = (await r.json()) as { status?: string };
      const status = (j.status ?? "").toLowerCase();
      if (status === "ready" || status === "done" || status === "completed") {
        // Fetch snapshot
        const snapUrl = `${BRIGHTDATA_BASE}/snapshot/${snapshotId}?format=json`;
        const sr = await fetch(snapUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
        if (!sr.ok) {
          console.error(`[BrightData] snapshot fetch HTTP ${sr.status}`);
          return null;
        }
        const text = await sr.text();
        // Bright Data peut renvoyer du JSON Lines ou un tableau JSON
        try {
          const parsed = JSON.parse(text);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
          const out: unknown[] = [];
          for (const line of lines) {
            try { out.push(JSON.parse(line)); } catch { /* skip */ }
          }
          return out;
        }
      }
      if (status === "failed" || status === "error") {
        console.error("[BrightData] snapshot failed:", j);
        return null;
      }
    } catch {
      // continue polling
    }
  }
  console.error("[BrightData] timeout polling snapshot", snapshotId);
  return null;
}

// ──────────────────────────────────────────────
// Normalisation des records bruts → NormalizedProduct

function pickStr(o: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function pickNum(o: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v.replace(/[^\d.]/g, ""));
      if (isFinite(n) && n > 0) return n;
    }
  }
  return 0;
}

function pickArray(o: Record<string, unknown>, ...keys: string[]): unknown[] {
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function normalizeImages(record: Record<string, unknown>): string[] {
  const candidates: unknown[] = [
    ...pickArray(record, "images", "image_urls", "product_images", "gallery", "pictures"),
  ];
  const single = pickStr(record, "image", "main_image", "thumbnail", "cover_image");
  if (single) candidates.unshift(single);

  const out: string[] = [];
  for (const c of candidates) {
    let url = "";
    if (typeof c === "string") url = c;
    else if (c && typeof c === "object") {
      const r = c as Record<string, unknown>;
      url = pickStr(r, "url", "src", "image_url", "large_url", "full");
    }
    if (!url) continue;
    if (url.startsWith("//")) url = "https:" + url;
    // Force HD : remove _xxxxx.jpg style thumbs for Taobao
    url = url.replace(/_\d+x\d+(?:Q\d+)?\.(jpe?g|png|webp)(?:_\.webp)?$/i, ".$1");
    if (/^https?:\/\//i.test(url)) out.push(url);
  }
  return Array.from(new Set(out)).slice(0, 15);
}

function normalizeVariants(record: Record<string, unknown>): NormalizedVariant[] {
  const raw = pickArray(record, "variants", "skus", "sku_list", "product_variants", "specifications");
  const out: NormalizedVariant[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const size = pickStr(r, "size", "spec_size", "尺寸");
    const color = pickStr(r, "color", "spec_color", "颜色", "name", "title");
    const colorHexRaw = pickStr(r, "color_hex", "hex");
    const stock = pickNum(r, "stock", "quantity", "available", "inventory");
    const price = pickNum(r, "price", "sale_price", "current_price");
    const imageUrl = pickStr(r, "image", "image_url", "thumbnail");
    const sku = pickStr(r, "sku", "sku_id", "id");
    if (!size && !color) continue;
    out.push({
      size,
      color,
      colorHex: /^#[0-9a-fA-F]{6}$/.test(colorHexRaw) ? colorHexRaw : "",
      stock: Math.max(0, Math.floor(stock)),
      price: price > 0 ? price : undefined,
      imageUrl: imageUrl || undefined,
      sku: sku || undefined,
    });
  }
  return out.slice(0, 50);
}

function normalizeRecord(record: unknown, sourceUrl: string, platform: Platform): NormalizedProduct {
  const r = (record && typeof record === "object" ? record : {}) as Record<string, unknown>;
  const title = pickStr(r, "title", "name", "product_name", "item_title");
  const description = pickStr(r, "description", "desc", "product_description", "details");
  const priceMin = pickNum(r, "price_min", "min_price", "price", "current_price", "sale_price");
  const priceMax = pickNum(r, "price_max", "max_price", "original_price") || priceMin;
  const currency = pickStr(r, "currency") || "CNY";
  const images = normalizeImages(r);
  const variants = normalizeVariants(r);
  const vendorName = pickStr(r, "seller_name", "shop_name", "vendor", "store_name") || null;
  const sourceProductId =
    pickStr(r, "product_id", "item_id", "id", "offer_id") || extractSourceProductId(sourceUrl, platform);

  return {
    platform,
    sourceUrl,
    sourceProductId: sourceProductId || null,
    title,
    description,
    priceMin,
    priceMax,
    currency,
    images,
    variants,
    vendorName,
    raw: r,
  };
}

// ──────────────────────────────────────────────
// API publique

/**
 * Scrape un produit unique Taobao/Tmall/1688.
 * Renvoie null si Bright Data n'est pas configuré, échoue, ou plateforme inconnue.
 */
export async function scrapeProductWithBrightData(rawUrl: string): Promise<NormalizedProduct | null> {
  const url = await resolveTaobaoShortLink(rawUrl);
  const platform = detectPlatform(url);
  if (platform === "unknown") return null;

  const datasetId = datasetIdFor(platform);
  if (!datasetId) {
    console.warn(`[BrightData] dataset non configuré pour ${platform}`);
    return null;
  }

  const records = await triggerAndPoll(datasetId, [{ url }]);
  if (!records || records.length === 0) return null;

  return normalizeRecord(records[0], url, platform);
}

/**
 * Découvre les URLs produits d'une boutique Taobao/Tmall/1688.
 */
export async function discoverShopWithBrightData(
  shopUrl: string,
  limit: number,
): Promise<string[] | null> {
  const platform = detectPlatform(shopUrl);
  if (platform === "unknown") return null;

  const datasetId = shopDatasetIdFor(platform);
  if (!datasetId) return null;

  const records = await triggerAndPoll(datasetId, [{ url: shopUrl, limit }], {
    timeoutMs: 180_000,
  });
  if (!records) return null;

  const urls: string[] = [];
  for (const rec of records) {
    if (!rec || typeof rec !== "object") continue;
    const r = rec as Record<string, unknown>;
    const u = pickStr(r, "url", "product_url", "item_url", "link");
    if (u && /^https?:\/\//i.test(u)) urls.push(u);
  }
  return Array.from(new Set(urls)).slice(0, limit);
}
