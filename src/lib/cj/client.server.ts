// ═══════════════════════════════════════════════════════════════
// Client CJdropshipping — SERVEUR UNIQUEMENT
//
// Ce fichier n'est jamais envoyé au navigateur (*.server.ts est bloqué
// côté client). Les identifiants CJ (CJ_EMAIL / CJ_API_KEY) et les jetons
// ne sortent jamais du serveur.
//
// Documentation : https://developers.cjdropshipping.cn/en/api/introduction.html
// Auth : POST /authentication/getAccessToken  (1 appel / 300 s max)
//        POST /authentication/refreshAccessToken
// Le jeton d'accès (15 jours) est conservé en base pour éviter de
// redemander un jeton à chaque appel — CJ limite fortement cet endpoint.
// ═══════════════════════════════════════════════════════════════

export const CJ_BASE_URL = "https://developers.cjdropshipping.com/api2.0/v1";

export interface CjCallTrace {
  endpoint: string;
  method: string;
  status: number;
  latencyMs: number;
  cjCode: number | null;
  cjMessage: string | null;
  /** En-têtes de quota renvoyés par CJ, s'ils existent. */
  quotaHeaders: Record<string, string>;
  /** Points CJ consommés aujourd'hui / restants, si CJ les renvoie. */
  pointsUsedToday: number | null;
  pointsRemaining: number | null;
}

export interface CjResult<T> {
  ok: boolean;
  data: T | null;
  error: string | null;
  traces: CjCallTrace[];
}

const QUOTA_HEADER_HINTS = ["quota", "limit", "remain", "ratelimit", "credit", "point"];

function pickQuotaHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (QUOTA_HEADER_HINTS.some((h) => k.includes(h))) out[key] = value;
  });
  return out;
}

