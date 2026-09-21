import "server-only";

import { createNotification } from "@/lib/social/notifications";
import type { GsNotificationType } from "@/lib/social/notificationTypes";

/**
 * One delivery seam for event communications (reminders, organizer messages,
 * waitlist promotions): in-app alert + email today, SMS when Twilio lands.
 *
 * SMS is deliberately a stub: it reports `sms: "not_configured"` until
 * `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_MESSAGING_SERVICE_SID`
 * exist and the recipient has a verified phone with the matching opt-in. The
 * 10DLC registration is in progress; wiring the client here is the only code
 * change needed once it clears.
 */

export interface Recipient {
  userId: string | null;
  displayName: string | null;
  email: string | null;
  /** E.164; only set once phone verification + per-type opt-in exist. */
  phone?: string | null;
  timezone?: string | null;
}

export interface Delivery {
  inApp?: { type: GsNotificationType; title: string; message?: string | null; link?: string | null; data?: Record<string, unknown> | null };
  email?: (r: Recipient) => Promise<{ ok: boolean }>;
  sms?: { body: string };
}

export interface DeliveryResult { inApp: boolean; email: boolean; sms: "sent" | "skipped" | "not_configured" }

export function smsConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_MESSAGING_SERVICE_SID);
}

export async function deliver(r: Recipient, d: Delivery): Promise<DeliveryResult> {
  const out: DeliveryResult = { inApp: false, email: false, sms: "skipped" };
  if (d.inApp && r.userId) {
    await createNotification({ userId: r.userId, ...d.inApp }).then(() => { out.inApp = true; }).catch(() => {});
  }
  if (d.email && r.email) {
    await d.email(r).then((res) => { out.email = !!res.ok; }).catch(() => {});
  }
  if (d.sms && r.phone) {
    // Twilio client goes here (Messages.create with messagingServiceSid). Until
    // configured we report it instead of silently pretending.
    out.sms = smsConfigured() ? "skipped" : "not_configured";
  }
  return out;
}
