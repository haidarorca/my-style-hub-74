import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Accès refusé : admin requis");
}

// ───────────────────────────────────────────────────────────
// 1) FX rates (cached in admin_stats_cache 12h, source open.er-api.com)
// ───────────────────────────────────────────────────────────

type RatePayload = { base: string; rates: Record<string, number>; fetched_at: string };

async function fetchRates(base: string): Promise<RatePayload> {
  const cacheKey = `fx_rates_${base.toUpperCase()}`;
  const { data: cached } = await supabaseAdmin
    .from("admin_stats_cache")
    .select("value, updated_at")
    .eq("key", cacheKey)
    .maybeSingle();
  if (cached) {
    const ageMs = Date.now() - new Date(cached.updated_at).getTime();
    if (ageMs < 12 * 60 * 60 * 1000) {
      return cached.value as unknown as RatePayload;
    }
  }
  const res = await fetch(`https://open.er-api.com/v6/latest/${base.toUpperCase()}`);
  if (!res.ok) throw new Error(`Erreur API devises (${res.status})`);
  const json = (await res.json()) as { result?: string; base_code?: string; rates?: Record<string, number> };
  if (json.result !== "success" || !json.rates) throw new Error("Réponse devises invalide");
  const payload: RatePayload = { base: json.base_code ?? base, rates: json.rates, fetched_at: new Date().toISOString() };
  await supabaseAdmin
    .from("admin_stats_cache")
    .upsert({ key: cacheKey, value: payload as never, updated_at: new Date().toISOString() });
  return payload;
}

export const getExchangeRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ from: z.string().length(3), to: z.string().length(3) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.from.toUpperCase() === data.to.toUpperCase()) {
      return { rate: 1, fetched_at: new Date().toISOString(), base: data.from.toUpperCase() };
    }
    const payload = await fetchRates(data.from);
    const rate = payload.rates[data.to.toUpperCase()];
    if (!rate) throw new Error(`Taux ${data.from}→${data.to} indisponible`);
    return { rate, fetched_at: payload.fetched_at, base: payload.base };
  });

// ───────────────────────────────────────────────────────────
// 2) AI analysis of pasted product text
// ───────────────────────────────────────────────────────────

function safeParseJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]) as Record<string, unknown>; } catch { return null; }
    }
    return null;
  }
}

const AnalyzeSchema = z.object({
  raw_text: z.string().min(5).max(20000),
  source_currency: z.enum(["CNY", "USD", "EUR", "XOF"]),
});

