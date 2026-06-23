/**
 * Auth rate limiting & brute-force protection.
 * Server-only. Backed by table public.auth_rate_limits.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface RateLimitConfig {
  max: number;            // max attempts before lock
  windowSec: number;      // sliding window (resets counter after this)
  lockSec: number;        // how long to lock once max is hit
}

export const RL_DEFAULTS: Record<string, RateLimitConfig> = {
  reset_send:   { max: 5,  windowSec: 600,  lockSec: 900 },  // 5 envois / 10 min, lock 15 min
  reset_verify: { max: 8,  windowSec: 600,  lockSec: 1800 }, // 8 tentatives / 10 min, lock 30 min
  change_pw:    { max: 5,  windowSec: 600,  lockSec: 900 },
};

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec?: number;
  remaining?: number;
}

/** Check & increment. Call BEFORE the protected operation. */
export async function consumeRateLimit(
  key: string,
  action: keyof typeof RL_DEFAULTS,
): Promise<RateLimitResult> {
  const cfg = RL_DEFAULTS[action];
  if (!cfg) return { allowed: true };

  const now = new Date();
  const { data: row } = await supabaseAdmin
    .from("auth_rate_limits")
    .select("attempts, locked_until, first_attempt_at, last_attempt_at")
    .eq("key", key)
    .eq("action", action)
    .maybeSingle();

  // Currently locked?
  if (row?.locked_until && new Date(row.locked_until) > now) {
    const retry = Math.ceil((new Date(row.locked_until).getTime() - now.getTime()) / 1000);
    return { allowed: false, retryAfterSec: retry };
  }

  // Window expired? reset.
  let attempts = row?.attempts ?? 0;
  const firstAt = row?.first_attempt_at ? new Date(row.first_attempt_at) : now;
  const inWindow = now.getTime() - firstAt.getTime() < cfg.windowSec * 1000;
  if (!inWindow) attempts = 0;

  attempts += 1;
  const willLock = attempts >= cfg.max;
  const lockedUntil = willLock ? new Date(now.getTime() + cfg.lockSec * 1000).toISOString() : null;

  await supabaseAdmin.from("auth_rate_limits").upsert(
    {
      key,
      action,
      attempts,
      locked_until: lockedUntil,
      first_attempt_at: inWindow ? (row?.first_attempt_at ?? now.toISOString()) : now.toISOString(),
      last_attempt_at: now.toISOString(),
    },
    { onConflict: "key,action" },
  );

  if (willLock) {
    return { allowed: false, retryAfterSec: cfg.lockSec };
  }
  return { allowed: true, remaining: cfg.max - attempts };
}

/** Reset counter (call on success). */
export async function clearRateLimit(key: string, action: keyof typeof RL_DEFAULTS): Promise<void> {
  await supabaseAdmin
    .from("auth_rate_limits")
    .delete()
    .eq("key", key)
    .eq("action", action);
}

/** Extract client IP from a TanStack server-function context request. */
export function getClientIp(headers: Headers): string | null {
  return (
    headers.get("cf-connecting-ip") ||
    headers.get("x-real-ip") ||
    (headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    null
  );
}
