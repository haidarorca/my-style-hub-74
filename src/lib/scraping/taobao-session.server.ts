// Helpers to persist Taobao session cookies encrypted in DB.
// Uses pgcrypto RPCs defined in migration. The encryption key
// (TAOBAO_SESSION_KEY) never leaves the server.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { CdpCookie } from "./cdp-client.server";

function getKey(): string {
  const k = process.env.TAOBAO_SESSION_KEY?.trim();
  if (!k || k.length < 16) {
    throw new Error("TAOBAO_SESSION_KEY manquant ou trop court (≥16 caractères requis)");
  }
  return k;
}

export type TaobaoSessionStatus = {
  status: "disconnected" | "connected" | "expired" | "pending";
  nickname: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
  lastCheckAt: string | null;
};

export async function getTaobaoSessionStatus(): Promise<TaobaoSessionStatus> {
  const { data, error } = await supabaseAdmin
    .from("taobao_sessions" as never)
    .select("status, nickname, connected_at, expires_at, last_check_at")
    .eq("id", "main")
    .maybeSingle();
  if (error || !data) {
    return { status: "disconnected", nickname: null, connectedAt: null, expiresAt: null, lastCheckAt: null };
  }
  const row = data as Record<string, unknown>;
  return {
    status: (row.status as TaobaoSessionStatus["status"]) ?? "disconnected",
    nickname: (row.nickname as string | null) ?? null,
    connectedAt: (row.connected_at as string | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
    lastCheckAt: (row.last_check_at as string | null) ?? null,
  };
}

export async function saveTaobaoCookies(cookies: CdpCookie[], userAgent: string, nickname: string | null): Promise<void> {
  const key = getKey();
  const { error } = await supabaseAdmin.rpc("taobao_session_save" as never, {
    _cookies: cookies as unknown as object,
    _ua: userAgent,
    _nickname: nickname,
    _key: key,
  } as never);
  if (error) throw new Error(`taobao_session_save: ${error.message}`);
}

export async function loadTaobaoCookies(): Promise<CdpCookie[] | null> {
  const key = getKey();
  const { data, error } = await supabaseAdmin.rpc("taobao_session_load" as never, { _key: key } as never);
  if (error) {
    console.error("[taobao-session] load failed:", error.message);
    return null;
  }
  if (!data) return null;
  try {
    if (Array.isArray(data)) return data as CdpCookie[];
    if (typeof data === "string") return JSON.parse(data) as CdpCookie[];
    return data as unknown as CdpCookie[];
  } catch {
    return null;
  }
}

export async function clearTaobaoSession(): Promise<void> {
  const { error } = await supabaseAdmin.rpc("taobao_session_clear" as never, {} as never);
  if (error) throw new Error(`taobao_session_clear: ${error.message}`);
}

export async function markTaobaoSessionExpired(): Promise<void> {
  const { error } = await supabaseAdmin.rpc("taobao_session_mark_expired" as never, {} as never);
  if (error) console.error("[taobao-session] mark expired failed:", error.message);
}

export class TaobaoSessionExpiredError extends Error {
  constructor(message = "Session Taobao expirée, reconnectez-vous depuis Admin → Imports → Session Taobao.") {
    super(message);
    this.name = "TaobaoSessionExpiredError";
  }
}

// Mobile UA used both for login and for product scraping — must match
// so Taobao doesn't invalidate the session on device mismatch.
export const TAOBAO_MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
