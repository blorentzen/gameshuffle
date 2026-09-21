/**
 * Minimal MailerSend API client.
 *
 * Used for transactional emails sent directly from our server (DSAR
 * verification, admin notifications, requester confirmations) — separate
 * from Supabase Auth emails, which still go through MailerSend SMTP under
 * Supabase's control.
 *
 * Non-production safety: real sends happen ONLY on the Vercel production
 * deployment (`isProduction`). Preview / dev / local log the payload instead —
 * REGARDLESS of whether an API key is present — so a prod key that lands in the
 * wrong Vercel scope can never email a real user from a test environment.
 * Set `ALLOW_NONPROD_EMAIL=true` to opt a non-prod environment into real sends
 * (e.g. testing invite flows to your own inbox on dev).
 */

import { isProduction } from "@/lib/env";

interface SendEmailParams {
  to: string;
  toName?: string;
  subject: string;
  text: string;
  html?: string;
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
}

const DEFAULT_FROM_EMAIL = "noreply@gameshuffle.co";
const DEFAULT_FROM_NAME = "GameShuffle";

export async function sendTransactionalEmail({
  to,
  toName,
  subject,
  text,
  html,
  fromEmail = DEFAULT_FROM_EMAIL,
  fromName = DEFAULT_FROM_NAME,
  replyTo,
}: SendEmailParams): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.MAILERSEND_API_KEY;

  // Outside production, never reach a real inbox — log and report success so
  // callers behave normally. Keyed on the deployment environment, NOT on the
  // key's presence, so a leaked prod key can't send from preview/dev.
  const allowNonProd = process.env.ALLOW_NONPROD_EMAIL === "true";
  if (!isProduction && !allowNonProd) {
    console.log("[mailersend:non-prod] would send:", { to, toName, subject, fromEmail, replyTo, text: text.slice(0, 200) });
    return { ok: true };
  }

  if (!apiKey) {
    return { ok: false, error: "MAILERSEND_API_KEY missing" };
  }

  const payload: Record<string, unknown> = {
    from: { email: fromEmail, name: fromName },
    to: [{ email: to, ...(toName ? { name: toName } : {}) }],
    subject,
    text,
    ...(html ? { html } : {}),
    ...(replyTo ? { reply_to: { email: replyTo } } : {}),
  };

  try {
    const res = await fetch("https://api.mailersend.com/v1/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[mailersend] send failed:", res.status, body);
      return { ok: false, error: `MailerSend ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[mailersend] send error:", err);
    return { ok: false, error: err instanceof Error ? err.message : "send error" };
  }
}
