/**
 * taobao-cdp.ts
 * -------------
 * Service CDP (Chrome DevTools Protocol) via Bright Data Browser.
 * Connecte a Bright Data via WebSocket, pilote un vrai Chrome,
 * scrape Taobao/1688/Tmall avec JS rendu.
 */

// ── Configuration ──
const BRIGHTDATA_WSS = import.meta.env.VITE_BRIGHTDATA_WSS || "";

// ── Types ──
export interface CDPSession {
  id: string;
  ws: WebSocket | null;
  connected: boolean;
  pageUrl: string;
  cookies: any[];
  lastUsed: number;
}

export interface ScrapedProduct {
  name: string;
  description: string;
  price: number;
  currency: string;
  images: string[];
  variants: { size: string; color: string; colorHex: string; stock: number; price: number }[];
  shopName: string;
  shopId: string;
  itemId: string;
  category: string;
  skuList: string[];
  rawData: any;
}

export interface ScrapingLog {
  step: string;
  status: "pending" | "running" | "success" | "error" | "warning";
  message: string;
  timestamp: number;
}

let globalSession: CDPSession | null = null;

// ── Generate session key for encryption ──
function getOrCreateSessionKey(): string {
  let key = localStorage.getItem("TAOBAO_SESSION_KEY");
  if (!key) {
    key = crypto.randomUUID() + crypto.randomUUID();
    localStorage.setItem("TAOBAO_SESSION_KEY", key);
  }
  return key;
}

// ── Simple encrypt/decrypt for cookies ──
function encryptCookies(cookies: any[]): string {
  const key = getOrCreateSessionKey();
  // Simple XOR-based obfuscation (not production-grade but works for this use case)
  const json = JSON.stringify(cookies);
  let encrypted = "";
  for (let i = 0; i < json.length; i++) {
    encrypted += String.fromCharCode(json.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(encrypted);
}

function decryptCookies(encrypted: string): any[] {
  try {
    const key = getOrCreateSessionKey();
    const decoded = atob(encrypted);
    let json = "";
    for (let i = 0; i < decoded.length; i++) {
      json += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return JSON.parse(json);
  } catch { return []; }
}

// ── Session Storage ──
export function saveSessionCookies(cookies: any[]) {
  const encrypted = encryptCookies(cookies);
  localStorage.setItem("TAOBAO_COOKIES", encrypted);
  localStorage.setItem("TAOBAO_SESSION_TIME", String(Date.now()));
}

export function loadSessionCookies(): any[] {
  const encrypted = localStorage.getItem("TAOBAO_COOKIES");
  if (!encrypted) return [];
  return decryptCookies(encrypted);
}

export function isSessionValid(): boolean {
  const time = localStorage.getItem("TAOBAO_SESSION_TIME");
  if (!time) return false;
  // Session valid for 24 hours
  return Date.now() - Number(time) < 24 * 60 * 60 * 1000;
}

export function clearSession() {
  localStorage.removeItem("TAOBAO_COOKIES");
  localStorage.removeItem("TAOBAO_SESSION_TIME");
  globalSession = null;
}

// ── CDP WebSocket Connection ──
export async function connectBrightData(): Promise<CDPSession> {
  if (!BRIGHTDATA_WSS) {
    throw new Error("VITE_BRIGHTDATA_WSS non configure");
  }

  if (globalSession?.connected) {
    globalSession.lastUsed = Date.now();
    return globalSession;
  }

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BRIGHTDATA_WSS);
    const session: CDPSession = {
      id: `session-${Date.now()}`,
      ws,
      connected: false,
      pageUrl: "",
      cookies: [],
      lastUsed: Date.now(),
    };

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("Timeout connexion Bright Data (10s)"));
    }, 10000);

    ws.onopen = () => {
      clearTimeout(timeout);
      session.connected = true;
      globalSession = session;

      // Enable required CDP domains
      ws.send(JSON.stringify({ id: 1, method: "Target.setDiscoverTargets", params: { discover: true } }));
      ws.send(JSON.stringify({ id: 2, method: "Runtime.enable" }));
      ws.send(JSON.stringify({ id: 3, method: "Network.enable" }));
      ws.send(JSON.stringify({ id: 4, method: "Page.enable" }));

      resolve(session);
    };

    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(new Error("Erreur WebSocket Bright Data"));
    };

    ws.onclose = () => {
      session.connected = false;
      globalSession = null;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        // Handle CDP events
        if (msg.method === "Target.targetCreated") {
          // New target (page) created
        }
      } catch { /* ignore parse errors */ }
    };
  });
}

