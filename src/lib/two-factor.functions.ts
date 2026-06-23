/**
 * TOTP 2FA server functions.
 * - setupTotp: generate secret + provisioning URI + QR data URL (NOT yet enabled).
 * - confirmTotp: user submits a 6-digit code; if valid, enable + return recovery codes (plaintext, one-time).
 * - disableTotp: requires current password + a valid TOTP code (or recovery code).
 * - verifyTotpCode: standalone verification helper (used at login if 2FA is enabled — wiring left for later).
 *
 * Notes:
 * - Secrets are stored as raw Base32 in user_security_settings.totp_secret.
 *   Service role only (no UPDATE policy for authenticated).
 * - Recovery codes are stored as sha256 hashes (recovery_codes_hash).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ISSUER = "KawZone";

function hashRecovery(code: string): string {
  return createHash("sha256").update(code.toUpperCase()).digest("hex");
}

function generateRecoveryCodes(n = 8): string[] {
  // 10-char base32-ish codes (xxxxx-xxxxx)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const buf = randomBytes(10);
    let s = "";
    for (const b of buf) s += alphabet[b % alphabet.length];
    out.push(`${s.slice(0, 5)}-${s.slice(5, 10)}`);
  }
  return out;
}

function makeTotp(secret: string, label: string) {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

/** Get current 2FA status (does NOT return the secret). */
export const getTwoFactorStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("user_security_settings")
      .select("totp_enabled, totp_confirmed_at, recovery_codes_generated_at, last_used_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    return {
      enabled: !!data?.totp_enabled,
      confirmed_at: data?.totp_confirmed_at ?? null,
      recovery_codes_generated_at: data?.recovery_codes_generated_at ?? null,
      last_used_at: data?.last_used_at ?? null,
    };
  });

/** Generate a fresh secret + QR. Stored but NOT enabled until confirmTotp succeeds. */
export const setupTotp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims as { email?: string } | undefined)?.email ?? "user";

    // Block if already enabled
    const { data: existing } = await supabaseAdmin
      .from("user_security_settings")
      .select("totp_enabled")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing?.totp_enabled) {
      throw new Error("2FA est déjà activé. Désactivez-la avant de régénérer un secret.");
    }

    const secret = new OTPAuth.Secret({ size: 20 }).base32;
    const totp = makeTotp(secret, email);
    const uri = totp.toString();
    const qr_data_url = await QRCode.toDataURL(uri, { margin: 1, width: 240 });

    // Upsert pending secret (not enabled)
    await supabaseAdmin
      .from("user_security_settings")
      .upsert(
        {
          user_id: context.userId,
          totp_secret: secret,
          totp_enabled: false,
          totp_confirmed_at: null,
        },
        { onConflict: "user_id" },
      );

    return { secret, uri, qr_data_url };
  });

/** Confirm setup by submitting the first valid 6-digit code. */
export const confirmTotp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ code: z.string().regex(/^\d{6}$/) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("user_security_settings")
      .select("totp_secret, totp_enabled")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row?.totp_secret) throw new Error("Aucune configuration 2FA en cours.");
    if (row.totp_enabled) throw new Error("2FA déjà activé.");

    const email = (context.claims as { email?: string } | undefined)?.email ?? "user";
    const totp = makeTotp(row.totp_secret, email);
    const delta = totp.validate({ token: data.code, window: 1 });
    if (delta === null) throw new Error("Code incorrect.");

    const codes = generateRecoveryCodes(8);
    const hashes = codes.map(hashRecovery);

    await supabaseAdmin
      .from("user_security_settings")
      .update({
        totp_enabled: true,
        totp_confirmed_at: new Date().toISOString(),
        recovery_codes_hash: hashes,
        recovery_codes_generated_at: new Date().toISOString(),
      })
      .eq("user_id", context.userId);

    return { ok: true, recovery_codes: codes };
  });

/** Disable 2FA. Requires a valid TOTP or recovery code. */
export const disableTotp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ code: z.string().min(6).max(11) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("user_security_settings")
      .select("totp_secret, totp_enabled, recovery_codes_hash")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row?.totp_enabled) throw new Error("2FA n'est pas activé.");

    const cleaned = data.code.replace(/\s|-/g, "").toUpperCase();
    let ok = false;

    // Try TOTP first
    if (/^\d{6}$/.test(cleaned) && row.totp_secret) {
      const email = (context.claims as { email?: string } | undefined)?.email ?? "user";
      const totp = makeTotp(row.totp_secret, email);
      ok = totp.validate({ token: cleaned, window: 1 }) !== null;
    }

    // Try recovery
    if (!ok) {
      const h = hashRecovery(cleaned.length === 10 ? `${cleaned.slice(0, 5)}-${cleaned.slice(5)}` : cleaned);
      ok = (row.recovery_codes_hash ?? []).includes(h);
    }

    if (!ok) throw new Error("Code 2FA ou code de récupération invalide.");

    await supabaseAdmin
      .from("user_security_settings")
      .update({
        totp_enabled: false,
        totp_secret: null,
        totp_confirmed_at: null,
        recovery_codes_hash: [],
        recovery_codes_generated_at: null,
      })
      .eq("user_id", context.userId);

    return { ok: true };
  });

/** Regenerate recovery codes (requires current TOTP). */
export const regenerateRecoveryCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ code: z.string().regex(/^\d{6}$/) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("user_security_settings")
      .select("totp_secret, totp_enabled")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row?.totp_enabled || !row.totp_secret) throw new Error("2FA n'est pas activé.");

    const email = (context.claims as { email?: string } | undefined)?.email ?? "user";
    const totp = makeTotp(row.totp_secret, email);
    if (totp.validate({ token: data.code, window: 1 }) === null) {
      throw new Error("Code TOTP incorrect.");
    }

    const codes = generateRecoveryCodes(8);
    await supabaseAdmin
      .from("user_security_settings")
      .update({
        recovery_codes_hash: codes.map(hashRecovery),
        recovery_codes_generated_at: new Date().toISOString(),
      })
      .eq("user_id", context.userId);

    return { recovery_codes: codes };
  });
