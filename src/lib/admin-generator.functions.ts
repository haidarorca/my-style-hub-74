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
  const json = (await res.json()) as {
    result?: string;
    base_code?: string;
    rates?: Record<string, number>;
  };
  if (json.result !== "success" || !json.rates) throw new Error("Réponse devises invalide");
  const payload: RatePayload = {
    base: json.base_code ?? base,
    rates: json.rates,
    fetched_at: new Date().toISOString(),
  };
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
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        return null;
      }
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
    const catNames = (cats ?? [])
      .map((c) => c.name)
      .slice(0, 120)
      .join(", ");

    const prompt = [
      "You analyse a product listing (often copy-pasted from Taobao/1688/AliExpress, may contain Chinese/English/mixed text and image URLs).",
      "Extract a clean French e-commerce product. Translate any Chinese/English to natural French.",
      "Rules:",
      "- name_fr: short product title in French (max 80 chars)",
      "- description_fr: clean paragraph in French (max 500 chars), no marketing fluff",
      `- source_price: extract the unit price as a number in ${data.source_currency} (no currency symbol). If multiple prices, pick the most plausible retail unit price.`,
      "- image_urls: array of image URLs found in the text (http/https only, deduplicated)",
      `- suggested_category: pick the BEST match from this list (return the exact string), or null if none fits: ${catNames}`,
      "- suggested_variants: array of {size, color, color_hex, image_url} extracted from the text. Conventions: size = clothing/shoe size or dimension as a short string (e.g. 'S', 'M', 'L', '42', '10x15cm') or empty string if none. color = French color name (e.g. 'Rouge', 'Bleu marine') or empty string. color_hex = matching 6-digit hex like '#1e3a8a' or empty string. image_url = http(s) image URL for this variant from the text or empty string. Do NOT extract supplier stock. Deduplicate. Return [] if no variants are explicit.",
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
      if (res.status === 402)
        throw new Error("Crédits IA épuisés. Ajoutez du crédit dans les paramètres Lovable AI.");
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

    const rawVariants = Array.isArray(parsed.suggested_variants)
      ? (parsed.suggested_variants as unknown[])
      : [];
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
          stock: 0,
          image_url: /^https?:\/\//.test(url) ? url : "",
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null && (v.size !== "" || v.color !== ""))
      .slice(0, 30);

    return {
      name_fr: typeof parsed.name_fr === "string" ? parsed.name_fr.trim() : "",
      description_fr: typeof parsed.description_fr === "string" ? parsed.description_fr.trim() : "",
      source_price:
        typeof parsed.source_price === "number"
          ? parsed.source_price
          : Number(parsed.source_price) || 0,
      image_urls: Array.isArray(parsed.image_urls)
        ? (parsed.image_urls as unknown[]).filter(
            (u): u is string => typeof u === "string" && /^https?:\/\//.test(u),
          )
        : [],
      suggested_category_id: suggestedCategoryId,
      suggested_category_name:
        typeof parsed.suggested_category === "string" ? parsed.suggested_category : null,
      suggested_variants: cleanVariants,
    };
  });

// ───────────────────────────────────────────────────────────
// 2b) Scrape a product URL via Apify, then run AI analysis
// ───────────────────────────────────────────────────────────

function detectCurrencyFromUrl(url: string): "CNY" | "USD" {
  const u = url.toLowerCase();
  if (
    u.includes("taobao.com") ||
    u.includes("1688.com") ||
    u.includes("tmall.com") ||
    u.includes("jd.com") ||
    u.includes("tb.cn") ||
    u.includes("tmall.hk")
  )
    return "CNY";
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

// Extract the product title embedded in a Taobao share text. Mobile shares wrap
// the Chinese title between full-width brackets: 「...」. We strip the URL and
// boilerplate so the AI prompt receives just the meaningful product name.
function extractShareTitle(input: string): string {
  if (!input) return "";
  const bracket = input.match(/「([^」]{4,300})」/);
  if (bracket) return bracket[1].trim();
  // Fallback: take the longest Chinese run in the text
  const runs = input.match(/[\u4e00-\u9fff][\u4e00-\u9fff0-9A-Za-z\-/\s]{6,200}/g) ?? [];
  runs.sort((a, b) => b.length - a.length);
  return runs[0]?.trim() ?? "";
}

// Minimal local heuristic: if the AI is unavailable AND we only have a Chinese
// title, generate FR name/designation/description from keyword mappings so the
// form is never left empty.
const CN_KEYWORDS: Array<[RegExp, string]> = [
  [/小米/, "Xiaomi"],
  [/华为/, "Huawei"],
  [/苹果/, "Apple"],
  [/三星/, "Samsung"],
  [/手环/, "bracelet connecté"],
  [/手表|智能手表/, "montre connectée"],
  [/耳机/, "écouteurs"],
  [/充电器/, "chargeur"],
  [/数据线/, "câble"],
  [/儿童|童装|男童|女童/, "enfant"],
  [/套装|两件套/, "ensemble"],
  [/夏季|夏装/, "été"],
  [/冬季/, "hiver"],
  [/短袖/, "manches courtes"],
  [/短裤/, "short"],
  [/NFC/i, "NFC"],
  [/心率/, "fréquence cardiaque"],
  [/睡眠/, "suivi du sommeil"],
  [/防水/, "étanche"],
  [/运动|健身/, "sport"],
  [/健康/, "santé"],
  [/长续航/, "longue autonomie"],
  [/全面屏/, "écran complet"],
  [/蓝牙/, "Bluetooth"],
];
function heuristicFromChinese(title: string): {
  name: string;
  designation: string;
  description: string;
} {
  if (!title) return { name: "", designation: "", description: "" };
  const hits = CN_KEYWORDS.filter(([re]) => re.test(title)).map(([, fr]) => fr);
  const uniq = Array.from(new Set(hits));
  if (uniq.length === 0) return { name: "", designation: "", description: "" };
  const brand = uniq.find((w) => /^[A-Z]/.test(w)) ?? "";
  const productType =
    uniq.find((w) => /bracelet|montre|écouteurs|chargeur|câble|ensemble|short/.test(w)) ?? "Produit";
  const modelMatch = title.match(/\b\d+(?:NFC)?\b/i);
  const model = modelMatch ? ` ${modelMatch[0]}` : "";
  const name = [brand, productType + model].filter(Boolean).join(" ").trim();
  const designation = uniq.slice(0, 4).join(" · ");
  const features = uniq.filter((w) => w !== brand && w !== productType);
  const description =
    features.length > 0
      ? `${name || productType} : ${features.join(", ")}.`
      : `${name || productType}.`;
  return {
    name: name.slice(0, 80),
    designation: designation.slice(0, 90),
    description: description.slice(0, 500),
  };
}

const MOBILE_UAS = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1",
];
const MOBILE_UA = MOBILE_UAS[0];
function pickUA(): string {
  return MOBILE_UAS[Math.floor(Math.random() * MOBILE_UAS.length)];
}
// Resolve Taobao/1688 mobile short links (e.tb.cn, m.tb.cn, s.click...) to their
// final URL, and rewrite to the desktop canonical form when an item id is found.
async function resolveShareUrl(rawUrl: string): Promise<string> {
  let finalUrl = rawUrl;
  try {
    const res = await fetch(rawUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": pickUA(),
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
async function scrapeViaDirectFetch(
  url: string,
): Promise<{ text: string; images: string[]; html: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": pickUA(),
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
    const ogDesc = html.match(
      /<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]+content=["']([^"']+)["']/i,
    );
    const ogImgs: string[] = [];
    const imgRe =
      /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = imgRe.exec(html))) ogImgs.push(m[1]);
    const linkImgRe =
      /<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpe?g|png|webp|gif|avif)(?:\?[^"']*)?)["']/gi;
    while ((m = linkImgRe.exec(html))) ogImgs.push(m[1]);
    const images = Array.from(new Set(ogImgs)).slice(0, 12);

    const title = (ogTitle?.[1] || titleM?.[1] || "").trim();
    const desc = (ogDesc?.[1] || "").trim();
    if (!title && images.length === 0) return null;

    return {
      text: `Titre: ${title}\n\nDescription: ${desc}`.slice(0, 4000),
      images,
      html,
    };
  } catch {
    return null;
  }
}