// ── Navigate to page ──
export async function navigateTo(session: CDPSession, url: string): Promise<void> {
  if (!session.ws || session.ws.readyState !== WebSocket.OPEN) {
    throw new Error("Session non connectee");
  }

  return new Promise((resolve, reject) => {
    const navTimeout = setTimeout(() => reject(new Error("Timeout navigation (15s)")), 15000);

    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.method === "Page.loadEventFired" || msg.method === "Page.domContentEventFired") {
          clearTimeout(navTimeout);
          session.ws?.removeEventListener("message", handler);
          resolve();
        }
      } catch { /* ignore */ }
    };

    session.ws.addEventListener("message", handler);

    // Navigate
    session.ws.send(JSON.stringify({
      id: Date.now(),
      method: "Page.navigate",
      params: { url }
    }));
  });
}

// ── Execute JS in page ──
export async function executeJS(session: CDPSession, script: string): Promise<any> {
  if (!session.ws || session.ws.readyState !== WebSocket.OPEN) {
    throw new Error("Session non connectee");
  }

  return new Promise((resolve, reject) => {
    const execTimeout = setTimeout(() => reject(new Error("Timeout execution JS (10s)")), 10000);
    const requestId = Date.now();

    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id === requestId) {
          clearTimeout(execTimeout);
          session.ws?.removeEventListener("message", handler);
          if (msg.result?.result?.value !== undefined) {
            resolve(msg.result.result.value);
          } else {
            resolve(null);
          }
        }
      } catch { /* ignore */ }
    };

    session.ws.addEventListener("message", handler);

    session.ws.send(JSON.stringify({
      id: requestId,
      method: "Runtime.evaluate",
      params: {
        expression: script,
        returnByValue: true,
        awaitPromise: true,
      }
    }));
  });
}

// ── Get cookies ──
export async function getCookies(session: CDPSession): Promise<any[]> {
  if (!session.ws || session.ws.readyState !== WebSocket.OPEN) return [];

  return new Promise((resolve) => {
    const requestId = Date.now();
    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id === requestId) {
          session.ws?.removeEventListener("message", handler);
          resolve(msg.result?.cookies || []);
        }
      } catch { resolve([]); }
    };

    session.ws.addEventListener("message", handler);
    session.ws.send(JSON.stringify({ id: requestId, method: "Network.getAllCookies" }));
  });
}

// ── Set cookies ──
export async function setCookies(session: CDPSession, cookies: any[]): Promise<void> {
  if (!session.ws || session.ws.readyState !== WebSocket.OPEN) return;

  for (const cookie of cookies) {
    session.ws.send(JSON.stringify({
      id: Date.now(),
      method: "Network.setCookie",
      params: {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || "/",
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        expires: cookie.expires,
      }
    }));
  }
}

// ── Get QR Code for Taobao login ──
export async function getTaobaoQRCode(session: CDPSession): Promise<{ qrUrl: string | null; error: string | null }> {
  try {
    await navigateTo(session, "https://login.taobao.com/member/login.jhtml");

    // Wait for QR code to appear
    await new Promise(r => setTimeout(r, 3000));

    // Extract QR code image URL
    const qrUrl = await executeJS(session, `
      (() => {
        const img = document.querySelector('.qrcode-img') || 
                    document.querySelector('[class*="qrcode"] img') ||
                    document.querySelector('[class*="qr"] img');
        return img ? img.src : null;
      })()
    `);

    return { qrUrl, error: qrUrl ? null : "QR code non trouve sur la page" };
  } catch (e: any) {
    return { qrUrl: null, error: e.message };
  }
}

// ── Check login status ──
export async function checkLoginStatus(session: CDPSession): Promise<boolean> {
  try {
    const isLoggedIn = await executeJS(session, `
      (() => {
        // Check if user is logged in by looking for avatar or username
        const avatar = document.querySelector('.site-nav-user-avatar') ||
                      document.querySelector('[class*="avatar"]') ||
                      document.querySelector('[class*="user-info"]');
        const hasLoginCookie = document.cookie.includes('_tb_token_') || 
                              document.cookie.includes('cookie2');
        return !!(avatar || hasLoginCookie);
      })()
    `);
    return !!isLoggedIn;
  } catch { return false; }
}

