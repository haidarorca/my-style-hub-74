// ═══════════════════════════════════════════════════════════════
// Fonctions serveur CJdropshipping — réservées aux administrateurs.
//
// Étape 1 : connexion + lecture d'un produit de test UNIQUEMENT.
// Aucune importation, aucune commande, aucune synchronisation.
// Les jetons CJ ne sont jamais renvoyés au navigateur.
// ═══════════════════════════════════════════════════════════════
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CjCallTrace } from "@/lib/cj/client.server";

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Accès réservé aux administrateurs.");
}

export interface CjConnectionState {
  is_connected: boolean;
  last_checked_at: string | null;
  last_error: string | null;
  last_endpoint: string | null;
  last_latency_ms: number | null;
  access_token_expiry: string | null;
  refresh_token_expiry: string | null;
  api_calls_count: number;
  credentials_configured: boolean;
}

/** État de la connexion affiché dans l'administration (jamais de jeton). */
export const getCjConnectionState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CjConnectionState> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("cj_connection_state")
      .select("*")
      .eq("id", "default")
      .maybeSingle();
    return {
      is_connected: data?.is_connected ?? false,
      last_checked_at: data?.last_checked_at ?? null,
      last_error: data?.last_error ?? null,
      last_endpoint: data?.last_endpoint ?? null,
      last_latency_ms: data?.last_latency_ms ?? null,
      access_token_expiry: data?.access_token_expiry ?? null,
      refresh_token_expiry: data?.refresh_token_expiry ?? null,
      api_calls_count: data?.api_calls_count ?? 0,
      // On expose seulement le fait que les identifiants existent, jamais leur valeur.
      credentials_configured: !!(process.env["CJ_EMAIL"] && process.env["CJ_API_KEY"]),
    };
  });

export interface CjTestResult {
  ok: boolean;
  error: string | null;
  tokenSource: string | null;
  accessTokenExpiry: string | null;
  refreshTokenExpiry: string | null;
  traces: CjCallTrace[];
  sampleCount: number | null;
}

/** Test réel de connexion : authentification + 1 lecture minimale. */
export const testCjConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CjTestResult> => {
    await assertAdmin(context);
    const { getCjAccessToken, cjGet, saveCjState } = await import("@/lib/cj/client.server");
    const traces: CjCallTrace[] = [];
    try {
      const auth = await getCjAccessToken(traces);
      // Lecture minimale : 1 produit seulement, pour économiser le quota.
      const list = await cjGet<any>("/product/list?pageNum=1&pageSize=1", traces);
      await saveCjState(
        {
          is_connected: true,
          last_error: null,
          access_token_expiry: auth.expiry,
          refresh_token_expiry: auth.refreshExpiry,
          api_calls_count: traces.length,
        },
        traces,
      );
      return {
        ok: true,
        error: null,
        tokenSource: auth.source,
        accessTokenExpiry: auth.expiry,
        refreshTokenExpiry: auth.refreshExpiry,
        traces,
        sampleCount: Array.isArray(list?.list) ? list.list.length : null,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur inconnue";
      await saveCjState({ is_connected: false, last_error: message }, traces);
      return {
        ok: false,
        error: message,
        tokenSource: null,
        accessTokenExpiry: null,
        refreshTokenExpiry: null,
        traces,
        sampleCount: null,
      };
    }
  });

/**
 * Lecture d'UN produit CJ (test). Renvoie les données brutes telles que
 * CJ les fournit — aucune donnée inventée, aucune écriture en base.
 */
export const readCjTestProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pid?: string | null }) => ({ pid: input?.pid ?? null }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { cjGet } = await import("@/lib/cj/client.server");
    const traces: CjCallTrace[] = [];
    try {
      let pid = data.pid;
      if (!pid) {
        const list = await cjGet<any>("/product/list?pageNum=1&pageSize=1", traces);
        pid = list?.list?.[0]?.pid ?? null;
        if (!pid) throw new Error("Aucun produit disponible sur ce compte CJ.");
      }
      const product = await cjGet<any>(
        `/product/query?pid=${encodeURIComponent(pid)}`,
        traces,
      );
      let variants: any = null;
      try {
        variants = await cjGet<any>(
          `/product/variant/query?pid=${encodeURIComponent(pid)}`,
          traces,
        );
      } catch {
        // Certains comptes exposent les variantes uniquement dans le produit.
        variants = product?.variants ?? null;
      }
      return { ok: true, error: null, pid, product, variants, traces };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Erreur inconnue",
        pid: null,
        product: null,
        variants: null,
        traces,
      };
    }
  });
