import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  clearTaobaoSession,
  getTaobaoSessionStatus,
  loadTaobaoCookies,
  markTaobaoSessionExpired,
  TAOBAO_MOBILE_UA,
  type TaobaoSessionStatus,
} from "@/lib/scraping/taobao-session.server";
import { CdpClient } from "@/lib/scraping/cdp-client.server";

async function assertAdmin(supabase: { from: (t: string) => any }, userId: string): Promise<void> {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role,is_suspended")
    .eq("user_id", userId);
  const ok = (roles ?? []).some(
    (r: { role: string; is_suspended: boolean }) =>
      !r.is_suspended && (r.role === "admin" || r.role === "super_admin"),
  );
  if (!ok) throw new Error("Forbidden");
}

export const getTaobaoSessionStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TaobaoSessionStatus> => {
    await assertAdmin(context.supabase, context.userId);
    return getTaobaoSessionStatus();
  });

export const disconnectTaobaoSessionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    await assertAdmin(context.supabase, context.userId);
    await clearTaobaoSession();
    return { ok: true };
  });

export const testTaobaoSessionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; nickname: string | null; message: string }> => {
    await assertAdmin(context.supabase, context.userId);
    const cookies = await loadTaobaoCookies();
    if (!cookies?.length) {
      return { ok: false, nickname: null, message: "Aucune session enregistrée." };
    }
    let client: CdpClient | null = null;
    try {
      client = CdpClient.fromEnv();
      await client.connect();
      await client.createPageTarget("about:blank");
      await client.setUserAgent(TAOBAO_MOBILE_UA);
      await client.setCookies(cookies);
      await client.navigate("https://h5.m.taobao.com/mine/index.html", 5000);
      const nick = await client.evaluate<string | null>(
        `document.querySelector('[class*="nick"]')?.textContent?.trim() || null`,
      );
      const url = await client.evaluate<string>(`location.href`);
      const stillLogged = !!nick || (typeof url === "string" && !/login/i.test(url));
      if (!stillLogged) {
        await markTaobaoSessionExpired();
        return { ok: false, nickname: null, message: "Session expirée — reconnectez-vous." };
      }
      return { ok: true, nickname: nick ?? null, message: "Session active." };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, nickname: null, message: `Test échoué : ${msg}` };
    } finally {
      try { await client?.close(); } catch { /* ignore */ }
    }
  });