// Heuristic: page content looks like a login wall.
function looksLikeLoginWall(text: string): boolean {
  const s = text.toLowerCase();
  return (
    s.includes("请登录") ||
    s.includes("登录后") ||
    s.includes("亲，请登录") ||
    s.includes("sign in to continue") ||
    /\bplease\s+log\s*in\b/.test(s) ||
    s.includes("login.taobao.com") ||
    s.includes("login.1688.com")
  );
}

// ───────────────────────────────────────────────────────────
// SKU / image filtering helpers (Taobao / 1688 / Tmall)
// ───────────────────────────────────────────────────────────

// Only keep images served from Alibaba product CDNs. Reject SVG/icons/UI assets.
function isLikelyProductImageUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  const u = url.toLowerCase();
  // Reject obvious non-photo assets
  if (/\.svg(\?|$)/.test(u)) return false;
  if (/\.gif(\?|$)/.test(u)) return false;
  if (
    /(sprite|icon|logo|placeholder|loading|blank|avatar|badge|emoji|favicon|button|btn|coupon|redpacket|wangwang|tb-live|qrcode|qr-code|service|shop-?banner|seller|tmall-rate|rating|star|cart|search|header|footer|toolbar|arrow|chevron|close|share|wechat|weibo|alipay|jiathis|countdown|sale-tag|promo-tag|live-icon|video-cover|play-btn|sound|mute)/.test(
      u,
    )
  )
    return false;
  // Allow Alibaba product CDNs only (covers Taobao / Tmall / 1688 / AliExpress)
  const allowedHost = /(?:img|gw|gd\d?|sc\d?|ae\d?|aeis\d?|gaitaobao\d?|cbu\d+|dscart\d?)\.alicdn\.com/.test(
    u,
  );
  if (!allowedHost) return false;
  // Filter out tiny resized thumbnails like _40x40, _60x60, _80x80q90
  const sizeMatch = u.match(
    /_(\d{2,4})x(\d{2,4})(?:q\d+)?\.(?:jpg|jpeg|png|webp)(?:_\.webp)?(?:\?|$)/,
  );
  if (sizeMatch) {
    const w = parseInt(sizeMatch[1], 10);
    const h = parseInt(sizeMatch[2], 10);
    if (w < 240 || h < 240) return false;
  }
  // Reject common tiny UI/crop suffixes without explicit dimensions.
  if (/(?:\.sum\.|_\d+x\d+q\d+|_\.webp_\d+x\d+)/.test(u)) return false;
  return true;
}

