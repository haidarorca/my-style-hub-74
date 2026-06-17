import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomInt } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const CODE_TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

const SendSchema = z.object({
  email: z.string().email().max(255),
});

const VerifySchema = z.object({
  email: z.string().email().max(255),
  code: z.string().regex(/^\d{4}$/),
  password: z.string().min(6).max(200),
  fullName: z.string().min(1).max(200),
  phone: z.string().max(50).optional().nullable(),
  sex: z.enum(["homme", "femme"]),
  address: z.string().max(500).optional().nullable(),
  countryId: z.string().max(50).optional().nullable(),
  cityText: z.string().max(200).optional().nullable(),
  regionText: z.string().max(200).optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
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

export const sendSignupVerificationCode = createServerFn({ method: "POST" })
  .inputValidator((input) => SendSchema.parse(input))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const GOOGLE_MAIL_API_KEY = process.env.GOOGLE_MAIL_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!GOOGLE_MAIL_API_KEY) throw new Error("GOOGLE_MAIL_API_KEY is not configured");

    const email = data.email.trim().toLowerCase();

    // Refuse if account already exists
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      throw new Error("Un compte existe déjà avec cet email.");
    }

    // Cooldown
    const { data: recent } = await supabaseAdmin
      .from("email_verification_codes")
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

    const code = String(randomInt(0, 10000)).padStart(4, "0");
    const code_hash = hashCode(email, code);
    const expires_at = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();

    await supabaseAdmin
      .from("email_verification_codes")
      .update({ used: true })
      .eq("email", email)
      .eq("used", false);

    const { error: insErr } = await supabaseAdmin
      .from("email_verification_codes")
      .insert({ email, code_hash, expires_at });
    if (insErr) {
      console.error("insert verification code failed", insErr);
      throw new Error("Erreur interne");
    }

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

    const subject = `${siteName} — Code de confirmation : ${code}`;
    const text = [
      `Bienvenue !`,
      ``,
      `Votre code de confirmation pour créer votre compte sur ${siteName} est :`,
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
          <h1 style="margin:0 0 8px;color:#111;font-size:22px;">Confirmez votre email</h1>
          <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.5;">Voici votre code pour finaliser la création de votre compte sur <strong>${escapeHtml(siteName)}</strong> :</p>
          <div style="margin:0 0 24px;text-align:center;">
            <div style="display:inline-block;padding:18px 28px;background:#f7f4f1;border:2px dashed #e85d3a;border-radius:10px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:38px;font-weight:700;letter-spacing:14px;color:#111;">${code}</div>
          </div>
          <p style="margin:0 0 8px;color:#555;font-size:14px;">Ce code expire dans <strong>${CODE_TTL_MINUTES} minutes</strong>.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
          <p style="margin:0;color:#999;font-size:12px;line-height:1.5;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>
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

export const verifySignupAndCreateAccount = createServerFn({ method: "POST" })
  .inputValidator((input) => VerifySchema.parse(input))
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const code_hash = hashCode(email, data.code);

    const { data: row } = await supabaseAdmin
      .from("email_verification_codes")
      .select("id, code_hash, expires_at, used, attempts")
      .eq("email", email)
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row) throw new Error("Aucun code en cours. Demandez un nouveau code.");
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await supabaseAdmin.from("email_verification_codes").update({ used: true }).eq("id", row.id);
      throw new Error("Code expiré. Demandez un nouveau code.");
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      await supabaseAdmin.from("email_verification_codes").update({ used: true }).eq("id", row.id);
      throw new Error("Trop de tentatives. Demandez un nouveau code.");
    }
    if (row.code_hash !== code_hash) {
      await supabaseAdmin
        .from("email_verification_codes")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id);
      throw new Error("Code incorrect.");
    }

    // Make sure account does not already exist
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      await supabaseAdmin.from("email_verification_codes").update({ used: true }).eq("id", row.id);
      throw new Error("Un compte existe déjà avec cet email.");
    }

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (createErr || !created?.user) {
      console.error("createUser failed", createErr);
      throw new Error(createErr?.message ?? "Création du compte échouée.");
    }

    const userId = created.user.id;

    // Update profile (handle_new_user trigger created it)
    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.fullName,
        sex: data.sex,
        phone: data.phone ?? null,
        address: data.address ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
      })
      .eq("id", userId);
    if (profErr) {
      console.error("profile update failed", profErr);
    }

    // Create address in new address system (if country or address provided)
    if (data.countryId || data.address) {
      const { error: addrErr } = await supabaseAdmin
        .from("addresses")
        .insert({
          owner_type: "user",
          owner_id: userId,
          type: "shipping",
          label: "Adresse principale",
          is_default: true,
          full_name: data.fullName,
          phone: data.phone ?? null,
          country_id: data.countryId ?? null,
          region_text: data.regionText ?? null,
          city_text: data.cityText ?? null,
          address_line1: data.address ?? "",
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
        });
      if (addrErr) {
        console.error("address insert failed", addrErr);
        // Non-blocking: don't fail signup if address creation fails
      }
    }

    await supabaseAdmin.from("email_verification_codes").update({ used: true }).eq("id", row.id);

    return { ok: true };
  });
