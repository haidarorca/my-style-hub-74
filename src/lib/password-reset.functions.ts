import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { createHash, randomInt } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { consumeRateLimit, clearRateLimit, getClientIp } from "@/lib/auth-rate-limit.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const CODE_TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

const SendSchema = z.object({
  email: z.string().email().max(255),
});

const VerifySchema = z.object({
  email: z.string().email().max(255),
  code: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(8).max(200),
});

function hashCode(email: string, code: string): string {
  return createHash("sha256").update(`${email.toLowerCase()}|${code}`).digest("hex");
}

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildRawEmail(opts: {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): string {
  const boundary = "kawzone_" + Math.random().toString(36).slice(2);
  const fromHeader = `${opts.fromName} <${opts.from}>`;
  const subjectEncoded = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=`;
  const msg = [
    `From: ${fromHeader}`,
    `To: ${opts.to}`,
    `Subject: ${subjectEncoded}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    opts.text,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    opts.html,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return toBase64Url(msg);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const sendPasswordResetCode = createServerFn({ method: "POST" })
  .inputValidator((input) => SendSchema.parse(input))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const GOOGLE_MAIL_API_KEY = process.env.GOOGLE_MAIL_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!GOOGLE_MAIL_API_KEY) throw new Error("GOOGLE_MAIL_API_KEY is not configured");

    const email = data.email.trim().toLowerCase();
    const req = getRequest();
    const ip = getClientIp(req.headers);
    const ua = req.headers.get("user-agent");

    // Brute-force protection: per-email AND per-IP
    const emailRl = await consumeRateLimit(`reset_send:email:${email}`, "reset_send");
    if (!emailRl.allowed) {
      // Silent success to avoid enumeration
      return { ok: true };
    }
    if (ip) {
      const ipRl = await consumeRateLimit(`reset_send:ip:${ip}`, "reset_send");
      if (!ipRl.allowed) return { ok: true };
    }

    // Soft cooldown: if a code was created within last 60s, silently succeed
    const { data: recent } = await supabaseAdmin
      .from("password_reset_codes")
      .select("created_at")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent?.created_at) {
      const ageSec = (Date.now() - new Date(recent.created_at).getTime()) / 1000;
      if (ageSec < RESEND_COOLDOWN_SECONDS) {
        return { ok: true };
      }
    }

    // Only send if user exists (silently succeed otherwise to avoid enumeration)
    const { data: userRow } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!userRow) return { ok: true };

    // Generate 6-digit code (cryptographically random)
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const code_hash = hashCode(email, code);
    const expires_at = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();

    // Invalidate any previous unused codes for this email
    await supabaseAdmin
      .from("password_reset_codes")
      .update({ used: true })
      .eq("email", email)
      .eq("used", false);

    const { error: insErr } = await supabaseAdmin
      .from("password_reset_codes")
      .insert({ email, code_hash, expires_at, ip, user_agent: ua });
    if (insErr) {
      console.error("insert code failed", insErr);
      throw new Error("Erreur interne");
    }


    // Load settings for branding/sender
    const { data: settings } = await supabaseAdmin
      .from("site_settings")
      .select("site_name, auth_sender_email, auth_sender_name")
      .eq("id", "main")
      .maybeSingle();

    const senderEmail =
      ((settings as { auth_sender_email?: string | null } | null)?.auth_sender_email ?? "").trim() ||
      "haidarorca@gmail.com";
    const senderName =
      ((settings as { auth_sender_name?: string | null } | null)?.auth_sender_name ?? "").trim() ||
      ((settings as { site_name?: string | null } | null)?.site_name ?? "KawZone");
    const siteName =
      ((settings as { site_name?: string | null } | null)?.site_name ?? "").trim() || "KawZone";

    const subject = `${siteName} — Code de vérification : ${code}`;
    const text = [
      `Bonjour,`,
      ``,
      `Votre code de vérification pour réinitialiser votre mot de passe sur ${siteName} est :`,
      ``,
      `    ${code}`,
      ``,
      `Ce code expire dans ${CODE_TTL_MINUTES} minutes.`,
      `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
      ``,
      `— ${siteName}`,
    ].join("\n");

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px 24px;box-shadow:0 1px 3px rgba(0,0,0,.06);">
        <tr><td>
          <h1 style="margin:0 0 8px;color:#111;font-size:22px;">Code de vérification</h1>
          <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.5;">Voici votre code pour réinitialiser votre mot de passe sur <strong>${escapeHtml(siteName)}</strong> :</p>
          <div style="margin:0 0 24px;text-align:center;">
            <div style="display:inline-block;padding:18px 28px;background:#f7f4f1;border:2px dashed #e85d3a;border-radius:10px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#111;">${code}</div>
          </div>
          <p style="margin:0 0 8px;color:#555;font-size:14px;">Ce code expire dans <strong>${CODE_TTL_MINUTES} minutes</strong>.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
          <p style="margin:0;color:#999;font-size:12px;line-height:1.5;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — votre mot de passe restera inchangé.</p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;color:#999;font-size:12px;">— ${escapeHtml(siteName)}</p>
    </td></tr>
  </table>
</body></html>`;

    const raw = buildRawEmail({
      from: senderEmail,
      fromName: senderName,
      to: email,
      subject,
      html,
      text,
    });

    const res = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_MAIL_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Gmail send failed:", res.status, body);
      throw new Error(`Envoi email échoué [${res.status}]`);
    }

    return { ok: true };
  });