// Extract lazy-loaded images and detail/description images from raw HTML.
// Covers Taobao desktop, h5.m.taobao.com, 1688 mobile and PC, Tmall.
function extractLazyAndDetailImages(html: string): string[] {
  const out = new Set<string>();
  const push = (raw: string | undefined | null) => {
    if (!raw) return;
    let u = raw.trim().replace(/^['"]|['"]$/g, "");
    if (u.startsWith("//")) u = `https:${u}`;
    if (!/^https?:\/\//i.test(u)) return;
    if (isLikelyProductImageUrl(u)) out.add(upgradeAlicdnImage(u));
  };
  // Lazy-load attributes commonly used by Alibaba pages
  const lazyAttrs = [
    "data-src",
    "data-original",
    "data-lazy-src",
    "data-ks-lazyload",
    "data-ks-lazyload-custom",
    "data-img",
    "data-image",
    "data-bg",
    "data-original-src",
  ];
  for (const attr of lazyAttrs) {
    const re = new RegExp(`${attr}=["']([^"']+\\.(?:jpe?g|png|webp)(?:\\?[^"']*)?)["']`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) push(m[1]);
  }
  // <img src=…> direct
  const imgSrc = /<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = imgSrc.exec(html))) push(m[1]);
  // CSS background-image
  const bg = /background(?:-image)?\s*:\s*url\(['"]?(https?:\/\/[^'")]+\.(?:jpe?g|png|webp))/gi;
  while ((m = bg.exec(html))) push(m[1]);
  // descImages / detailImages / mobileDescription keys (string array)
  for (const key of ["descImages", "detailImages", "mobileDescription", "richTextImgs", "descUrl"]) {
    const re = new RegExp(`["']${key}["']\\s*:\\s*"([^"]+)"`, "gi");
    while ((m = re.exec(html))) {
      const val = m[1];
      // Could be a comma-separated list or a single URL
      val.split(/[,;\s]+/).forEach((v) => push(v));
    }
  }
  // Any bare alicdn URL in scripts (last-resort)
  const bare = /(https?:\\?\/\\?\/[a-z0-9.-]*alicdn\.com\/[^\s"'<>)]+\.(?:jpe?g|png|webp)(?:\?[^\s"'<>)]*)?)/gi;
  while ((m = bare.exec(html))) push(m[1].replace(/\\\//g, "/"));
  return Array.from(out);
}

// Strip alicdn resize suffix (_NNNxNNN.jpg) to get original/high-res image.
function upgradeAlicdnImage(url: string): string {
  return url
    .replace(/_\d{2,4}x\d{2,4}(?:q\d+)?\.(jpg|jpeg|png|webp)(?:_\.webp)?$/i, "")
    .replace(/_\d{2,4}x\d{2,4}(?:q\d+)?\.(jpg|jpeg|png|webp)(?:_\.webp)?(\?[^"']*)?$/i, "$2");
}

// Walk a balanced JSON object/array starting at the first { or [ after `startIdx`.
function extractBalancedJsonAt(text: string, startIdx: number): string | null {
  let i = startIdx;
  while (i < text.length && text[i] !== "{" && text[i] !== "[") i++;
  if (i >= text.length) return null;
  const open = text[i];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < text.length; j++) {
    const ch = text[j];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === '"') {
        inStr = false;
      }
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(i, j + 1);
    }
  }
  return null;
}

function findJsonByKey(html: string, key: string): unknown | null {
  // Search for "key": followed by { or [
  const re = new RegExp(`["']${key}["']\\s*:\\s*(?=[\\{\\[])`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = extractBalancedJsonAt(html, m.index + m[0].length);
    if (!raw) continue;
    try {
      // Some embedded JSON has escaped quotes (\") — try direct then unescape.
      return JSON.parse(raw);
    } catch {
      try {
        return JSON.parse(raw.replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
      } catch {
        continue;
      }
    }
  }
  return null;
}

type StructuredVariant = {
  name: string;
  size: string;
  color: string;
  image_url: string;
  source_price: number;
};

type StructuredSku = {
  images: string[];
  variants: StructuredVariant[];
};

type SkuValue = {
  id: string;
  name: string;
  image: string;
  propName: string;
  kind: "color" | "size" | "model";
};
type SkuEntry = { vids: string[]; names: string[]; price: number };

function decodeEmbeddedJsonLike(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"');
}

function normaliseProductImageUrl(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let u = decodeEmbeddedJsonLike(raw)
    .trim()
    .replace(/^['"]|['"]$/g, "");
  if (!u) return "";
  if (u.startsWith("//")) u = `https:${u}`;
  if (!/^https?:\/\//i.test(u)) return "";
  if (!isLikelyProductImageUrl(u)) return "";
  return upgradeAlicdnImage(u);
}

function findJsonValuesByKey(html: string, key: string): unknown[] {
  const out: unknown[] = [];
  for (const source of [html, decodeEmbeddedJsonLike(html)]) {
    const re = new RegExp(`(?:["']${key}["']|${key})\\s*:\\s*(?=[\\{\\[])`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) {
      const raw = extractBalancedJsonAt(source, m.index + m[0].length);
      if (!raw) continue;
      try {
        out.push(JSON.parse(raw));
      } catch {
        /* keep scanning */
      }
    }
  }
  const single = findJsonByKey(html, key);
  if (single !== null) out.push(single);
  return out;
}

function collectByKey(value: unknown, key: string, out: unknown[] = [], depth = 0): unknown[] {
  if (depth > 8 || value == null) return out;
  if (typeof value === "string") {
    const s = decodeEmbeddedJsonLike(value.trim());
    if ((s.startsWith("{") || s.startsWith("[")) && s.includes(key)) {
      try {
        collectByKey(JSON.parse(s), key, out, depth + 1);
      } catch {
        /* ignore */
      }
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectByKey(item, key, out, depth + 1);
    return out;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === key) out.push(v);
      collectByKey(v, key, out, depth + 1);
    }
  }
  return out;
}

function parseAnyEmbeddedJson(value: unknown): unknown[] {
  const roots: unknown[] = [];
  const visit = (v: unknown, depth = 0) => {
    if (depth > 5 || v == null) return;
    if (typeof v === "string") {
      const s = decodeEmbeddedJsonLike(v.trim());
      if (s.startsWith("{") || s.startsWith("[")) {
        try {
          roots.push(JSON.parse(s));
        } catch {
          return;
        }
      }
      return;
    }
    if (Array.isArray(v)) v.forEach((x) => visit(x, depth + 1));
    else if (typeof v === "object")
      Object.values(v as Record<string, unknown>).forEach((x) => visit(x, depth + 1));
  };
  visit(value);
  return roots;
}

function priceFromUnknown(value: unknown, field = ""): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return /cent|fen|money/i.test(field) && value > 100 ? value / 100 : value;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").match(/\d+(?:\.\d+)?/g)?.[0];
    if (!cleaned) return 0;
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return 0;
    const looksLikeCents = /^\d{3,}$/.test(cleaned) && /price|money|cent|fen/i.test(field);
    return (/cent|fen|money/i.test(field) || looksLikeCents) && n >= 100 ? n / 100 : n;
  }
  return 0;
}

function extractPrice(obj: unknown, depth = 0): number {
  if (!obj || typeof obj !== "object" || depth > 4) return 0;
  const rec = obj as Record<string, unknown>;
  const priority = [
    "promotionPrice",
    "activityPrice",
    "salePrice",
    "sellingPrice",
    "priceText",
    "price",
    "retailPrice",
    "discountPrice",
    "priceMoney",
    "cent",
  ];
  for (const k of priority) {
    const direct = priceFromUnknown(rec[k], k);
    if (direct > 0) return direct;
    if (rec[k] && typeof rec[k] === "object") {
      const nested = extractPrice(rec[k], depth + 1);
      if (nested > 0) return nested;
    }
  }
  for (const [k, v] of Object.entries(rec)) {
    if (/price|money|cent|fen/i.test(k)) {
      const n = priceFromUnknown(v, k) || extractPrice(v, depth + 1);
      if (n > 0) return n;
    }
  }
  return 0;
}

function classifySkuProp(propName: string): SkuValue["kind"] {
  if (/尺码|尺寸|大小|size|容量|规格/i.test(propName)) return "size";
  if (/颜色|colour|color|花色/i.test(propName)) return "color";
  return "model";
}

function splitSkuNames(key: string): string[] {
  return decodeEmbeddedJsonLike(key)
    .split(/[;>&|,，]/)
    .map((p) =>
      p
        .replace(/^\d+:/, "")
        .replace(/^[^:：]{1,12}[:：]/, "")
        .trim(),
    )
    .filter((p) => p.length > 0 && !/^\d+$/.test(p))
    .slice(0, 4);
}

// Extract product images + variants from embedded Taobao / 1688 JSON.
function parseEmbeddedSkuData(html: string): StructuredSku {
  const images = new Set<string>();
  const variants: StructuredVariant[] = [];
  const roots: unknown[] = [];
  const direct = new Map<string, unknown[]>();
  for (const key of [
    "apiStack",
    "skuBase",
    "skuCore",
    "skuModel",
    "skuProps",
    "props",
    "skuMap",
    "skuInfoMap",
    "itemImgs",
    "auctionImages",
    "images",
    "picsPath",
    "itemImages",
  ]) {
    for (const value of findJsonValuesByKey(html, key)) {
      direct.set(key, [...(direct.get(key) ?? []), value]);
      roots.push(value, ...parseAnyEmbeddedJson(value));
    }
  }

  const addImage = (raw: unknown) => {
    const img = normaliseProductImageUrl(raw);
    if (img) images.add(img);
    return img;
  };

  for (const root of [
    ...roots,
    ...(direct.get("itemImgs") ?? []),
    ...(direct.get("auctionImages") ?? []),
    ...(direct.get("images") ?? []),
    ...(direct.get("picsPath") ?? []),
    ...(direct.get("itemImages") ?? []),
  ]) {
    for (const key of [
      "itemImgs",
      "auctionImages",
      "images",
      "picsPath",
      "itemImages",
      "imageList",
      "mainImages",
    ]) {
      const galleries = [root, ...collectByKey(root, key)];
      for (const gallery of galleries) {
        const arr = Array.isArray(gallery) ? gallery : [gallery];
        for (const it of arr) {
          if (typeof it === "string") addImage(it);
          else if (it && typeof it === "object") {
            const r = it as Record<string, unknown>;
            addImage(r.url ?? r.fullPathImageURI ?? r.img ?? r.image ?? r.imageUrl ?? r.picUrl);
          }
        }
      }
    }
  }

  const vidMap = new Map<string, SkuValue>();
  const nameMap = new Map<string, SkuValue>();
  const collectProps = (props: unknown) => {
    if (!Array.isArray(props)) return;
    for (const p of props) {
      if (!p || typeof p !== "object") continue;
      const rec = p as Record<string, unknown>;
      const propName = String(rec.prop ?? rec.name ?? rec.text ?? rec.propName ?? "").trim();
      const kind = classifySkuProp(propName);
      const values = rec.values ?? rec.value ?? rec.children ?? rec.items;
      if (!Array.isArray(values)) continue;
      for (const rawVal of values) {
        if (!rawVal || typeof rawVal !== "object") continue;
        const val = rawVal as Record<string, unknown>;
        const id = String(
          val.vid ?? val.id ?? val.valueId ?? val.specId ?? val.skuPropertyValueId ?? "",
        ).trim();
        const name = String(val.name ?? val.text ?? val.valueName ?? val.title ?? "").trim();
        const image = addImage(
          val.image ?? val.imageUrl ?? val.imgUrl ?? val.picUrl ?? val.thumb ?? val.originalImage,
        );
        if (!name && !image) continue;
        const row: SkuValue = { id, name, image, propName, kind };
        if (id) vidMap.set(id, row);
        if (name) nameMap.set(name.toLowerCase(), row);
      }
    }
  };

  for (const root of roots) {
    for (const props of [
      ...(direct.get("skuProps") ?? []),
      ...collectByKey(root, "skuProps"),
      ...(direct.get("props") ?? []),
      ...collectByKey(root, "props"),
    ])
      collectProps(props);
  }

  const skuIdToVids = new Map<string, string[]>();
  for (const root of roots) {
    for (const skus of collectByKey(root, "skus")) {
      if (!Array.isArray(skus)) continue;
      for (const sku of skus) {
        if (!sku || typeof sku !== "object") continue;
        const rec = sku as Record<string, unknown>;
        const skuId = String(rec.skuId ?? rec.id ?? "").trim();
        const path = String(rec.propPath ?? rec.specPath ?? rec.pvs ?? "");
        const vids = path.split(/[;:,]/).filter((s) => /^\d{2,}$/.test(s));
        if (skuId && vids.length > 0) skuIdToVids.set(skuId, vids);
      }
    }
  }
  for (const [key, val] of vidMap.entries()) {
    if (/^\d+[:：]\d+$/.test(key)) skuIdToVids.set(key, key.split(/[:：]/));
    if (/^\d+[:：]\d+$/.test(val.id)) skuIdToVids.set(val.id, val.id.split(/[:：]/));
  }

  const entries: SkuEntry[] = [];
  const addEntryFromMap = (mapLike: unknown) => {
    if (!mapLike || typeof mapLike !== "object" || Array.isArray(mapLike)) return;
    for (const [key, raw] of Object.entries(mapLike as Record<string, unknown>)) {
      if (key === "0" || key === "default") continue;
      const obj = raw && typeof raw === "object" ? raw : {};
      const vids = skuIdToVids.get(key) ?? key.split(/[;:,：]/).filter((s) => /^\d{2,}$/.test(s));
      const names = splitSkuNames(key);
      const price = extractPrice(obj);
      if (vids.length > 0 || names.length > 0) entries.push({ vids, names, price });
    }
  };
  const addEntryFromArray = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const raw of arr) {
      if (!raw || typeof raw !== "object") continue;
      const rec = raw as Record<string, unknown>;
      const path = String(rec.propPath ?? rec.specPath ?? rec.pvs ?? rec.skuId ?? rec.id ?? "");
      const vids = skuIdToVids.get(path) ?? path.split(/[;:,：]/).filter((s) => /^\d{2,}$/.test(s));
      const names = splitSkuNames(String(rec.name ?? rec.specAttrs ?? rec.attributes ?? ""));
      const price = extractPrice(rec);
      if (vids.length > 0 || names.length > 0) entries.push({ vids, names, price });
    }
  };

  for (const root of roots) {
    for (const map of [
      ...(direct.get("skuMap") ?? []),
      ...collectByKey(root, "skuMap"),
      ...(direct.get("skuInfoMap") ?? []),
      ...collectByKey(root, "skuInfoMap"),
      ...collectByKey(root, "sku2info"),
    ])
      addEntryFromMap(map);
    for (const arr of [
      ...collectByKey(root, "skus"),
      ...collectByKey(root, "skuList"),
      ...collectByKey(root, "skuInfos"),
    ])
      addEntryFromArray(arr);
  }

  const variantByKey = new Map<string, StructuredVariant>();
  if (entries.length > 0 && (vidMap.size > 0 || nameMap.size > 0)) {
    for (const entry of entries) {
      const values = [
        ...entry.vids.map((id) => vidMap.get(id)).filter((v): v is SkuValue => !!v),
        ...entry.names.map((n) => nameMap.get(n.toLowerCase())).filter((v): v is SkuValue => !!v),
      ];
      const names = values.map((v) => v.name).filter(Boolean);
      for (const n of entry.names) if (!names.includes(n)) names.push(n);
      if (names.length === 0) continue;
      const image = values.find((v) => v.image)?.image ?? "";
      const color =
        values.find((v) => v.kind === "color")?.name ?? values.find((v) => v.image)?.name ?? "";
      const size = values.find((v) => v.kind === "size")?.name ?? "";
      const name = names.join(" - ").slice(0, 90);
      const key = `${name}|${image}|${entry.price || 0}`;
      variantByKey.set(key, { name, size, color, image_url: image, source_price: entry.price });
    }
  }

  if (variantByKey.size === 0 && vidMap.size > 0) {
    for (const v of vidMap.values()) {
      if (!v.name && !v.image) continue;
      variantByKey.set(`${v.name}|${v.image}`, {
        name: v.name.slice(0, 90),
        size: v.kind === "size" ? v.name : "",
        color: v.kind === "color" || v.image ? v.name : "",
        image_url: v.image,
        source_price: 0,
      });
    }
  }

  for (const v of variantByKey.values()) variants.push(v);
  return { images: Array.from(images).slice(0, 40), variants: variants.slice(0, 80) };
}

async function scrapeViaApify(
  url: string,
): Promise<{ text: string; images: string[]; html: string }> {
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
    saveHtml: true,
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
    html?: string;
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
  const html = it.html ?? "";
  // Extract image URLs from markdown ![](url) and bare http(s) img links
  const imgRe =
    /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s")]+\.(?:jpe?g|png|webp|gif|avif)(?:\?[^\s")]*)?)/gi;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(md))) {
    const u = m[1] || m[2];
    if (u) set.add(u);
  }
  return {
    text: `Titre: ${title}\n\nDescription: ${desc}\n\n${md}`.slice(0, 18000),
    images: Array.from(set).slice(0, 20),
    html,
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
  url: z.string().min(4).max(4000),
});