export const analyzeSourceProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AnalyzeSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway non configuré");

    // Load category names for guidance
    const { data: cats } = await supabaseAdmin
      .from("categories")
      .select("id, name, level")
      .eq("level", 3)
      .order("position")
      .limit(200);
    const catNames = (cats ?? []).map((c) => c.name).slice(0, 120).join(", ");

    const prompt = [
      "You analyse a product listing (often copy-pasted from Taobao/1688/AliExpress, may contain Chinese/English/mixed text and image URLs).",
      "Extract a clean French e-commerce product. Translate any Chinese/English to natural French.",
      "Rules:",
      "- name_fr: short product title in French (max 80 chars)",
      "- description_fr: clean paragraph in French (max 500 chars), no marketing fluff",
      `- source_price: extract the unit price as a number in ${data.source_currency} (no currency symbol). If multiple prices, pick the most plausible retail unit price.`,
      "- image_urls: array of image URLs found in the text (http/https only, deduplicated)",
      `- suggested_category: pick the BEST match from this list (return the exact string), or null if none fits: ${catNames}`,
      "- suggested_variants: array of {size, color, color_hex, stock, image_url} extracted from the text. Conventions: size = clothing/shoe size or dimension as a short string (e.g. 'S', 'M', 'L', '42', '10x15cm') or empty string if none. color = French color name (e.g. 'Rouge', 'Bleu marine') or empty string. color_hex = matching 6-digit hex like '#1e3a8a' or empty string. stock = integer estimate or 0 if unknown. image_url = http(s) image URL for this variant from the text or empty string. Deduplicate. Return [] if no variants are explicit.",
      'Return ONLY strict JSON: {"name_fr":"","description_fr":"","source_price":0,"image_urls":[],"suggested_category":null,"suggested_variants":[{"size":"","color":"","color_hex":"","stock":0,"image_url":""}]}',
      "",
      "Input:",
      data.raw_text,
    ].join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      if (res.status === 429) throw new Error("Limite IA atteinte, réessayez dans un instant.");
      if (res.status === 402) throw new Error("Crédits IA épuisés. Ajoutez du crédit dans les paramètres Lovable AI.");
      throw new Error(`Erreur IA (${res.status})`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = safeParseJson(raw);
    if (!parsed) throw new Error("Réponse IA illisible");

    let suggestedCategoryId: string | null = null;
    if (typeof parsed.suggested_category === "string" && parsed.suggested_category.trim()) {
      const match = (cats ?? []).find(
        (c) => c.name.toLowerCase() === (parsed.suggested_category as string).toLowerCase().trim(),
      );
      suggestedCategoryId = match?.id ?? null;
    }

    const rawVariants = Array.isArray(parsed.suggested_variants) ? (parsed.suggested_variants as unknown[]) : [];
    const cleanVariants = rawVariants
      .map((v) => {
        if (!v || typeof v !== "object") return null;
        const o = v as Record<string, unknown>;
        const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
        const num = (k: string) => {
          const n = typeof o[k] === "number" ? (o[k] as number) : Number(o[k]);
          return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
        };
        const hex = str("color_hex");
        const url = str("image_url");
        return {
          size: str("size").slice(0, 40),
          color: str("color").slice(0, 60),
          color_hex: /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "",
          stock: num("stock"),
          image_url: /^https?:\/\//.test(url) ? url : "",
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null && (v.size !== "" || v.color !== ""))
      .slice(0, 30);

    return {
      name_fr: typeof parsed.name_fr === "string" ? parsed.name_fr.trim() : "",
      description_fr: typeof parsed.description_fr === "string" ? parsed.description_fr.trim() : "",
      source_price: typeof parsed.source_price === "number" ? parsed.source_price : Number(parsed.source_price) || 0,
      image_urls: Array.isArray(parsed.image_urls)
        ? (parsed.image_urls as unknown[]).filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u))
        : [],
      suggested_category_id: suggestedCategoryId,
      suggested_category_name: typeof parsed.suggested_category === "string" ? parsed.suggested_category : null,
      suggested_variants: cleanVariants,
    };
  });

// ───────────────────────────────────────────────────────────
// 2b) Scrape a product URL via Apify, then run AI analysis
// ───────────────────────────────────────────────────────────

function detectCurrencyFromUrl(url: string): "CNY" | "USD" {
  const u = url.toLowerCase();
  if (
    u.includes("taobao.com") || u.includes("1688.com") || u.includes("tmall.com") ||
    u.includes("jd.com") || u.includes("tb.cn") || u.includes("tmall.hk")
  ) return "CNY";
  return "USD"; // aliexpress, amazon, etc.
}

