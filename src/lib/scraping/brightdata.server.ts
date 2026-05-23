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

export interface ImportAttemptLog {
  initialUrl: string;
  finalUrl: string;
  source: NormalizedProduct["extractionSource"] | "none";
  status: "success" | "login" | "blocked" | "captcha" | "invalid_data";
  reason: string;
  issues: string[];
}

export interface ProductValidationResult {
  valid: boolean;
  reason: string | null;
  issues: string[];
  confidence: number;
}

// ──────────────────────────────────────────────
// Détection plateforme + résolution liens courts

export function detectPlatform(url: string): Platform {
  if (/(?:^|\.)(?:1688|alibaba)\.com|detail\.1688\.com/i.test(url)) return "1688";
  if (/(?:^|\.)(?:tmall|tmall\.hk)\.(?:com|hk)|detail\.tmall\.|tmall\.com\/item/i.test(url)) return "tmall";
  if (/(?:^|\.)(?:taobao|tb|worldtaobao|m\.taobao|intl\.taobao)\.(?:com|cn)|item\.taobao\.|click\.world\.taobao\.com|s\.click\.taobao\.com|m\.tb\.cn|uland\.taobao\.com/i.test(url)) return "taobao";
  return "unknown";
}

/**
 * Nettoie un input collé depuis Taobao/WeChat/partage mobile :
 * - retire les guillemets chinois 「」『』【】《》
 * - retire les emojis et caractères de contrôle
 * - retire le texte de partage ("I shared a Taobao page...", "复制本条信息…")
 * - décode les entités HTML basiques
 */
export function cleanShareInput(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/&amp;/g, "&")
    .replace(/[「」『』【】《》]/g, " ")
    .replace(/[\u2018\u2019\u201C\u201D]/g, " ")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractFirstUrl(input: string): string {
  const decoded = cleanShareInput(input);
  // Cherche une URL http(s) même collée à du texte chinois / ponctuation
  const match = decoded.match(/https?:\/\/[^\s"'<>「」『』，。、；：!！?？()（）]+/i);
  const url = match?.[0] ?? decoded.trim();
  try {
    return decodeURIComponent(url).replace(/[),.;，。、；]+$/g, "");
  } catch {
    return url.replace(/[),.;，。、；]+$/g, "");
  }
}

/**
 * Normalise un input utilisateur en URL canonique et renvoie un log debug complet.
 * Ne lève jamais d'exception : retourne { canonicalUrl: "" } si rien d'exploitable.
 */
export async function normalizeImportInput(rawInput: string): Promise<{
  rawInput: string;
  cleanedInput: string;
  extractedUrl: string;
  resolvedUrl: string;
  canonicalUrl: string;
  detectedPlatform: Platform;
  extractedItemId: string | null;
  extractedShopId: string | null;
  ok: boolean;
  reason?: string;
}> {
  const cleanedInput = cleanShareInput(rawInput);
  const extractedUrl = extractFirstUrl(cleanedInput);
  if (!/^https?:\/\//i.test(extractedUrl)) {
    return {
      rawInput, cleanedInput, extractedUrl, resolvedUrl: "", canonicalUrl: "",
      detectedPlatform: "unknown", extractedItemId: null, extractedShopId: null,
      ok: false, reason: "Aucune URL valide détectée dans le texte collé",
    };
  }
  let resolvedUrl = extractedUrl;
  try { resolvedUrl = await resolveTaobaoShortLink(extractedUrl); } catch { /* keep extracted */ }
  const canonicalUrl = canonicalizeUrl(resolvedUrl);
  const detectedPlatform = detectPlatform(canonicalUrl);
  const extractedItemId = extractSourceProductId(canonicalUrl, detectedPlatform);
  const shopMatch = canonicalUrl.match(/[?&](?:shop_id|shopId|sellerId|user_id|userId)=([0-9]{4,})/i);
  const extractedShopId = shopMatch?.[1] ?? null;
  return {
    rawInput, cleanedInput, extractedUrl, resolvedUrl, canonicalUrl,
    detectedPlatform, extractedItemId, extractedShopId,
    ok: detectedPlatform !== "unknown" || /^https?:\/\//i.test(canonicalUrl),
  };
}