// ── Scrape product from Taobao/1688 ──
export async function scrapeProductPage(
  session: CDPSession,
  url: string,
  onLog?: (log: ScrapingLog) => void
): Promise<ScrapedProduct | null> {
  const log = (step: string, status: ScrapingLog["status"], message: string) => {
    const entry = { step, status, message, timestamp: Date.now() };
    onLog?.(entry);
  };

  try {
    log("Navigation", "running", `Chargement de ${url.slice(0, 60)}...`);

    // Load saved cookies first
    const savedCookies = loadSessionCookies();
    if (savedCookies.length > 0) {
      log("Session", "running", "Restauration cookies sauvegardes...");
      await setCookies(session, savedCookies);
    }

    await navigateTo(session, url);

    // Wait for JS rendering
    log("Render", "running", "Attente rendu JavaScript (3s)...");
    await new Promise(r => setTimeout(r, 3000));

    // Check if logged in
    const isLoggedIn = await checkLoginStatus(session);
    log("Auth", isLoggedIn ? "success" : "warning", isLoggedIn ? "Connecte a Taobao" : "Non connecte - scraping limite possible");

    // Extract product data
    log("Extract", "running", "Extraction donnees produit...");

    const result = await executeJS(session, `
      (() => {
        const data = {
          name: "",
          price: 0,
          currency: "CNY",
          images: [],
          variants: [],
          shopName: "",
          shopId: "",
          itemId: "",
          category: "",
          skuList: [],
        };

        // Title
        const titleEl = document.querySelector('h1[data-spm="title"]') ||
                       document.querySelector('.tb-detail-hd h1') ||
                       document.querySelector('[class*="ItemTitle"]') ||
                       document.querySelector('h1');
        data.name = titleEl ? titleEl.textContent.trim() : "";

        // Price
        const priceEl = document.querySelector('.tb-rmb-num') ||
                       document.querySelector('[class*="notranslate"]') ||
                       document.querySelector('[class*="price"] [class*="num"]');
        if (priceEl) {
          const priceText = priceEl.textContent.replace(/[^0-9.]/g, "");
          data.price = parseFloat(priceText) || 0;
        }

        // Images
        const imgEls = document.querySelectorAll('[class*="pic"] img, [class*="gallery"] img, [class*="itemPic"] img');
        imgEls.forEach(img => {
          const src = img.src || img.dataset.src;
          if (src && src.includes('alicdn.com')) data.images.push(src.replace(/_\d+x\d+/, "_800x800"));
        });
        // Deduplicate
        data.images = [...new Set(data.images)].slice(0, 10);

        // Variants
        const skuEls = document.querySelectorAll('[class*="sku"] [class*="value"], [class*="prop"] [class*="value"]');
        skuEls.forEach(el => {
          const text = el.textContent.trim();
          if (text) data.skuList.push(text);
        });

        // Shop
        const shopEl = document.querySelector('[class*="shopname"]') ||
                      document.querySelector('[class*="shop-name"]');
        data.shopName = shopEl ? shopEl.textContent.trim() : "";

        // Item ID from URL
        const urlMatch = location.href.match(/[?&]id=(\d+)/);
        data.itemId = urlMatch ? urlMatch[1] : "";

        return data;
      })()
    `);

    if (!result || !result.name) {
      log("Extract", "error", "Donnees produit non trouvees - page bloquee ou structure inconnue");
      return null;
    }

    log("Extract", "success", `Produit trouve : ${result.name.slice(0, 40)} | Prix : ${result.price}`);

    // Save cookies for next time
    const cookies = await getCookies(session);
    if (cookies.length > 0) {
      saveSessionCookies(cookies);
      log("Session", "success", `${cookies.length} cookies sauvegardes`);
    }

    return {
      name: result.name || "Produit Taobao",
      description: `${result.name} - Produit importe depuis ${result.shopName || "Taobao"}`,
      price: result.price ? Math.round(result.price * 85) : 0, // Convert to FCFA (approx)
      currency: "CNY",
      images: result.images || [],
      variants: result.skuList?.map((sku: string) => ({
        size: sku.length < 10 ? sku : "",
        color: sku.length >= 10 ? sku.slice(0, 20) : "",
        colorHex: "",
        stock: 0,
        price: 0,
      })) || [],
      shopName: result.shopName || "",
      shopId: result.shopId || "",
      itemId: result.itemId || "",
      category: "",
      skuList: result.skuList || [],
      rawData: result,
    };
  } catch (e: any) {
    log("Error", "error", e.message);
    return null;
  }
}

// ── Disconnect ──
export function disconnect(session: CDPSession) {
  if (session.ws) {
    session.ws.close();
  }
  session.connected = false;
  if (globalSession?.id === session.id) {
    globalSession = null;
  }
}