export const analyzeSourceUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AnalyzeUrlSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway non configuré");

    // 0) Extract a URL from a Taobao share text if needed
    const extracted = extractUrlFromText(data.url);
    if (!extracted) {
      throw new Error(
        "Aucun lien détecté. Collez l'URL produit ou le texte de partage Taobao complet.",
      );
    }

    // 1) Resolve mobile short links (e.tb.cn, m.tb.cn…) → canonical desktop URL
    const resolvedUrl = await resolveShareUrl(extracted);
    const currency = detectCurrencyFromUrl(resolvedUrl);

    // 2) Try Apify, then fall back to direct HTML fetch
    let scraped: { text: string; images: string[]; html: string } | null = null;
    const partialReasons: string[] = [];
    try {
      scraped = await scrapeViaApify(resolvedUrl);
    } catch (e) {
      // single light retry — Apify cold starts can return transient 5xx
      try {
        await new Promise((r) => setTimeout(r, 1500));
        scraped = await scrapeViaApify(resolvedUrl);
      } catch (e2) {
        const msg =
          e2 instanceof Error
            ? e2.message
            : e instanceof Error
              ? e.message
              : "Scraping principal échoué";
        partialReasons.push(msg);
      }
    }
    if (
      !scraped ||
      (scraped.images.length === 0 && scraped.text.trim().length < 60) ||
      looksLikeLoginWall(scraped?.text ?? "")
    ) {
      try {
        const fb = await scrapeViaDirectFetch(resolvedUrl);
        if (fb) {
          scraped = fb;
          partialReasons.push("Page protégée — récupération partielle (titre + images).");
        }
      } catch {
        /* ignore */
      }
    }

    // 2c) Always extract the share title (between 「 」) so the AI gets it even
    //     when scraping succeeded partially. If the page is fully blocked, the
    //     title becomes the sole input — we never give up when text is available.
    const shareTitle = extractShareTitle(data.url);
    if (!scraped || (scraped.images.length === 0 && scraped.text.trim().length < 20)) {
      const fallbackText = shareTitle || data.url.trim();
      if (fallbackText.length >= 4) {
        scraped = { text: fallbackText, images: [], html: "" };
        partialReasons.push(
          "Page Taobao bloquée — analyse basée uniquement sur le texte du lien partagé.",
        );
      } else {
        throw new Error(
          "Impossible d'extraire le produit (lien protégé, application Taobao requise, ou bloqué). " +
            "Astuce : collez le texte de partage Taobao complet (avec le titre chinois) puis réessayez.",
        );
      }
    } else if (shareTitle && !scraped.text.includes(shareTitle)) {
      // Enrich scraped text with the user-provided title to guide the AI.
      scraped = { ...scraped, text: `${shareTitle}\n\n${scraped.text}` };
    }

    // 2b) Parse embedded Taobao/1688 SKU JSON (skuMap, skuProps, itemImgs…) from raw HTML
    const structured: StructuredSku =
      scraped.html && scraped.html.length > 0
        ? parseEmbeddedSkuData(scraped.html)
        : { images: [], variants: [] };

    // Filter scraped/markdown images through CDN+size whitelist
    // + ajout des images lazy-loaded et detail/description extraites du HTML brut
    const lazyImgs = scraped.html ? extractLazyAndDetailImages(scraped.html) : [];
    const filteredScrapedImages = Array.from(
      new Set([
        ...scraped.images.map((u) => (u.startsWith("//") ? `https:${u}` : u)),
        ...lazyImgs,
      ]),
    )
      .filter(isLikelyProductImageUrl)
      .map(upgradeAlicdnImage);

    const { data: cats } = await supabaseAdmin
      .from("categories")
      .select("id, name, level")
      .eq("level", 3)
      .order("position")
      .limit(200);
    const catNames = (cats ?? [])
      .map((c) => c.name)
      .slice(0, 120)
      .join(", ");

    // 4) AI extraction (best-effort — never blocks fallback delivery)
    const enrichedText = scraped.text + "\n\nImages détectées:\n" + scraped.images.join("\n");
    const prompt = [
      "You analyse a product listing scraped from Taobao/1688/AliExpress (may contain Chinese/English/mixed text and image URLs).",
      "Extract a clean French e-commerce product. Translate any Chinese/English to natural French.",
      "Rules:",
      "- name_fr: short product title in French (max 80 chars). If the input only contains a Chinese/English title (no description), translate it into a natural French product name. Empty ONLY if no title is recognizable.",
      "- designation_fr: SHORT commercial tagline in French (max 90 chars), one descriptive line summarising the product type and target audience. ALWAYS generate one if a name is detected, by inferring from the title (e.g. 'Ensemble d'été 2 pièces pour enfant'). Empty only if no title at all.",
      "- description_fr: clean paragraph in French (max 500 chars), no marketing fluff. If only a title is available, generate a plausible 2-3 sentence description inferred from the title's keywords (type of product, materials, season, audience). Empty only if no title at all.",
      `- source_price: main unit price as a number in ${currency} (no symbol). 0 if unknown.`,
      "- image_urls: array of MAIN product image URLs (http/https only, deduplicated, max 8). Exclude tiny thumbnails.",
      `- suggested_category: pick the BEST match from this list (return the exact string), or null: ${catNames}`,
      "- suggested_variants: array of variants. Each item: {name, size, color, color_hex, image_url, source_price}.",
      "  · name: short French label combining model/color/size (e.g. 'Grand modèle - Rouge').",
      "  · size, color, color_hex (#rrggbb or ''). Do NOT extract supplier stock.",
      "  · image_url: HTTP(S) image that visually represents this specific variant (color swatch / model photo). Use one from image_urls if no dedicated variant photo.",
      `  · source_price: per-variant unit price as a number in ${currency} (0 if same as main price or unknown).`,
      "  Detect ALL variants you see (colors, models, sizes, packs). Up to 30. [] if none.",
      'Return ONLY strict JSON: {"name_fr":"","designation_fr":"","description_fr":"","source_price":0,"image_urls":[],"suggested_category":null,"suggested_variants":[]}',
      "",
      "Input:",
      enrichedText,
    ].join("\n");

    let parsed: Record<string, unknown> | null = null;
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        parsed = safeParseJson(json.choices?.[0]?.message?.content?.trim() ?? "");
      } else if (res.status === 429) {
        partialReasons.push("Limite IA atteinte — résultat partiel.");
      } else if (res.status === 402) {
        partialReasons.push("Crédits IA épuisés — résultat partiel.");
      }
    } catch {
      // ignore — we'll fall back to raw extraction
    }
    if (!parsed) {
      parsed = {};
      partialReasons.push("Analyse IA indisponible — remplissez manuellement.");
    }

    // 5) Resolve category id
    let suggestedCategoryId: string | null = null;
    if (typeof parsed.suggested_category === "string" && parsed.suggested_category.trim()) {
      const match = (cats ?? []).find(
        (c) => c.name.toLowerCase() === (parsed!.suggested_category as string).toLowerCase().trim(),
      );
      suggestedCategoryId = match?.id ?? null;
    }

    // 6) FX rate
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
      typeof parsed.source_price === "number"
        ? parsed.source_price
        : Number(parsed.source_price) || 0;
    const suggestedPriceXof = Math.round(sourcePrice * fxRate);

    // 7) Build final image list. Priority: structured (JSON SKU/itemImgs) → filtered scraped → AI.
    //    All URLs pass through isLikelyProductImageUrl to drop UI/icon noise.
    const aiImageUrls = (
      Array.isArray(parsed.image_urls)
        ? (parsed.image_urls as unknown[]).filter(
            (u): u is string => typeof u === "string" && /^https?:\/\//.test(u),
          )
        : []
    )
      .filter(isLikelyProductImageUrl)
      .map(upgradeAlicdnImage);
    const allImageUrls = Array.from(
      new Set([...structured.images, ...filteredScrapedImages, ...aiImageUrls]),
    ).slice(0, 25);
    const imageDataUrls: string[] = [];
    for (const u of allImageUrls) {
      const d = await downloadImageAsDataUrl(u);
      if (d) imageDataUrls.push(d);
      if (imageDataUrls.length >= 25) break;
    }

    // 8) Build variants. Structured (skuMap/skuProps) takes priority — guarantees
    //    correct name ↔ image ↔ price. AI variants only fill gaps when no structured data.
    type Interim = {
      name: string;
      size: string;
      color: string;
      color_hex: string;
      stock: number;
      image_url: string;
      source_price: number;
      price_xof_detected: number;
    };
    let interimVariants: Interim[] = [];
    if (structured.variants.length > 0) {
      interimVariants = structured.variants.map((v) => ({
        name: v.name.slice(0, 90),
        size: v.size.slice(0, 40),
        color: v.color.slice(0, 60),
        color_hex: "",
        stock: 0,
        image_url: v.image_url,
        source_price: v.source_price,
        price_xof_detected: v.source_price > 0 ? Math.round(v.source_price * fxRate) : 0,
      }));
    } else {
      const rawVariants = Array.isArray(parsed.suggested_variants)
        ? (parsed.suggested_variants as unknown[])
        : [];
      interimVariants = rawVariants
        .map((v): Interim | null => {
          if (!v || typeof v !== "object") return null;
          const o = v as Record<string, unknown>;
          const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
          const num = (k: string) => {
            const n = typeof o[k] === "number" ? (o[k] as number) : Number(o[k]);
            return Number.isFinite(n) && n >= 0 ? n : 0;
          };
          const hex = str("color_hex");
          const url = str("image_url");
          const cleanUrl =
            /^https?:\/\//.test(url) && isLikelyProductImageUrl(url) ? upgradeAlicdnImage(url) : "";
          const srcPrice = num("source_price");
          return {
            name: str("name").slice(0, 90),
            size: str("size").slice(0, 40),
            color: str("color").slice(0, 60),
            color_hex: /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "",
            stock: 0,
            image_url: cleanUrl,
            source_price: srcPrice,
            price_xof_detected: srcPrice > 0 ? Math.round(srcPrice * fxRate) : 0,
          };
        })
        .filter(
          (v): v is Interim => v !== null && (v.size !== "" || v.color !== "" || v.name !== ""),
        )
        .slice(0, 60);
    }

    // Download distinct variant images (cap to 30 distinct URLs)
    const variantUrlCache = new Map<string, string | null>();
    const distinctUrls = Array.from(
      new Set(interimVariants.map((v) => v.image_url).filter(Boolean)),
    ).slice(0, 30);
    for (const u of distinctUrls) {
      variantUrlCache.set(u, await downloadImageAsDataUrl(u));
    }
    const cleanVariants = interimVariants.map((v) => ({
      name: v.name,
      size: v.size,
      color: v.color,
      color_hex: v.color_hex,
      stock: v.stock,
      source_price: v.source_price,
      price_xof_detected: v.price_xof_detected,
      image_data_url: v.image_url ? (variantUrlCache.get(v.image_url) ?? null) : null,
    }));

    let nameFr = typeof parsed.name_fr === "string" ? parsed.name_fr.trim() : "";
    let designationFr =
      typeof parsed.designation_fr === "string" ? parsed.designation_fr.trim() : "";
    let descFr = typeof parsed.description_fr === "string" ? parsed.description_fr.trim() : "";

    // Local heuristic fallback: if the AI didn't return anything usable but we
    // have a Chinese share title, derive FR fields from keyword mappings so the
    // form is never left empty.
    if ((!nameFr || !designationFr || !descFr) && shareTitle) {
      const h = heuristicFromChinese(shareTitle);
      if (!nameFr && h.name) nameFr = h.name;
      if (!designationFr && h.designation) designationFr = h.designation;
      if (!descFr && h.description) descFr = h.description;
    }

    // Granular reasons for missing core fields. We intentionally do NOT warn
    // about missing variants — variant entry is fully manual by design.
    if (sourcePrice === 0) partialReasons.push("Prix non détecté — saisissez-le manuellement.");
    if (!nameFr) partialReasons.push("Nom non détecté — saisissez-le manuellement.");

    const partial = partialReasons.length > 0 || (!nameFr && sourcePrice === 0);
    const dedupedReasons = Array.from(new Set(partialReasons));

    return {
      resolved_url: resolvedUrl,
      partial,
      partial_reason: partial
        ? dedupedReasons.join(" · ") || "Données incomplètes — complétez manuellement."
        : null,
      source_currency: currency,
      fx_rate: fxRate,
      source_price: sourcePrice,
      suggested_price_xof: suggestedPriceXof,
      name_fr: nameFr,
      designation_fr: designationFr,
      description_fr: descFr,
      suggested_category_id: suggestedCategoryId,
      suggested_category_name:
        typeof parsed.suggested_category === "string" ? parsed.suggested_category : null,
      suggested_variants: cleanVariants,
      images: imageDataUrls,
    };
  });

