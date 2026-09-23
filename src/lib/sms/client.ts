import "server-only";

import twilio from "twilio";

/**
 * Twilio client + configuration for GameShuffle SMS.
 *
 * Everything routes through a **Messaging Service** rather than a bare number:
 * it owns the sender pool, sticky sender, Smart Encoding and — the part that
 * matters for compliance — Advanced Opt-Out, so STOP/START/HELP are honoured by
 * Twilio itself even if our webhook is down. We still mirror those keywords
 * into our own consent table so the app knows the state.
 *
 * Nothing here throws when Twilio isn't configured; callers check
 * `smsConfigured()` and degrade to email + in-app.
 */

export const SMS_ENV = {
  accountSid: () => process.env.TWILIO_ACCOUNT_SID,
  authToken: () => process.env.TWILIO_AUTH_TOKEN,
  messagingServiceSid: () => process.env.TWILIO_MESSAGING_SERVICE_SID,
  verifyServiceSid: () => process.env.TWILIO_VERIFY_SERVICE_SID,
};

export function smsConfigured(): boolean {
  return !!(SMS_ENV.accountSid() && SMS_ENV.authToken() && SMS_ENV.messagingServiceSid());
}

export function verifyConfigured(): boolean {
  return !!(SMS_ENV.accountSid() && SMS_ENV.authToken() && SMS_ENV.verifyServiceSid());
}

let cached: ReturnType<typeof twilio> | null = null;

export function getTwilio(): ReturnType<typeof twilio> {
  const sid = SMS_ENV.accountSid();
  const token = SMS_ENV.authToken();
  if (!sid || !token) throw new Error("Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)");
  if (!cached) cached = twilio(sid, token);
  return cached;
}

/** Validate an inbound Twilio webhook (X-Twilio-Signature, HMAC-SHA1). */
export function validateTwilioSignature(signature: string | null, url: string, params: Record<string, string>): boolean {
  const token = SMS_ENV.authToken();
  if (!token || !signature) return false;
  return twilio.validateRequest(token, signature, url, params);
}

// ─── formatting + segments ───────────────────────────────────────────────────

/** Normalize US input to E.164. Returns null when it isn't a plausible number. */
export function toE164(raw: string, defaultCountry: "US" = "US"): string | null {
  const trimmed = raw.trim();
  if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (defaultCountry === "US") {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  }
  return null;
}

const GSM7 = /^[\u0000-\u007F€£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¤¡ÄÖÑÜ§¿äöñüà]*$/;

/**
 * Billable segments for a body. GSM-7: 160 chars, or 153 per segment when
 * concatenated. UCS-2 (any emoji or unusual character): 70 / 67. This is what
 * we charge against a plan's allowance, so it must match Twilio's own count.
 */
export function segmentCount(body: string): number {
  const gsm = GSM7.test(body);
  const len = body.length;
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  if (len === 0) return 1;
  return len <= single ? 1 : Math.ceil(len / multi);
}

/** The footer carriers expect on recurring campaigns. Kept short on purpose. */
export const STOP_FOOTER = "Reply STOP to opt out.";

/**
 * Every message identifies the sender. A recipient who gets "Saturday Board
 * Games starts tomorrow" with no brand has no idea who is texting them, and
 * carriers treat an unidentifiable sender as a red flag on a toll-free number.
 */
export const SMS_BRAND = "GameShuffle";

/** Compose a body that fits one segment when it can, brand and footer included. */
export function composeSms(text: string, opts: { footer?: boolean; brand?: boolean } = {}): string {
  const footer = opts.footer === false ? "" : ` ${STOP_FOOTER}`;
  const trimmed = text.trim();
  // Skip the prefix when the caller already opens with the brand.
  const prefix = opts.brand === false || trimmed.toLowerCase().startsWith(SMS_BRAND.toLowerCase()) ? "" : `${SMS_BRAND}: `;
  const budget = 160 - footer.length - prefix.length;
  const body = trimmed.length > budget ? `${trimmed.slice(0, Math.max(0, budget - 1)).trimEnd()}…` : trimmed;
  return `${prefix}${body}${footer}`;
}