function canonicalizeUrl(url: string): string {
  try {
    const cleaned = extractFirstUrl(url);
    const u = new URL(cleaned);
    const decodedHref = decodeURIComponent(u.toString());
    const id =
      u.searchParams.get("id") ||
      u.searchParams.get("itemId") ||
      u.searchParams.get("item_id") ||
      decodedHref.match(/[?&](?:id|itemId|item_id|itemid)=([0-9]{5,})/i)?.[1] ||
      decodedHref.match(/(?:item|itemId|item_id|id)[=:]%?22?([0-9]{5,})/i)?.[1];
    const platform = detectPlatform(u.toString());
    if (id && /^\d{5,}$/.test(id) && (platform === "taobao" || platform === "tmall")) {
      const host = platform === "tmall" || /tmall/i.test(decodedHref) ? "detail.tmall.com" : "item.taobao.com";
      return `https://${host}/item.htm?id=${id}`;
    }
    const offerId = decodedHref.match(/offer\/(\d{5,})\.html/i)?.[1] || decodedHref.match(/[?&]offerId=(\d{5,})/i)?.[1];
    if (offerId && platform === "1688") return `https://detail.1688.com/offer/${offerId}.html`;
    return u.toString().replace(/#.*$/, "");
  } catch {
    return url;
  }
}

/**
 * Résout les liens courts Taobao (click.world.taobao.com, m.tb.cn, ...).
 * Suit jusqu'à 5 redirections et renvoie l'URL finale item.htm.
 */
export async function resolveTaobaoShortLink(url: string): Promise<string> {
  const initial = extractFirstUrl(url);
  if (!/(?:click\.world\.taobao\.com|m\.tb\.cn|s\.click\.taobao\.com|uland\.taobao\.com|item\.world\.taobao\.com|tb\.cn|taobao\.com|tmall\.com|1688\.com|alibaba\.com)/i.test(initial)) {
    return canonicalizeUrl(initial);
  }
  let current = initial;
  for (let i = 0; i < 8; i++) {
    try {
      const r = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(12_000),
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7,fr;q=0.6",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Referer: "https://www.taobao.com/",
        },
      });
      const loc = r.headers.get("location");
      if (!loc) {
        const text = await r.text().catch(() => "");
        const embedded = text.match(/https?:\\?\/\\?\/(?:item\.taobao\.com|detail\.tmall\.com|detail\.1688\.com|m\.taobao\.com|h5\.m\.taobao\.com)[^"'\\\s<>]+/i)?.[0]
          ?.replace(/\\\//g, "/")
          ?.replace(/&amp;/g, "&");
        if (embedded) current = embedded;
        else {
          const embeddedId = text.match(/(?:itemId|item_id|id)["'\s:=]+["']?(\d{5,})/i)?.[1];
          if (embeddedId) current = /tmall/i.test(text) ? `https://detail.tmall.com/item.htm?id=${embeddedId}` : `https://item.taobao.com/item.htm?id=${embeddedId}`;
        }
        break;
      }
      current = new URL(loc, current).toString();
      if (/item\.taobao\.com\/item\.htm|detail\.tmall\.com\/item\.htm|detail\.1688\.com\/offer\//i.test(current)) break;
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
  const validDatasetId = (value: string | undefined): string | null => {
    const trimmed = value?.trim();
    return trimmed && /^gd_[a-z0-9_]+$/i.test(trimmed) ? trimmed : null;
  };
  switch (platform) {
    case "taobao":
      return validDatasetId(process.env.BRIGHTDATA_DATASET_TAOBAO_PRODUCT);
    case "tmall":
      return (
        validDatasetId(process.env.BRIGHTDATA_DATASET_TMALL_PRODUCT) ??
        validDatasetId(process.env.BRIGHTDATA_DATASET_TAOBAO_PRODUCT) ??
        null
      );
    case "1688":
      return validDatasetId(process.env.BRIGHTDATA_DATASET_1688_PRODUCT);
    default:
      return null;
  }
}

export function shopDatasetIdFor(platform: Platform): string | null {
  const validDatasetId = (value: string | undefined): string | null => {
    const trimmed = value?.trim();
    return trimmed && /^gd_[a-z0-9_]+$/i.test(trimmed) ? trimmed : null;
  };
  switch (platform) {
    case "taobao":
    case "tmall":
      return validDatasetId(process.env.BRIGHTDATA_DATASET_TAOBAO_SHOP);
    case "1688":
      return validDatasetId(process.env.BRIGHTDATA_DATASET_1688_SHOP);
    default:
      return null;
  }
}

/**
 * Diagnostic : teste API key + zone Web Unlocker sans crasher.
 * Renvoie toujours un objet structuré.
 */
export async function diagnoseBrightDataConfig(): Promise<{
  apiKey: { present: boolean; valid: boolean; message: string };
  zone: { present: boolean; name: string | null; valid: boolean; message: string };
  datasets: { name: string; value: string | null; valid: boolean }[];
}> {
  const apiKey = process.env.BRIGHTDATA_API_KEY?.trim() || "";
  const zone = (process.env.BRIGHTDATA_BROWSER_ZONE ?? process.env.BRIGHTDATA_WEB_UNLOCKER_ZONE)?.trim() || "";

  const datasetChecks = [
    { name: "BRIGHTDATA_DATASET_TAOBAO_PRODUCT", value: process.env.BRIGHTDATA_DATASET_TAOBAO_PRODUCT?.trim() || null },
    { name: "BRIGHTDATA_DATASET_TMALL_PRODUCT", value: process.env.BRIGHTDATA_DATASET_TMALL_PRODUCT?.trim() || null },
    { name: "BRIGHTDATA_DATASET_1688_PRODUCT", value: process.env.BRIGHTDATA_DATASET_1688_PRODUCT?.trim() || null },
    { name: "BRIGHTDATA_DATASET_TAOBAO_SHOP", value: process.env.BRIGHTDATA_DATASET_TAOBAO_SHOP?.trim() || null },
    { name: "BRIGHTDATA_DATASET_1688_SHOP", value: process.env.BRIGHTDATA_DATASET_1688_SHOP?.trim() || null },
  ].map((d) => ({ ...d, valid: Boolean(d.value && /^gd_[a-z0-9_]+$/i.test(d.value)) }));

  if (!apiKey) {
    return {
      apiKey: { present: false, valid: false, message: "BRIGHTDATA_API_KEY manquant" },
      zone: { present: Boolean(zone), name: zone || null, valid: false, message: "Clé API requise pour tester la zone" },
      datasets: datasetChecks,
    };
  }
  if (/^wss?:\/\//i.test(zone)) {
    return {
      apiKey: { present: true, valid: false, message: "Clé présente mais zone invalide (voir ci-dessous)" },
      zone: { present: true, name: zone, valid: false, message: "BRIGHTDATA_WEB_UNLOCKER_ZONE doit contenir uniquement le NOM de la zone (ex: taobao_unlocker), pas l'URL wss://" },
      datasets: datasetChecks,
    };
  }
  if (!zone) {
    return {
      apiKey: { present: true, valid: true, message: "Clé présente" },
      zone: { present: false, name: null, valid: false, message: "BRIGHTDATA_WEB_UNLOCKER_ZONE manquant (créez une zone Web Unlocker dans Bright Data, ex: taobao_unlocker)" },
      datasets: datasetChecks,
    };
  }

  try {
    const r = await fetch("https://api.brightdata.com/request", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ zone, url: "https://httpbin.org/ip", format: "json", method: "GET" }),
    });
    const text = await r.text();
    let body: Record<string, unknown> | null = null;
    try { body = JSON.parse(text) as Record<string, unknown>; } catch { /* raw */ }
    const statusCode = typeof body?.status_code === "number" ? body.status_code : r.status;
    const errCode = typeof (body?.headers as Record<string, unknown> | undefined)?.["x-brd-err-code"] === "string"
      ? String((body?.headers as Record<string, unknown>)["x-brd-err-code"])
      : null;

    if (r.status === 401 || statusCode === 401) {
      return {
        apiKey: { present: true, valid: false, message: "Clé API rejetée (401). Régénérez la clé dans Bright Data > Account > API Keys." },
        zone: { present: true, name: zone, valid: false, message: "Test impossible : clé invalide" },
        datasets: datasetChecks,
      };
    }
    if (statusCode === 407 || errCode === "client_10001") {
      return {
        apiKey: { present: true, valid: false, message: "Bright Data refuse l'authentification proxy (407 client_10001). Vérifiez que la clé est de type 'API key' (Account Settings > API), pas un mot de passe de zone." },
        zone: { present: true, name: zone, valid: false, message: `Zone "${zone}" inaccessible avec cette clé. Vérifiez : 1) zone existe, 2) zone activée, 3) clé liée au bon compte.` },
        datasets: datasetChecks,
      };
    }
    if (!r.ok && r.status !== 200) {
      return {
        apiKey: { present: true, valid: false, message: `Bright Data renvoie HTTP ${r.status}. Réponse: ${text.slice(0, 200)}` },
        zone: { present: true, name: zone, valid: false, message: "Voir message clé API" },
        datasets: datasetChecks,
      };
    }
    return {
      apiKey: { present: true, valid: true, message: "Clé API valide ✓" },
      zone: { present: true, name: zone, valid: true, message: `Zone "${zone}" opérationnelle ✓` },
      datasets: datasetChecks,
    };
  } catch (e) {
    return {
      apiKey: { present: true, valid: false, message: `Erreur réseau lors du test : ${e instanceof Error ? e.message : String(e)}` },
      zone: { present: true, name: zone, valid: false, message: "Test non concluant" },
      datasets: datasetChecks,
    };
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

function debugImport(stage: string, details: Record<string, unknown>) {
  const safe = Object.fromEntries(
    Object.entries(details).map(([k, v]) => [
      k,
      typeof v === "string" && v.length > 500 ? `${v.slice(0, 500)}…` : v,
    ]),
  );
  console.info(`[TaobaoImport:${stage}]`, safe);
}

type BrowserFetchResult = { html: string; finalUrl: string; screenshotBase64?: string };

function normalizeUnlockerResponse(text: string, fallbackUrl: string): BrowserFetchResult | null {
  if (!text.trim()) return null;
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const statusCode = typeof json.status_code === "number" ? json.status_code : undefined;
    if (statusCode && statusCode >= 400) {
      debugImport("browser.proxy_error", { statusCode, fallbackUrl, body: text.slice(0, 300) });
      return null;
    }
    const nestedBody = isPlainRecord(json.body) ? json.body : null;
    const html =
      (typeof json.body === "string" && json.body) ||
      (typeof nestedBody?.html === "string" && nestedBody.html) ||
      (typeof nestedBody?.content === "string" && nestedBody.content) ||
      (typeof json.html === "string" && json.html) ||
      (typeof json.content === "string" && json.content) ||
      (typeof json.markdown === "string" && json.markdown) ||
      "";
    const finalUrl =
      (typeof json.url === "string" && json.url) ||
      (typeof json.final_url === "string" && json.final_url) ||
      (typeof nestedBody?.url === "string" && nestedBody.url) ||
      (typeof nestedBody?.final_url === "string" && nestedBody.final_url) ||
      fallbackUrl;
    return html ? { html, finalUrl } : null;
  } catch {
    return { html: text, finalUrl: fallbackUrl };
  }
}

// Fetch a Taobao/Tmall page through Bright Data Scraping Browser (CDP) with
// the admin's saved session cookies injected. Returns null when no session is
// configured so the caller can fall back to other paths.
async function fetchWithTaobaoSession(url: string, platform: Platform): Promise<BrowserFetchResult | null> {
  if (platform !== "taobao" && platform !== "tmall") return null;
  if (!process.env.BRIGHTDATA_BROWSER_WSS_URL) return null;
  let cookies: import("./cdp-client.server").CdpCookie[] | null = null;
  try {
    const { loadTaobaoCookies } = await import("./taobao-session.server");
    cookies = await loadTaobaoCookies();
  } catch (e) {
    debugImport("session.load.error", { message: e instanceof Error ? e.message : String(e) });
    return null;
  }
  if (!cookies?.length) {
    debugImport("session.skip", { reason: "no_session", url });
    return null;
  }
  const { CdpClient } = await import("./cdp-client.server");
  const { TAOBAO_MOBILE_UA, markTaobaoSessionExpired } = await import("./taobao-session.server");
  let client: import("./cdp-client.server").CdpClient | null = null;
  try {
    client = CdpClient.fromEnv();
    await client.connect();
    await client.createPageTarget("about:blank");
    await client.setUserAgent(TAOBAO_MOBILE_UA);
    await client.setCookies(cookies);
    await client.navigate(url, 6000);
    const finalUrl = (await client.evaluate<string>(`location.href`)) || url;
    if (/login\.taobao\.com|login\.tmall\.com|punish\?/i.test(finalUrl)) {
      debugImport("session.expired", { finalUrl });
      await markTaobaoSessionExpired().catch(() => undefined);
      return null;
    }
    const html = (await client.evaluate<string>(`document.documentElement.outerHTML`)) || "";
    if (!html || html.length < 500) {
      debugImport("session.empty", { url, bytes: html.length });
      return null;
    }
    debugImport("session.ok", { url, finalUrl, bytes: html.length });
    return { html, finalUrl };
  } catch (e) {
    debugImport("session.exception", { message: e instanceof Error ? e.message : String(e), url });
    return null;
  } finally {
    try { await client?.close(); } catch { /* ignore */ }
  }
}

async function fetchWithBrightDataBrowser(url: string): Promise<BrowserFetchResult | null> {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  const zone = process.env.BRIGHTDATA_BROWSER_ZONE ?? process.env.BRIGHTDATA_WEB_UNLOCKER_ZONE;
  if (!apiKey || !zone) {
    debugImport("browser.skip", { reason: "BRIGHTDATA_BROWSER_ZONE/WEB_UNLOCKER_ZONE absent", url });
    return null;
  }
  const sessionId = `kawzone-${Math.abs([...url].reduce((n, c) => n + c.charCodeAt(0), 0))}-${Date.now().toString(36)}`;
  const targetHeaders = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.7,en;q=0.6,fr;q=0.5",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    Referer: "https://www.taobao.com/",
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": "iOS",
  };
  try {
    const r = await fetch("https://api.brightdata.com/request", {
      method: "POST",
      signal: AbortSignal.timeout(55_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        zone,
        url,
        format: "json",
        method: "GET",
        country: "cn",
        render: true,
        session: sessionId,
        headers: targetHeaders,
      }),
    });
    const text = await r.text();
    if (!r.ok) {
      debugImport("browser.error", { status: r.status, body: text.slice(0, 300), url });
      return null;
    }
    const parsed = normalizeUnlockerResponse(text, url);
    if (!parsed?.html) {
      debugImport("browser.empty", { bytes: text.length, url, responsePreview: text.slice(0, 200) });
      return null;
    }
    debugImport("browser.ok", { bytes: parsed.html.length, url, finalUrl: parsed.finalUrl, session: sessionId });
    return parsed;
  } catch (e) {
    debugImport("browser.exception", { message: e instanceof Error ? e.message : String(e), url });
    return null;
  }
}

async function fetchScreenshotWithBrightData(url: string): Promise<string | null> {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  const zone = process.env.BRIGHTDATA_BROWSER_ZONE ?? process.env.BRIGHTDATA_WEB_UNLOCKER_ZONE;
  if (!apiKey || !zone) return null;
  try {
    const r = await fetch("https://api.brightdata.com/request", {
      method: "POST",
      signal: AbortSignal.timeout(35_000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ zone, url, format: "raw", data_format: "screenshot", country: "cn", render: true }),
    });
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    const base64 = Buffer.from(ab).toString("base64");
    debugImport("screenshot.ok", { bytes: ab.byteLength, url });
    return base64;
  } catch (e) {
    debugImport("screenshot.exception", { message: e instanceof Error ? e.message : String(e), url });
    return null;
  }
}

async function fetchWithFirecrawl(url: string): Promise<string | null> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) return null;
  try {
    const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      signal: AbortSignal.timeout(45_000),
      headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["html", "markdown"], onlyMainContent: false, waitFor: 3000 }),
    });
    const j = (await r.json().catch(() => null)) as { data?: { html?: string; markdown?: string; metadata?: { title?: string; ogImage?: string } } } | null;
    const html = j?.data?.html || j?.data?.markdown || "";
    debugImport(r.ok ? "firecrawl.ok" : "firecrawl.error", { status: r.status, bytes: html.length, url });
    return r.ok && html ? html : null;
  } catch (e) {
    debugImport("firecrawl.exception", { message: e instanceof Error ? e.message : String(e), url });
    return null;
  }
}

