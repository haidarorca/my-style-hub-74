import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

const InputSchema = z.object({
  email: z.string().email().max(255),
  redirectTo: z.string().url().max(500),
});

function toBase64Url(s: string): string {
  // btoa for utf-8: encode as binary string first
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

export const sendPasswordResetEmail = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const GOOGLE_MAIL_API_KEY = process.env.GOOGLE_MAIL_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!GOOGLE_MAIL_API_KEY) throw new Error("GOOGLE_MAIL_API_KEY is not configured");

    const email = data.email.trim().toLowerCase();

    // Always return success to avoid email enumeration. Only proceed if user exists.
    const { data: userRow } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (!userRow) {
      return { ok: true };
    }

    // Load site settings for sender + branding
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

    // Generate recovery link via admin API
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: data.redirectTo },
    });
    if (linkErr || !linkData?.properties?.action_link) {
      console.error("generateLink failed:", linkErr);
      throw new Error("Impossible de générer le lien de réinitialisation");
    }
    const actionLink = linkData.properties.action_link;

    const subject = `${siteName} — Réinitialisation de votre mot de passe`;
    const text = [
      `Bonjour,`,
      ``,
      `Vous avez demandé à réinitialiser votre mot de passe sur ${siteName}.`,
      ``,
      `Cliquez sur ce lien sécurisé pour choisir un nouveau mot de passe :`,
      actionLink,
      ``,
      `Ce lien expirera prochainement pour votre sécurité. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
      ``,
      `— ${siteName}`,
    ].join("\n");

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px 24px;box-shadow:0 1px 3px rgba(0,0,0,.06);">
        <tr><td>
          <h1 style="margin:0 0 8px;color:#111;font-size:22px;">Réinitialisation du mot de passe</h1>
          <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.5;">Vous avez demandé à réinitialiser votre mot de passe sur <strong>${escapeHtml(siteName)}</strong>. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.</p>
          <p style="margin:24px 0;text-align:center;">
            <a href="${escapeAttr(actionLink)}" style="display:inline-block;background:#e85d3a;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">Réinitialiser mon mot de passe</a>
          </p>
          <p style="margin:0 0 8px;color:#777;font-size:13px;">Ou copiez ce lien dans votre navigateur :</p>
          <p style="margin:0 0 24px;color:#444;font-size:12px;word-break:break-all;">${escapeHtml(actionLink)}</p>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
          <p style="margin:0;color:#999;font-size:12px;line-height:1.5;">Ce lien expirera prochainement. Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — votre mot de passe restera inchangé.</p>
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
