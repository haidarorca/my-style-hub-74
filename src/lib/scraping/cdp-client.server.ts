// Minimal CDP (Chrome DevTools Protocol) client over raw WebSocket.
// No native deps, Cloudflare Workers compatible. Talks to Bright Data
// Scraping Browser via the WSS endpoint in BRIGHTDATA_BROWSER_WSS_URL.

export type CdpCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
};

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class CdpClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private sessionId: string | null = null;
  private closed = false;

  static fromEnv(): CdpClient {
    const url = process.env.BRIGHTDATA_BROWSER_WSS_URL?.trim();
    if (!url) throw new Error("BRIGHTDATA_BROWSER_WSS_URL manquant");
    if (!url.startsWith("wss://")) throw new Error("BRIGHTDATA_BROWSER_WSS_URL doit commencer par wss://");
    return new CdpClient(url);
  }

  constructor(private wssUrl: string) {}

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.wssUrl);
      this.ws = ws;
      const onOpen = () => {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("error", onError);
        resolve();
      };
      const onError = (ev: Event) => {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("error", onError);
        reject(new Error("CDP WebSocket connection failed: " + String((ev as ErrorEvent)?.message ?? "unknown")));
      };
      ws.addEventListener("open", onOpen);
      ws.addEventListener("error", onError);
      ws.addEventListener("message", (ev) => this.handleMessage(ev.data as string));
      ws.addEventListener("close", () => this.handleClose());
    });
  }

  private handleMessage(raw: string): void {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    if (typeof msg.id === "number") {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(`CDP error ${msg.error.code}: ${msg.error.message}`));
      else p.resolve(msg.result);
    }
  }

  private handleClose(): void {
    this.closed = true;
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("CDP connection closed"));
    }
    this.pending.clear();
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}, timeoutMs = 30000): Promise<T> {
    if (!this.ws || this.closed) return Promise.reject(new Error("CDP not connected"));
    const id = this.nextId++;
    const payload: Record<string, unknown> = { id, method, params };
    if (this.sessionId) payload.sessionId = this.sessionId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      try { this.ws!.send(JSON.stringify(payload)); }
      catch (e) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(e as Error);
      }
    });
  }

  async createPageTarget(initialUrl = "about:blank"): Promise<void> {
    const t = await this.send<{ targetId: string }>("Target.createTarget", { url: initialUrl });
    const att = await this.send<{ sessionId: string }>("Target.attachToTarget", { targetId: t.targetId, flatten: true });
    this.sessionId = att.sessionId;
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Network.enable");
  }

  async setUserAgent(userAgent: string, acceptLanguage = "zh-CN,zh;q=0.9"): Promise<void> {
    await this.send("Network.setUserAgentOverride", { userAgent, acceptLanguage });
  }

  async navigate(url: string, waitMs = 8000): Promise<void> {
    await this.send("Page.navigate", { url }, 60000);
    // Best-effort load wait
    await new Promise((r) => setTimeout(r, waitMs));
  }

  async evaluate<T = unknown>(expression: string): Promise<T | null> {
    const res = await this.send<{ result: { value?: T; type: string } }>("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return (res?.result?.value ?? null) as T | null;
  }

  async screenshotElement(selector: string): Promise<string | null> {
    // Returns base64 PNG or null if element not found
    const box = await this.evaluate<{ x: number; y: number; w: number; h: number } | null>(
      `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return null;
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      })()`,
    );
    if (!box) return null;
    const res = await this.send<{ data: string }>("Page.captureScreenshot", {
      format: "png",
      clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 2 },
      captureBeyondViewport: true,
    });
    return res.data;
  }

  async getCookies(urls: string[]): Promise<CdpCookie[]> {
    const r = await this.send<{ cookies: CdpCookie[] }>("Network.getCookies", { urls });
    return r.cookies ?? [];
  }

  async setCookies(cookies: CdpCookie[]): Promise<void> {
    if (!cookies.length) return;
    await this.send("Network.setCookies", { cookies });
  }

  async close(): Promise<void> {
    this.closed = true;
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
  }
}