function stripTags(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractMeta(html: string, key: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']{1,1000})["']`, "i");
  const alt = new RegExp(`<meta[^>]+content=["']([^"']{1,1000})["'][^>]+(?:property|name)=["']${key}["']`, "i");
  return (html.match(re)?.[1] || html.match(alt)?.[1] || "").replace(/&amp;/g, "&").trim();
}

function extractHtmlImages(html: string): string[] {
  const out: string[] = [];
  const re = /(?:src|data-src|data-ks-lazyload|data-lazyload|data-original)=['"]((?:https?:)?\/\/[^'"]+\.(?:jpe?g|png|webp)(?:[^'"]*)?)['"]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let u = m[1].replace(/&amp;/g, "&");
    if (u.startsWith("//")) u = `https:${u}`;
    if (/sprite|icon|logo|avatar|captcha|loading|blank|pixel/i.test(u)) continue;
    out.push(u.replace(/_\d+x\d+(?:Q\d+)?\.(jpe?g|png|webp)(?:_\.webp)?$/i, ".$1"));
  }
  return Array.from(new Set(out)).slice(0, 20);
}

function decodeHtmlText(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).trim();
}

function extractJsonText(html: string, ...keys: string[]): string {
  for (const key of keys) {
    const m = html.match(new RegExp(`['"]${key}['"]\\s*:\\s*['"]([^'"]{2,500})['"]`, "i"));
    if (m?.[1]) return decodeHtmlText(m[1]);
  }
  return "";
}

