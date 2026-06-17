// SSE endpoint that opens a Bright Data Scraping Browser session, navigates to
// Taobao login, streams the QR image to the admin UI, then watches for login
// completion and persists encrypted cookies. Admin-only.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { CdpClient } from "@/lib/scraping/cdp-client.server";
import { saveTaobaoCookies, TAOBAO_MOBILE_UA } from "@/lib/scraping/taobao-session.server";

const LOGIN_URL = "https://login.taobao.com/member/login.jhtml";

const QR_SELECTORS = [
  "canvas#J_QRCodeImg",
  "canvas.J_qrcodeImg",
  ".qrcode-img canvas",
  "#J_QRCodeImg img",
  ".login-qr-img img",
  "canvas",
];

async function assertAdmin(request: Request): Promise<void> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) throw new Response("Unauthorized", { status: 401 });
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) throw new Response("Server misconfigured", { status: 500 });
  const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data, error } = await sb.auth.getClaims(auth.slice(7));
  if (error || !data?.claims?.sub) throw new Response("Unauthorized", { status: 401 });
  const userId = data.claims.sub as string;
  const { data: roles } = await sb.from("user_roles").select("role,is_suspended").eq("user_id", userId);
  const ok = (roles ?? []).some(
    (r: { role: string; is_suspended: boolean }) =>
      !r.is_suspended && (r.role === "admin" || r.role === "super_admin"),
  );
  if (!ok) throw new Response("Forbidden", { status: 403 });
}

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const Route = createFileRoute("/api/admin/taobao-qr-stream")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await assertAdmin(request);
        } catch (e) {
          if (e instanceof Response) return e;
          return new Response("Unauthorized", { status: 401 });
        }

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const enc = new TextEncoder();
            const send = (event: string, data: unknown) => {
              try { controller.enqueue(enc.encode(sseFrame(event, data))); } catch { /* closed */ }
            };
            const heartbeat = setInterval(() => {
              try { controller.enqueue(enc.encode(`: keepalive\n\n`)); } catch { /* closed */ }
            }, 15000);

            let client: CdpClient | null = null;
            const startedAt = Date.now();
            const MAX_DURATION_MS = 150_000;

            try {
              send("status", { phase: "connecting" });
              client = CdpClient.fromEnv();
              await client.connect();
              await client.createPageTarget("about:blank");
              await client.setUserAgent(TAOBAO_MOBILE_UA);
              send("status", { phase: "navigating" });
              await client.navigate(LOGIN_URL, 4000);

              // Poll for QR element
              let qrBase64: string | null = null;
              let usedSelector: string | null = null;
              for (let i = 0; i < 30; i++) {
                if (Date.now() - startedAt > MAX_DURATION_MS) break;
                for (const sel of QR_SELECTORS) {
                  const shot = await client.screenshotElement(sel);
                  if (shot) { qrBase64 = shot; usedSelector = sel; break; }
                }
                if (qrBase64) break;
                await new Promise((r) => setTimeout(r, 1000));
              }
              if (!qrBase64) {
                send("error", { message: "QR code introuvable sur la page Taobao (sélecteur non trouvé)" });
                return;
              }
              send("qr", { image: qrBase64, selector: usedSelector });
              send("status", { phase: "waiting_scan" });

              // Poll for login success: URL changed away from login OR user element present
              let success = false;
              let nickname: string | null = null;
              while (Date.now() - startedAt < MAX_DURATION_MS) {
                await new Promise((r) => setTimeout(r, 2500));
                const state = await client.evaluate<{ url: string; nick: string | null }>(
                  `(() => ({
                    url: location.href,
                    nick: (document.querySelector('.site-nav-user .site-nav-login-info-nick')?.textContent
                      || document.querySelector('.member-info .nick')?.textContent
                      || document.querySelector('[class*="user-nick"]')?.textContent
                      || null)
                  }))()`,
                );
                const url = state?.url ?? "";
                if (state?.nick) nickname = state.nick.trim();
                if (url && !/login\.taobao\.com\/member\/login/.test(url)) { success = true; break; }
                if (nickname) { success = true; break; }
                // Refresh QR if it expired on the page
                const expired = await client.evaluate<boolean>(
                  `!!document.querySelector('.qrcode-refresh, .iconfont-refresh, .login-iframe-refresh')`,
                );
                if (expired) {
                  send("status", { phase: "qr_expired_on_page" });
                  break;
                }
              }

              if (!success) {
                send("expired", { message: "QR code expiré ou non scanné dans le délai" });
                return;
              }

              send("status", { phase: "capturing_cookies" });
              // Navigate to a Taobao home page to ensure all session cookies are set
              await client.navigate("https://h5.m.taobao.com/", 3000).catch(() => undefined);
              const cookies = await client.getCookies([
                "https://www.taobao.com",
                "https://h5.m.taobao.com",
                "https://login.taobao.com",
                "https://world.taobao.com",
                "https://www.tmall.com",
                "https://detail.tmall.com",
              ]);
              if (!cookies.length) {
                send("error", { message: "Aucun cookie récupéré après connexion" });
                return;
              }
              await saveTaobaoCookies(cookies, TAOBAO_MOBILE_UA, nickname);
              send("success", { nickname, cookieCount: cookies.length });
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              send("error", { message: msg });
            } finally {
              clearInterval(heartbeat);
              try { await client?.close(); } catch { /* ignore */ }
              try { controller.close(); } catch { /* ignore */ }
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