// Extract the first http(s) URL from a free-form share text (Taobao mobile shares
// often look like: "【淘宝】...  https://e.tb.cn/h.xxxxx 复制链接...").
function extractUrlFromText(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    // Take only up to first whitespace
    const m = trimmed.match(/^(https?:\/\/\S+)/i);
    return m ? m[1] : trimmed;
  }
  const m = trimmed.match(/https?:\/\/[^\s'")<>\u4e00-\u9fff]+/i);
  return m ? m[0] : null;
}

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

// Resolve Taobao/1688 mobile short links (e.tb.cn, m.tb.cn, s.click...) to their
// final URL, and rewrite to the desktop canonical form when an item id is found.
async function resolveShareUrl(rawUrl: string): Promise<string> {
  let finalUrl = rawUrl;
  try {
    const res = await fetch(rawUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": MOBILE_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8,zh;q=0.7",
      },
      signal: AbortSignal.timeout(12000),
    });
    finalUrl = res.url || rawUrl;
    // Some Taobao shorts redirect into a JS-based interstitial; try to find a
    // refresh/canonical URL inside the body too.
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/html")) {
      const html = (await res.text().catch(() => "")).slice(0, 200_000);
      const meta = html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+url=([^"'>\s]+)/i);
      const canon = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
      const jsRedir = html.match(/(?:location\.href|window\.location)\s*=\s*["']([^"']+)["']/i);
      const cand = meta?.[1] || canon?.[1] || jsRedir?.[1];
      if (cand && /^https?:\/\//i.test(cand)) finalUrl = cand;
    }
  } catch {
    // Network/timeout — keep original; downstream scraper will still try.
  }

  // Normalize to desktop canonical when an item id is present.
  try {
    const u = new URL(finalUrl);
    const host = u.hostname.toLowerCase();
    const id = u.searchParams.get("id") || u.searchParams.get("itemId");
    if (id && /^\d{6,}$/.test(id)) {
      if (host.includes("taobao") || host.includes("tmall") || host.includes("tb.cn")) {
        return `https://item.taobao.com/item.htm?id=${id}`;
      }
      if (host.includes("1688")) {
        return `https://detail.1688.com/offer/${id}.html`;
      }
    }
  } catch {
    // ignore URL parse errors
  }
  return finalUrl;
}

// Lightweight HTML fallback: fetch the page directly with a mobile UA and pull
// title, OG image, JSON-LD images. Used when Apify fails or returns empty.
async function scrapeViaDirectFetch(url: string): Promise<{ text: string; images: string[] } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": MOBILE_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8,zh;q=0.7",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 400_000);
    const titleM = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    const ogDesc = html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]+content=["']([^"']+)["']/i);
    const ogImgs: string[] = [];
    const imgRe = /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = imgRe.exec(html))) ogImgs.push(m[1]);
    const linkImgRe = /<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpe?g|png|webp|gif|avif)(?:\?[^"']*)?)["']/gi;
    while ((m = linkImgRe.exec(html))) ogImgs.push(m[1]);
    const images = Array.from(new Set(ogImgs)).slice(0, 12);

    const title = (ogTitle?.[1] || titleM?.[1] || "").trim();
    const desc = (ogDesc?.[1] || "").trim();
    if (!title && images.length === 0) return null;

    return {
      text: `Titre: ${title}\n\nDescription: ${desc}`.slice(0, 4000),
      images,
    };
  } catch {
    return null;
  }
}

// Heuristic: page content looks like a login wall.
function looksLikeLoginWall(text: string): boolean {
  const s = text.toLowerCase();
  return (
    s.includes("请登录") || s.includes("登录后") || s.includes("亲，请登录") ||
    s.includes("sign in to continue") || /\bplease\s+log\s*in\b/.test(s) ||
    s.includes("login.taobao.com") || s.includes("login.1688.com")
  );
}