function extractJsonPrice(html: string): number {
  const prices: number[] = [];
  const re = /(?:price|priceText|promotionPrice|salePrice|reservePrice|defaultItemPrice|discountPrice|finalPrice|amount|value)['"\s:=]+['"]?([0-9]+(?:\.[0-9]{1,2})?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0 && n < 1_000_000) prices.push(n);
  }
  return prices.length ? Math.min(...prices) : 0;
}

function extractJsonImages(html: string): string[] {
  const out: string[] = [];
  const re = /https?:\\?\/\\?\/[^"'\\\s<>]+\.(?:jpe?g|png|webp)(?:[^"'\\\s<>]*)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let u = m[0].replace(/\\\//g, "/").replace(/&amp;/g, "&");
    if (/sprite|icon|logo|avatar|captcha|loading|blank|pixel/i.test(u)) continue;
    u = u.replace(/_\d+x\d+(?:Q\d+)?\.(jpe?g|png|webp)(?:_\.webp)?$/i, ".$1");
    out.push(u);
  }
  return Array.from(new Set(out)).slice(0, 20);
}

function extractHtmlVariants(html: string): NormalizedVariant[] {
  const values = new Set<string>();
  const re = /(?:valueName|name|text|title)['"]\s*:\s*['"]([^'"]{1,60})['"]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && values.size < 30) {
    const value = decodeHtmlText(m[1]).replace(/\s+/g, " ").trim();
    if (!value || /登录|淘宝|天猫|价格|库存|销量|客服|首页|详情|评价|captcha|login/i.test(value)) continue;
    if (/^[\d.,]+$/.test(value)) continue;
    values.add(value);
  }
  return Array.from(values).slice(0, 30).map((value) => ({ size: "", color: value, colorHex: "", stock: 0 }));
}

