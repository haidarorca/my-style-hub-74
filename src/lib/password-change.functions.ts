/**
 * Server functions for authenticated password change.
 * - Re-verifies current password (defense-in-depth, even after client check).
 * - Verifies active session (via requireSupabaseAuth).
 * - Journals every attempt (success + failure) into password_change_log.
 * - Enforces server-side brute-force throttle.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createClient } from "@supabase/supabase-js";
import { consumeRateLimit, clearRateLimit, getClientIp } from "@/lib/auth-rate-limit.server";

const ChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

async function logChange(params: {
  user_id: string;
  email: string | null;
  method: "self" | "reset" | "admin";
  success: boolean;
  error_reason?: string | null;
  ip: string | null;
  user_agent: string | null;
}) {
  await supabaseAdmin.from("password_change_log").insert({
    user_id: params.user_id,
    email: params.email,
    method: params.method,
    success: params.success,
    error_reason: params.error_reason ?? null,
    ip: params.ip,
    user_agent: params.user_agent,
  });
}

export const changePasswordSelf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ChangeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const req = getRequest();
    const ip = getClientIp(req.headers);
    const ua = req.headers.get("user-agent");
    const userId = context.userId;
    const email = (context.claims as { email?: string } | undefined)?.email ?? null;

    if (!email) {
      throw new Error("Session sans email — impossible de vérifier le mot de passe actuel.");
    }

    // Rate-limit per user
    const rl = await consumeRateLimit(`change_pw:${userId}`, "change_pw");
    if (!rl.allowed) {
      await logChange({ user_id: userId, email, method: "self", success: false, error_reason: "rate_limited", ip, user_agent: ua });
      throw new Error(`Trop de tentatives. Réessayez dans ${rl.retryAfterSec ?? 60}s.`);
    }

    if (data.newPassword === data.currentPassword) {
      throw new Error("Le nouveau mot de passe doit être différent.");
    }

    // 1) Verify current password using an isolated client (no session pollution)
    const verifier = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { error: signErr } = await verifier.auth.signInWithPassword({
      email,
      password: data.currentPassword,
    });
    if (signErr) {
      await logChange({ user_id: userId, email, method: "self", success: false, error_reason: "wrong_current_password", ip, user_agent: ua });
      throw new Error("Mot de passe actuel incorrect.");
    }

    // 2) Update password (admin client, bypasses session)
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: data.newPassword,
    });
    if (updErr) {
      await logChange({ user_id: userId, email, method: "self", success: false, error_reason: updErr.message, ip, user_agent: ua });
      throw new Error("Mise à jour du mot de passe échouée.");
    }

    await clearRateLimit(`change_pw:${userId}`, "change_pw");
    await logChange({ user_id: userId, email, method: "self", success: true, ip, user_agent: ua });

    return { ok: true };
  });

export const getPasswordChangeHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("password_change_log")
      .select("id, method, success, error_reason, ip, user_agent, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    return data ?? [];
  });