/** Parse une date CJ ("2026-10-01 12:00:00", UTC) en ISO. */
function parseCjDate(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  const iso = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function cjFetch(
  path: string,
  init: RequestInit,
  traces: CjCallTrace[],
): Promise<{ status: number; body: any; headers: Headers }> {
  const started = Date.now();
  const res = await fetch(`${CJ_BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  });
  const latencyMs = Date.now() - started;
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  traces.push({
    endpoint: path,
    method: init.method ?? "GET",
    status: res.status,
    latencyMs,
    cjCode: typeof body?.code === "number" ? body.code : null,
    cjMessage: typeof body?.message === "string" ? body.message : null,
    quotaHeaders: pickQuotaHeaders(res.headers),
    pointsUsedToday: typeof body?.pointsInfo?.usedToday === "number" ? body.pointsInfo.usedToday : null,
    pointsRemaining: typeof body?.pointsInfo?.remaining === "number" ? body.pointsInfo.remaining : null,
  });
  return { status: res.status, body, headers: res.headers };
}

type StoredToken = {
  access_token: string | null;
  refresh_token: string | null;
  access_token_expiry: string | null;
  refresh_token_expiry: string | null;
};

function credentials() {
  const email = process.env["CJ_EMAIL"];
  const apiKey = process.env["CJ_API_KEY"];
  if (!email || !apiKey) {
    throw new Error(
      "Identifiants CJ absents. Enregistrez CJ_EMAIL et CJ_API_KEY dans les secrets du projet.",
    );
  }
  return { email, apiKey };
}

const EXPIRY_MARGIN_MS = 60 * 60 * 1000; // on renouvelle 1 h avant l'échéance

/**
 * Renvoie un jeton d'accès valide : réutilise celui stocké s'il est encore
 * bon, sinon le rafraîchit, sinon en demande un nouveau.
 */
export async function getCjAccessToken(
  traces: CjCallTrace[],
): Promise<{ token: string; expiry: string | null; refreshExpiry: string | null; source: "cache" | "refresh" | "login" }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await (supabaseAdmin as any)
    .from("cj_auth_tokens")
    .select("access_token, refresh_token, access_token_expiry, refresh_token_expiry")
    .eq("id", "default")
    .maybeSingle();
  const stored = (row ?? null) as StoredToken | null;

  const now = Date.now();
  const accessValid =
    stored?.access_token &&
    stored.access_token_expiry &&
    new Date(stored.access_token_expiry).getTime() - EXPIRY_MARGIN_MS > now;

  if (accessValid) {
    return {
      token: stored!.access_token!,
      expiry: stored!.access_token_expiry,
      refreshExpiry: stored!.refresh_token_expiry,
      source: "cache",
    };
  }

  const refreshValid =
    stored?.refresh_token &&
    stored.refresh_token_expiry &&
    new Date(stored.refresh_token_expiry).getTime() > now;

  let body: any = null;
  let source: "refresh" | "login" = "login";

  if (refreshValid) {
    const r = await cjFetch(
      "/authentication/refreshAccessToken",
      { method: "POST", body: JSON.stringify({ refreshToken: stored!.refresh_token }) },
      traces,
    );
    if (r.body?.result === true && r.body?.data?.accessToken) {
      body = r.body;
      source = "refresh";
    }
  }

  if (!body) {
    const { email, apiKey } = credentials();
    const r = await cjFetch(
      "/authentication/getAccessToken",
      // CJ attend la clé API dans le champ « password » (mode apiKey).
      { method: "POST", body: JSON.stringify({ email, password: apiKey }) },
      traces,
    );
    if (r.body?.result !== true || !r.body?.data?.accessToken) {
      throw new Error(
        `Authentification CJ refusée : ${r.body?.message ?? `HTTP ${r.status}`}`,
      );
    }
    body = r.body;
    source = "login";
  }

  const accessToken: string = body.data.accessToken;
  const accessExpiry = parseCjDate(body.data.accessTokenExpiryDate);
  const refreshExpiry = parseCjDate(body.data.refreshTokenExpiryDate);

  await (supabaseAdmin as any).from("cj_auth_tokens").upsert({
    id: "default",
    access_token: accessToken,
    refresh_token: body.data.refreshToken ?? stored?.refresh_token ?? null,
    access_token_expiry: accessExpiry,
    refresh_token_expiry: refreshExpiry ?? stored?.refresh_token_expiry ?? null,
    obtained_at: new Date().toISOString(),
  });

  return { token: accessToken, expiry: accessExpiry, refreshExpiry, source };
}

/** Erreur de limite de débit CJ (code 1600200 / HTTP 429) : réessayable. */
export class CjRateLimitError extends Error {
  retryable = true;
}

// CJ autorise ~2 requêtes/seconde par défaut : on espace les appels.
let lastCallAt = 0;
const MIN_INTERVAL_MS = 600;
async function throttle() {
  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  lastCallAt = Math.max(Date.now(), lastCallAt + MIN_INTERVAL_MS);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

/** Appel authentifié à l'API CJ (GET), espacé et réessayé en cas de limite de débit. */
export async function cjGet<T = any>(
  path: string,
  traces: CjCallTrace[],
): Promise<T> {
  const { token } = await getCjAccessToken(traces);
  for (let attempt = 0; ; attempt += 1) {
    await throttle();
    const r = await cjFetch(path, { method: "GET", headers: { "CJ-Access-Token": token } }, traces);
    if (r.body?.result === true) return r.body.data as T;
    const limited = r.status === 429 || r.body?.code === 1600200;
    if (limited && attempt < 3) {
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1) + Math.random() * 500));
      continue;
    }
    const msg = `CJ ${path} : ${r.body?.message ?? `HTTP ${r.status}`}`;
    if (limited) throw new CjRateLimitError(msg);
    throw new Error(msg);
  }
}

/** Appel authentifié à l'API CJ (POST). Renvoie l'enveloppe complète CJ. */
export async function cjPostRaw(
  path: string,
  body: unknown,
  traces: CjCallTrace[],
): Promise<{ status: number; body: any }> {
  const { token } = await getCjAccessToken(traces);
  const r = await cjFetch(
    path,
    { method: "POST", headers: { "CJ-Access-Token": token }, body: JSON.stringify(body) },
    traces,
  );
  return { status: r.status, body: r.body };
}

/** Appel authentifié POST qui lève une erreur si CJ ne renvoie pas result=true. */
export async function cjPost<T = any>(
  path: string,
  body: unknown,
  traces: CjCallTrace[],
): Promise<T> {
  const r = await cjPostRaw(path, body, traces);
  if (r.body?.result !== true) {
    throw new Error(`CJ ${path} : ${r.body?.message ?? `HTTP ${r.status}`}`);
  }
  return r.body.data as T;
}

/** Enregistre l'état de connexion pour l'écran d'administration. */
export async function saveCjState(patch: Record<string, unknown>, traces: CjCallTrace[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const last = traces[traces.length - 1];
  await (supabaseAdmin as any).from("cj_connection_state").upsert({
    id: "default",
    last_checked_at: new Date().toISOString(),
    last_endpoint: last?.endpoint ?? null,
    last_latency_ms: last?.latencyMs ?? null,
    ...patch,
  });
}