function normalizeFromHtml(html: string, url: string, platform: Platform, source: NormalizedProduct["extractionSource"]): NormalizedProduct {
  const titleTag = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1]?.trim() ?? "";
  const jsonTitle = extractJsonText(html, "title", "itemTitle", "item_title", "subject", "productName", "name");
  const title = decodeHtmlText(extractMeta(html, "og:title") || extractMeta(html, "twitter:title") || jsonTitle || titleTag.replace(/[-_].*?(淘宝|天猫|Tmall|Taobao).*$/i, "").trim());
  const description = decodeHtmlText(extractMeta(html, "og:description") || extractMeta(html, "description") || extractJsonText(html, "description", "desc", "subtitle") || stripTags(html).slice(0, 800));
  const image = extractMeta(html, "og:image");
  const images = image ? [image, ...extractHtmlImages(html), ...extractJsonImages(html)] : [...extractHtmlImages(html), ...extractJsonImages(html)];
  const priceMin = extractJsonPrice(html);
  const variants = extractHtmlVariants(html);
  return {
    platform,
    sourceUrl: url,
    sourceProductId: extractSourceProductId(url, platform),
    title,
    description,
    priceMin: Number.isFinite(priceMin) ? priceMin : 0,
    priceMax: Number.isFinite(priceMin) ? priceMin : 0,
    currency: platform === "unknown" ? "USD" : "CNY",
    images: Array.from(new Set(images)).slice(0, 15),
    variants,
    vendorName: null,
    extractionSource: source,
    raw: { html_preview: html.slice(0, 8000) },
  };
}