async function scrapeViaApify(url: string): Promise<{ text: string; images: string[] }> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN non configuré");

  // apify/website-content-crawler — generic, returns markdown of a single page
  const endpoint = `https://api.apify.com/v2/acts/apify~website-content-crawler/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=90`;
  const body = {
    startUrls: [{ url }],
    crawlerType: "playwright:adaptive",
    maxCrawlPages: 1,
    maxCrawlDepth: 0,
    saveMarkdown: true,
    saveHtml: false,
    saveScreenshots: false,
    proxyConfiguration: { useApifyProxy: true },
    requestTimeoutSecs: 60,
  };
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Apify a refusé la requête (${res.status}). ${txt.slice(0, 200)}`);
  }
  const items = (await res.json()) as Array<{
    markdown?: string;
    text?: string;
    url?: string;
    metadata?: { title?: string; description?: string };
    screenshotUrl?: string;
  }>;
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Apify n'a rien retourné pour cette URL (peut-être bloquée).");
  }
  const it = items[0];
  const title = it.metadata?.title ?? "";
  const desc = it.metadata?.description ?? "";
  const md = it.markdown ?? it.text ?? "";
  // Extract image URLs from markdown ![](url) and bare http(s) img links
  const imgRe = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s")]+\.(?:jpe?g|png|webp|gif|avif)(?:\?[^\s")]*)?)/gi;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(md))) {
    const u = m[1] || m[2];
    if (u) set.add(u);
  }
  return {
    text: `Titre: ${title}\n\nDescription: ${desc}\n\n${md}`.slice(0, 18000),
    images: Array.from(set).slice(0, 20),
  };
}

async function downloadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KawZoneBot/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > 6 * 1024 * 1024) return null;
    let bin = "";
    for (let i = 0; i < buf.byteLength; i++) bin += String.fromCharCode(buf[i]);
    const b64 = btoa(bin);
    return `data:${ct};base64,${b64}`;
  } catch {
    return null;
  }
}

const AnalyzeUrlSchema = z.object({
  url: z.string().url().max(2000),
});

export const analyzeSourceUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AnalyzeUrlSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway non configuré");

    const currency = detectCurrencyFromUrl(data.url);

    // 1) Scrape page
    const scraped = await scrapeViaApify(data.url);

    // 2) Category guidance
    const { data: cats } = await supabaseAdmin
      .from("categories")
      .select("id, name, level")
      .eq("level", 3)
      .order("position")
      .limit(200);
    const catNames = (cats ?? []).map((c) => c.name).slice(0, 120).join(", ");

    // 3) AI extraction (same prompt as analyzeSourceProduct, augmented with scraped images)
    const enrichedText = scraped.text + "\n\nImages détectées:\n" + scraped.images.join("\n");
    const prompt = [
      "You analyse a product listing scraped from Taobao/1688/AliExpress (may contain Chinese/English/mixed text and image URLs).",
      "Extract a clean French e-commerce product. Translate any Chinese/English to natural French.",
      "Rules:",
      "- name_fr: short product title in French (max 80 chars)",
      "- description_fr: clean paragraph in French (max 500 chars), no marketing fluff",
      `- source_price: unit price as a number in ${currency} (no symbol). If multiple, pick the most plausible retail unit price.`,
      "- image_urls: array of product image URLs from the text (http/https only, deduplicated, max 8)",
      `- suggested_category: pick the BEST match from this list (return the exact string), or null: ${catNames}`,
      "- suggested_variants: array of {size, color, color_hex, stock, image_url}. size=clothing/shoe size or dimension. color=French color name. color_hex=6-digit hex or ''. stock=integer or 0. Return [] if none explicit.",
      'Return ONLY strict JSON: {"name_fr":"","description_fr":"","source_price":0,"image_urls":[],"suggested_category":null,"suggested_variants":[]}',
      "",
      "Input:",
      enrichedText,
    ].join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      if (res.status === 429) throw new Error("Limite IA atteinte, réessayez dans un instant.");
      if (res.status === 402) throw new Error("Crédits IA épuisés.");
      throw new Error(`Erreur IA (${res.status})`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = safeParseJson(json.choices?.[0]?.message?.content?.trim() ?? "");
    if (!parsed) throw new Error("Réponse IA illisible");

    // 4) Resolve category id
    let suggestedCategoryId: string | null = null;
    if (typeof parsed.suggested_category === "string" && parsed.suggested_category.trim()) {
      const match = (cats ?? []).find(
        (c) => c.name.toLowerCase() === (parsed.suggested_category as string).toLowerCase().trim(),
      );
      suggestedCategoryId = match?.id ?? null;
    }

    // 5) FX rate
    let fxRate = 1;
    if (currency === "CNY") {
      const { data: s } = await supabaseAdmin
        .from("site_settings")
        .select("cny_to_xof_rate")
        .eq("id", "main")
        .maybeSingle();
      fxRate = Number((s as { cny_to_xof_rate?: number } | null)?.cny_to_xof_rate ?? 85);
    } else if (currency === "USD") {
      try {
        const payload = await fetchRates("USD");
        fxRate = payload.rates["XOF"] ?? 600;
      } catch {
        fxRate = 600;
      }
    }
    const sourcePrice =
      typeof parsed.source_price === "number" ? parsed.source_price : Number(parsed.source_price) || 0;
    const suggestedPriceXof = Math.round(sourcePrice * fxRate);

    // 6) Download images server-side (bypass CORS) — limit to 6 to keep payload small
    const aiImageUrls = Array.isArray(parsed.image_urls)
      ? (parsed.image_urls as unknown[]).filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u))
      : [];
    const allImageUrls = Array.from(new Set([...aiImageUrls, ...scraped.images])).slice(0, 6);
    const imageDataUrls: string[] = [];
    for (const u of allImageUrls) {
      const d = await downloadImageAsDataUrl(u);
      if (d) imageDataUrls.push(d);
      if (imageDataUrls.length >= 6) break;
    }

    // 7) Clean variants
    const rawVariants = Array.isArray(parsed.suggested_variants) ? (parsed.suggested_variants as unknown[]) : [];
    const cleanVariants = rawVariants
      .map((v) => {
        if (!v || typeof v !== "object") return null;
        const o = v as Record<string, unknown>;
        const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
        const num = (k: string) => {
          const n = typeof o[k] === "number" ? (o[k] as number) : Number(o[k]);
          return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
        };
        const hex = str("color_hex");
        return {
          size: str("size").slice(0, 40),
          color: str("color").slice(0, 60),
          color_hex: /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "",
          stock: num("stock"),
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null && (v.size !== "" || v.color !== ""))
      .slice(0, 20);

    return {
      source_currency: currency,
      fx_rate: fxRate,
      source_price: sourcePrice,
      suggested_price_xof: suggestedPriceXof,
      name_fr: typeof parsed.name_fr === "string" ? parsed.name_fr.trim() : "",
      description_fr: typeof parsed.description_fr === "string" ? parsed.description_fr.trim() : "",
      suggested_category_id: suggestedCategoryId,
      suggested_category_name: typeof parsed.suggested_category === "string" ? parsed.suggested_category : null,
      suggested_variants: cleanVariants,
      images: imageDataUrls, // data URLs ready to convert to File on the client
    };
  });

// ───────────────────────────────────────────────────────────
// 3) Publish generated product into an admin shop
// ───────────────────────────────────────────────────────────

const VariantSchema = z.object({
  size: z.string().trim().max(40).optional().default(""),
  color: z.string().trim().max(60).optional().default(""),
  color_hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal("")).default(""),
  stock: z.number().int().min(0).max(1_000_000).default(0),
  price_override: z.number().min(0).max(50_000_000).nullable().optional(),
  image_url: z.string().url().optional().or(z.literal("")).default(""),
});

const PublishSchema = z.object({
  shop_id: z.string().uuid(),
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  price_xof: z.number().min(0).max(50_000_000),
  category_id: z.string().uuid().nullable(),
  image_urls: z.array(z.string().url()).min(1).max(10),
  variants: z.array(VariantSchema).max(50).default([]),
});

export const publishGeneratedProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PublishSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // Verify shop exists and is admin shop
    const { data: shop, error: sErr } = await supabaseAdmin
      .from("profiles")
      .select("id, is_admin_shop")
      .eq("id", data.shop_id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!shop || !(shop as { is_admin_shop: boolean }).is_admin_shop) {
      throw new Error("Boutique admin introuvable");
    }

    const { data: duplicate, error: dupErr } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("vendor_id", data.shop_id)
      .eq("code", data.code)
      .maybeSingle();
    if (dupErr) throw new Error(dupErr.message);
    if (duplicate) throw new Error("Ce code produit existe déjà dans cette boutique.");

    // Insert product (auto-approved since admin)
    const { data: prod, error: pErr } = await supabaseAdmin
      .from("products")
      .insert({
        vendor_id: data.shop_id,
        name: data.name,
        code: data.code,
        description: data.description ?? null,
        price: data.price_xof,
        category_id: data.category_id,
        status: "approved",
      })
      .select("id")
      .single();
    if (pErr) {
      if (pErr.message.includes("unique") || pErr.message.includes("duplicate")) {
        throw new Error("Ce code produit existe déjà dans cette boutique.");
      }
      throw new Error(pErr.message);
    }
    const productId = prod.id as string;

    const imageRows = data.image_urls.map((url, i) => ({ product_id: productId, url, position: i }));
    const { error: iErr } = await supabaseAdmin.from("product_images").insert(imageRows);
    if (iErr) throw new Error(`Images : ${iErr.message}`);

    if (data.variants.length > 0) {
      const variantRows = data.variants.map((v) => ({
        product_id: productId,
        size: v.size?.trim() || null,
        color: v.color?.trim() || null,
        color_hex: v.color_hex && v.color_hex.length > 0 ? v.color_hex : null,
        stock: v.stock ?? 0,
        price_override: v.price_override ?? null,
        image_url: v.image_url && v.image_url.length > 0 ? v.image_url : null,
      }));
      const { error: vErr } = await supabaseAdmin.from("product_variants").insert(variantRows);
      if (vErr) throw new Error(`Variantes : ${vErr.message}`);
    }

    return { id: productId };
  });