export const verifyPasswordResetCode = createServerFn({ method: "POST" })
  .inputValidator((input) => VerifySchema.parse(input))
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const code_hash = hashCode(email, data.code);
    const req = getRequest();
    const ip = getClientIp(req.headers);
    const ua = req.headers.get("user-agent");

    // Brute-force protection on verification
    const verifyRl = await consumeRateLimit(`reset_verify:email:${email}`, "reset_verify");
    if (!verifyRl.allowed) {
      throw new Error(`Trop de tentatives. Réessayez dans ${Math.ceil((verifyRl.retryAfterSec ?? 600) / 60)} min.`);
    }
    if (ip) {
      const ipRl = await consumeRateLimit(`reset_verify:ip:${ip}`, "reset_verify");
      if (!ipRl.allowed) throw new Error("Trop de tentatives depuis cette adresse. Réessayez plus tard.");
    }

    const { data: row } = await supabaseAdmin
      .from("password_reset_codes")
      .select("id, code_hash, expires_at, used, attempts")
      .eq("email", email)
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row) {
      throw new Error("Aucun code en cours. Demandez un nouveau code.");
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await supabaseAdmin.from("password_reset_codes").update({ used: true }).eq("id", row.id);
      throw new Error("Code expiré. Demandez un nouveau code.");
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      await supabaseAdmin.from("password_reset_codes").update({ used: true }).eq("id", row.id);
      throw new Error("Trop de tentatives. Demandez un nouveau code.");
    }
    if (row.code_hash !== code_hash) {
      await supabaseAdmin
        .from("password_reset_codes")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id);
      throw new Error(`Code incorrect. ${MAX_ATTEMPTS - row.attempts - 1} tentative(s) restante(s).`);
    }

    // Find user id
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!profile) {
      throw new Error("Compte introuvable.");
    }

    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
      password: data.newPassword,
    });
    if (updErr) {
      console.error("updateUserById failed", updErr);
      await supabaseAdmin.from("password_change_log").insert({
        user_id: profile.id, email, method: "reset", success: false, error_reason: updErr.message, ip, user_agent: ua,
      });
      throw new Error("Mise à jour du mot de passe échouée.");
    }

    await supabaseAdmin.from("password_reset_codes").update({ used: true }).eq("id", row.id);
    await clearRateLimit(`reset_verify:email:${email}`, "reset_verify");
    await clearRateLimit(`reset_send:email:${email}`, "reset_send");

    // Journal success
    await supabaseAdmin.from("password_change_log").insert({
      user_id: profile.id, email, method: "reset", success: true, ip, user_agent: ua,
    });

    return { ok: true };
  });