async function enhanceWithVision(product: NormalizedProduct, screenshotBase64: string): Promise<NormalizedProduct> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || !screenshotBase64) return product;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Analyse cette capture de page produit Taobao/Tmall/1688. Réponds uniquement en JSON strict: {\"is_product\":boolean,\"is_login\":boolean,\"is_captcha\":boolean,\"title\":string|null,\"price\":number|null,\"variants\":string[],\"reason\":string}. N'invente rien." },
            { type: "image_url", image_url: { url: `data:image/png;base64,${screenshotBase64}` } },
          ],
        }],
      }),
    });
    if (!r.ok) return product;
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = j.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/```$/i, "")) as Record<string, unknown>;
    if (parsed.is_login || parsed.is_captcha || parsed.is_product === false) return product;
    const title = typeof parsed.title === "string" && parsed.title.trim().length > product.title.length ? parsed.title.trim() : product.title;
    const price = typeof parsed.price === "number" && parsed.price > 0 ? parsed.price : product.priceMin;
    const variantValues = Array.isArray(parsed.variants) ? parsed.variants.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];
    const variants = product.variants.length > 0 ? product.variants : variantValues.slice(0, 30).map((v) => ({ size: "", color: v.slice(0, 60), colorHex: "", stock: 0 }));
    debugImport("vision.ok", { title, price, variants: variants.length, url: product.sourceUrl });
    return { ...product, title, priceMin: price, priceMax: price || product.priceMax, variants, raw: { ...(product.raw as Record<string, unknown>), vision: parsed } };
  } catch (e) {
    debugImport("vision.exception", { message: e instanceof Error ? e.message : String(e), url: product.sourceUrl });
    return product;
  }
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function flattenRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...record };
  const nestedKeys = ["product", "item", "data", "result", "details", "content", "offer"];
  for (const key of nestedKeys) {
    const v = record[key];
    if (isPlainRecord(v)) {
      for (const [nestedKey, nestedValue] of Object.entries(v)) {
        if (out[nestedKey] == null || out[nestedKey] === "") out[nestedKey] = nestedValue;
      }
    }
  }
  return out;
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

function normalizeRecord(record: unknown, sourceUrl: string, platform: Platform, extractionSource: NormalizedProduct["extractionSource"] = "brightdata_dataset"): NormalizedProduct {
  const r = flattenRecord((record && typeof record === "object" ? record : {}) as Record<string, unknown>);
  const title = pickStr(r, "title", "name", "product_name", "item_title", "subject", "goods_title");
  const description = pickStr(r, "description", "desc", "product_description", "details", "detail", "short_description");
  const priceMin = pickNum(r, "price_min", "min_price", "price", "current_price", "sale_price", "promotion_price", "final_price");
  const priceMax = pickNum(r, "price_max", "max_price", "original_price", "list_price") || priceMin;
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
    extractionSource,
    raw: r,
  };
}

export function validateNormalizedProduct(product: NormalizedProduct): ProductValidationResult {
  const issues: string[] = [];
  const text = `${product.title}\n${product.description}`.toLowerCase();
  const rawText = JSON.stringify(product.raw ?? {}).slice(0, 20_000).toLowerCase();
  const combined = `${text}\n${rawText}`;

  const loginSignals = [
    "登录", "登陆", "亲，请登录", "sign in", "login", "password", "扫码登录", "账户登录", "tmall login", "taobao login",
  ];
  const securitySignals = [
    "验证码", "captcha", "安全验证", "security check", "身份验证", "滑块", "sec.taobao", "punish", "被拦截", "访问受限", "verify",
  ];
  const cleanTitle = product.title.replace(/\s+/g, "").trim();
  if (!cleanTitle || cleanTitle.length < 4) issues.push("Titre produit absent ou trop court");
  if (["登录", "登陆", "login", "connexion", "tmall", "taobao"].includes(cleanTitle.toLowerCase())) issues.push("Titre non produit détecté");
  if (/^(登录|登陆|sign\s*in|login|connexion)$/i.test(product.title.trim())) issues.push("Titre de page login détecté");

  const hasPrice = product.priceMin > 0 || product.priceMax > 0 || product.variants.some((v) => typeof v.price === "number" && v.price > 0);
  if (!hasPrice) issues.push("Prix source valide introuvable");

  const realImages = product.images.filter((u) => !/captcha|login|avatar|icon|logo|loading|blank|pixel|sprite/i.test(u));
  if (realImages.length === 0) issues.push("Image produit valide introuvable");

  if (product.platform !== "unknown" && !product.sourceProductId) issues.push("Identifiant produit source introuvable");

  const visibleLooksLogin = loginSignals.some((s) => text.includes(s));
  const rawLooksLogin = loginSignals.some((s) => rawText.includes(s));
  const looksSecurity = securitySignals.some((s) => combined.includes(s));
  const genericLoginShell = rawLooksLogin && /login|password|扫码登录|账户登录|验证码|captcha|security check|安全验证/i.test(combined);
  if (visibleLooksLogin || genericLoginShell) issues.push("Page de connexion détectée");
  if (looksSecurity) issues.push("Page sécurité/captcha détectée");
  let confidence = 0;
  if (cleanTitle.length >= 8) confidence += 25;
  if (hasPrice) confidence += 25;
  if (realImages.length >= 1) confidence += 20;
  if (product.sourceProductId) confidence += 15;
  if (product.variants.length > 0) confidence += 10;
  if (product.extractionSource === "brightdata_dataset") confidence += 5;
  if (visibleLooksLogin || genericLoginShell || looksSecurity) confidence -= 60;
  confidence = Math.max(0, Math.min(100, confidence));
  if (product.platform !== "unknown" && confidence < 70) issues.push(`Score de confiance insuffisant (${confidence}/100)`);

  return {
    valid: issues.length === 0,
    reason: issues[0] ?? null,
    issues,
    confidence,
  };
}

// ──────────────────────────────────────────────
// API publique

/**
 * Scrape un produit unique Taobao/Tmall/1688.
 * Renvoie null si Bright Data n'est pas configuré, échoue, ou plateforme inconnue.
 */
function statusFromIssues(issues: string[]): ImportAttemptLog["status"] {
  const text = issues.join(" ").toLowerCase();
  if (/captcha|sécurité|security|验证码/.test(text)) return "captcha";
  if (/connexion|login|登录|登陆/.test(text)) return "login";
  return "invalid_data";
}

export async function scrapeProductWithBrightDataDetailed(rawUrl: string): Promise<{ product: NormalizedProduct | null; log: ImportAttemptLog }> {
  const url = await resolveTaobaoShortLink(rawUrl);
  const platform = detectPlatform(url);
  if (platform === "unknown") {
    return { product: null, log: { initialUrl: rawUrl, finalUrl: url, source: "none", status: "blocked", reason: "Plateforme non supportée", issues: ["Plateforme non supportée"] } };
  }

  debugImport("start", { rawUrl, resolvedUrl: url, platform, productId: extractSourceProductId(url, platform) });
  let lastLog: ImportAttemptLog = { initialUrl: rawUrl, finalUrl: url, source: "none", status: "invalid_data", reason: "Aucune extraction lancée", issues: [] };

  const browserResult = await fetchWithBrightDataBrowser(url);
  if (browserResult) {
    const browserUrl = canonicalizeUrl(browserResult.finalUrl || url);
    const browserPlatform = detectPlatform(browserUrl) === "unknown" ? platform : detectPlatform(browserUrl);
    let browserProduct = normalizeFromHtml(browserResult.html, browserUrl, browserPlatform, "brightdata_browser");
    let validation = validateNormalizedProduct(browserProduct);
    if (!validation.valid && !validation.issues.some((issue) => /connexion|login|captcha|sécurité/i.test(issue))) {
      const screenshot = browserResult.screenshotBase64 ?? await fetchScreenshotWithBrightData(browserUrl);
      if (screenshot) {
        browserProduct = await enhanceWithVision(browserProduct, screenshot);
        validation = validateNormalizedProduct(browserProduct);
      }
    }
    debugImport("browser.validation", {
      valid: validation.valid,
      issues: validation.issues,
      finalUrl: browserUrl,
      title: browserProduct.title,
      price: browserProduct.priceMin,
      images: browserProduct.images.length,
      variants: browserProduct.variants.length,
    });
    lastLog = { initialUrl: rawUrl, finalUrl: browserUrl, source: "brightdata_browser", status: validation.valid ? "success" : statusFromIssues(validation.issues), reason: validation.reason ?? "OK", issues: validation.issues };
    if (validation.valid) return { product: browserProduct, log: lastLog };
  }

  const datasetId = datasetIdFor(platform);
  if (!datasetId) {
    console.warn(`[BrightData] dataset non configuré pour ${platform}`);
  } else {
    debugImport("dataset.start", { platform, datasetId, url });
    const records = await triggerAndPoll(datasetId, [{ url }]);
    debugImport("dataset.result", { count: records?.length ?? 0, platform, datasetId });
    if (records && records.length > 0) {
      for (const rec of records) {
        const product = normalizeRecord(rec, url, platform, "brightdata_dataset");
        const validation = validateNormalizedProduct(product);
        debugImport("dataset.validation", {
          valid: validation.valid,
          issues: validation.issues,
          title: product.title,
          price: product.priceMin,
          images: product.images.length,
          variants: product.variants.length,
        });
        lastLog = { initialUrl: rawUrl, finalUrl: url, source: "brightdata_dataset", status: validation.valid ? "success" : statusFromIssues(validation.issues), reason: validation.reason ?? "OK", issues: validation.issues };
        if (validation.valid) return { product, log: lastLog };
      }
    }
  }

  const firecrawlHtml = await fetchWithFirecrawl(url);
  if (firecrawlHtml) {
    const product = normalizeFromHtml(firecrawlHtml, url, platform, "firecrawl");
    const validation = validateNormalizedProduct(product);
    debugImport("firecrawl.validation", {
      valid: validation.valid,
      issues: validation.issues,
      title: product.title,
      price: product.priceMin,
      images: product.images.length,
      variants: product.variants.length,
    });
    lastLog = { initialUrl: rawUrl, finalUrl: url, source: "firecrawl", status: validation.valid ? "success" : statusFromIssues(validation.issues), reason: validation.reason ?? "OK", issues: validation.issues };
    if (validation.valid) return { product, log: lastLog };
  }

  debugImport("failed", { url, platform, reason: lastLog.reason || "Aucune source n'a fourni un vrai produit validé", issues: lastLog.issues });
  return { product: null, log: { ...lastLog, reason: lastLog.reason || "Aucune source n'a fourni un vrai produit validé" } };
}

export async function scrapeProductWithBrightData(rawUrl: string): Promise<NormalizedProduct | null> {
  const result = await scrapeProductWithBrightDataDetailed(rawUrl);
  return result.product;
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