// ───────────────────────────────────────────────────────────
// 3) Publish generated product into an admin shop
// ───────────────────────────────────────────────────────────

const VariantSchema = z.object({
  size: z.string().trim().max(40).optional().default(""),
  color: z.string().trim().max(60).optional().default(""),
  color_hex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .or(z.literal(""))
    .default(""),
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

    const imageRows = data.image_urls.map((url, i) => ({
      product_id: productId,
      url,
      position: i,
    }));
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

// ───────────────────────────────────────────────────────────
// 4) OCR Vision — extract variants from uploaded screenshots
// ───────────────────────────────────────────────────────────

const MAX_OCR_IMAGES = 10;
const VariantOcrSchema = z.object({
  // base64 data URLs of screenshots (max 10, each <= ~4MB after base64)
  images: z
    .array(z.string().min(20).max(8_000_000))
    .min(1, { message: `Ajoutez au moins une capture.` })
    .max(MAX_OCR_IMAGES, { message: `Maximum ${MAX_OCR_IMAGES} images autorisées.` }),
  hint: z.string().trim().max(500).optional().default(""),
});

export const analyzeVariantsFromImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => VariantOcrSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Tout utilisateur authentifié (admin ou vendeur) peut analyser ses propres captures.
    // Pas d'écriture en base : la fonction renvoie uniquement le résultat OCR.
    void context.userId;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway non configuré");

    // Validate data URLs
    const dataUrls = data.images.filter((u) => /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(u));
    if (dataUrls.length === 0) throw new Error("Aucune image valide reçue.");

    // Fetch FX rate (CNY→XOF) for suggested FCFA
    let cnyToXof = 85;
    try {
      const { data: s } = await supabaseAdmin
        .from("site_settings")
        .select("cny_to_xof_rate")
        .eq("id", "main")
        .maybeSingle();
      cnyToXof = Number((s as { cny_to_xof_rate?: number } | null)?.cny_to_xof_rate ?? 85);
    } catch {
      /* keep default */
    }
    let usdToXof = 600;
    try {
      const payload = await fetchRates("USD");
      usdToXof = payload.rates["XOF"] ?? 600;
    } catch {
      /* keep default */
    }

    const prompt = [
      `Tu reçois ${dataUrls.length} capture(s) d'écran d'un produit Taobao/1688/AliExpress, numérotées de 0 à ${dataUrls.length - 1} dans l'ordre fourni.`,
      "Elles montrent les VARIANTES (SKU) du produit : couleurs, tailles, modèles, packs, et leurs prix.",
      "Tu dois fusionner toutes les captures pour reconstruire la liste COMPLÈTE des combinaisons disponibles.",
      "Règles :",
      "- Traduis tous les libellés chinois/anglais en FRANÇAIS naturel et court.",
      "- Si une capture montre les couleurs et une autre les tailles, génère toutes les combinaisons possibles (Couleur × Taille). Si la capture indique qu'une combinaison n'existe PAS, ne la génère pas.",
      "- Une ligne = UNE combinaison complète (ex: 'Noir + M', 'Beige + S', 'Rouge + L').",
      "- N'invente JAMAIS de prix : si le prix n'est pas visible pour une combinaison, mets 0.",
      "- N'extrais JAMAIS le stock fournisseur.",
      "- Devise : 'CNY' (¥/￥/元), 'USD' ($) ou 'XOF'. Si aucun symbole, suppose CNY pour Taobao/1688.",
      "POUR CHAQUE variante, identifie ÉGALEMENT :",
      `- source_image_index : numéro (0..${dataUrls.length - 1}) de la capture où la vignette ou la photo de CETTE variante précise est la plus visible. Si tu hésites, choisis la capture qui contient la zone produit la plus large pour ce SKU. Si vraiment aucune, mets null.`,
      "- crop_hint : rectangle EN POURCENTAGE (0..100) de la même capture qui isole UNIQUEMENT la photo produit propre (sans bandeau prix, sans bouton acheter, sans logo Taobao/1688, sans texte en bas). Format : {\"x\":..,\"y\":..,\"w\":..,\"h\":..}. Si toute la capture est déjà propre, mets {\"x\":0,\"y\":0,\"w\":100,\"h\":100}. Si tu ne sais pas, mets null.",
      "- chinese_label : libellé chinois original tel qu'écrit sur la capture (vide si absent).",
      `Contexte utilisateur (optionnel): ${data.hint || "—"}`,
      "Retourne UNIQUEMENT du JSON strict :",
      '{"currency":"CNY","variants":[{"name":"Noir + M","color":"Noir","size":"M","source_price":0,"source_image_index":0,"crop_hint":{"x":0,"y":0,"w":100,"h":100},"chinese_label":""}]}',
    ].join("\n");

    const messages = [
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: prompt },
          ...dataUrls.map((u) => ({
            type: "image_url" as const,
            image_url: { url: u },
          })),
        ],
      },
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages }),
    });
    if (!res.ok) {
      if (res.status === 429) throw new Error("Limite IA atteinte, réessayez dans un instant.");
      if (res.status === 402)
        throw new Error("Crédits IA épuisés. Ajoutez du crédit dans les paramètres Lovable AI.");
      throw new Error(`Erreur IA vision (${res.status})`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = safeParseJson(raw);
    if (!parsed || !Array.isArray(parsed.variants)) {
      throw new Error("Réponse IA illisible. Réessayez avec des captures plus nettes.");
    }

    const currencyRaw = String(parsed.currency ?? "CNY").toUpperCase();
    const currency: "CNY" | "USD" | "XOF" = ["CNY", "USD", "XOF"].includes(currencyRaw)
      ? (currencyRaw as "CNY" | "USD" | "XOF")
      : "CNY";
    const fxRate = currency === "CNY" ? cnyToXof : currency === "USD" ? usdToXof : 1;

    const imgCount = dataUrls.length;
    const cleanVariants = (parsed.variants as unknown[])
      .map((v) => {
        if (!v || typeof v !== "object") return null;
        const o = v as Record<string, unknown>;
        const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
        const num = (k: string) => {
          const n = typeof o[k] === "number" ? (o[k] as number) : Number(o[k]);
          return Number.isFinite(n) && n >= 0 ? n : 0;
        };
        const name = str("name").slice(0, 90);
        const color = str("color").slice(0, 60);
        const size = str("size").slice(0, 40);
        const srcPrice = num("source_price");
        if (!name && !color && !size) return null;
        let sourceImageIndex: number | null = null;
        const rawIdx = o.source_image_index;
        if (typeof rawIdx === "number" && Number.isFinite(rawIdx)) {
          const i = Math.floor(rawIdx);
          if (i >= 0 && i < imgCount) sourceImageIndex = i;
        }
        let cropHint: { x: number; y: number; w: number; h: number } | null = null;
        const rawCrop = o.crop_hint;
        if (rawCrop && typeof rawCrop === "object") {
          const c = rawCrop as Record<string, unknown>;
          const cn = (k: string) => {
            const n = typeof c[k] === "number" ? (c[k] as number) : Number(c[k]);
            return Number.isFinite(n) ? n : NaN;
          };
          const x = cn("x"), y = cn("y"), w = cn("w"), h = cn("h");
          if ([x, y, w, h].every((n) => Number.isFinite(n)) && w > 0 && h > 0) {
            cropHint = {
              x: Math.max(0, Math.min(100, x)),
              y: Math.max(0, Math.min(100, y)),
              w: Math.max(1, Math.min(100, w)),
              h: Math.max(1, Math.min(100, h)),
            };
          }
        }
        return {
          name: name || [color, size].filter(Boolean).join(" + "),
          color,
          size,
          source_price: srcPrice,
          price_xof_detected: srcPrice > 0 ? Math.round(srcPrice * fxRate) : 0,
          source_image_index: sourceImageIndex,
          crop_hint: cropHint,
          chinese_label: str("chinese_label").slice(0, 120),
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .slice(0, 100);

    return {
      source_currency: currency,
      fx_rate: fxRate,
      variants: cleanVariants,
    };
  });
