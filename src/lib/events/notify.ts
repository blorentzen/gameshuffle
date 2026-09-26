import "server-only";

import { createNotification } from "@/lib/social/notifications";
import type { GsNotificationType } from "@/lib/social/notificationTypes";
import { sendSms } from "@/lib/sms/send";
import { smsConfigured } from "@/lib/sms/client";
import type { SmsCategory } from "@/lib/sms/consent";

/**
 * One delivery seam for event communications (reminders, organizer messages,
 * waitlist promotions): in-app alert, email and SMS.
 *
 * SMS only goes out when every gate passes — Twilio configured, recipient has a
 * verified US number, they opted in to that category, and the ORGANIZER's plan
 * has allowance left. `src/lib/sms/send.ts` owns those checks; this seam just
 * reports which channels actually fired.
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
  sms?: {
    body: string;
    category: SmsCategory;
    /** Whose monthly allowance this spends (the organizer / host). */
    billedUserId?: string | null;
    eventType?: string | null;
    eventId?: string | null;
  };
}

export type SmsOutcome = "sent" | "skipped" | "not_configured" | "no_phone" | "no_consent" | "no_allowance";
export interface DeliveryResult { inApp: boolean; email: boolean; sms: SmsOutcome }

export { smsConfigured };

export async function deliver(r: Recipient, d: Delivery): Promise<DeliveryResult> {
  const out: DeliveryResult = { inApp: false, email: false, sms: "skipped" };
  if (d.inApp && r.userId) {
    await createNotification({ userId: r.userId, ...d.inApp }).then(() => { out.inApp = true; }).catch(() => {});
  }
  if (d.email && r.email) {
    await d.email(r).then((res) => { out.email = !!res.ok; }).catch(() => {});
  }
  if (d.sms && r.userId) {
    const res = await sendSms({
      toUserId: r.userId, category: d.sms.category, body: d.sms.body,
      billedUserId: d.sms.billedUserId ?? null, eventType: d.sms.eventType ?? null, eventId: d.sms.eventId ?? null,
    }).catch(() => ({ ok: false as const, reason: "send_failed" as const }));
    out.sms = res.ok
      ? "sent"
      : res.reason === "not_configured" ? "not_configured"
      : res.reason === "no_verified_phone" ? "no_phone"
      : res.reason === "no_consent" || res.reason === "region_not_supported" ? "no_consent"
      : res.reason === "no_allowance" || res.reason === "allowance_exhausted" ? "no_allowance"
      : "skipped";
  }
  return out;
}
