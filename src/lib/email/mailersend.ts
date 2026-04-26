/**
 * Minimal MailerSend API client.
 *
 * Used for transactional emails sent directly from our server (DSAR
 * verification, admin notifications, requester confirmations) — separate
 * from Supabase Auth emails, which still go through MailerSend SMTP under
 * Supabase's control.
 *
 * Local-dev fallback: if `MAILERSEND_API_KEY` is unset, the email payload
 * is logged to the console instead of sent. Real send happens in any
 * environment that has the key.
 */

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

  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[mailersend:dev] would send:", { to, toName, subject, fromEmail, replyTo, text: text.slice(0, 200) });
      return { ok: true };
    }
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
