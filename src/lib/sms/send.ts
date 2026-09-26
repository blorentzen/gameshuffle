import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { getBaseUrl, isProduction } from "@/lib/env";
import { feePlanFor, lever, smsAllowance, type PlanId } from "@/lib/pricing/catalog";
import { composeSms, getTwilio, segmentCount, smsConfigured, SMS_ENV } from "./client";
import { canText, type SmsCategory } from "./consent";

/**
 * Sending SMS, with the allowance and consent gates in one place.
 *
 * Every send is billed to an ORGANIZER's monthly allowance (their Circuit plan
 * decides the size; Free and Pro have none). The check is segment-accurate
 * because that is how Twilio bills us. Non-production logs instead of sending,
 * exactly like the email path, so dev and preview can exercise the flow without
 * touching a carrier.
 */

export interface SendSmsArgs {
  /** Who receives it (must have a verified phone + consent for `category`). */
  toUserId: string;
  category: SmsCategory;
  body: string;
  /** Whose allowance this spends — the organizer/host. Defaults to the recipient (account security). */
  billedUserId?: string | null;
  eventType?: string | null;
  eventId?: string | null;
  /** Skip the "Reply STOP" footer (only for account_security one-offs). */
  noFooter?: boolean;
}

export type SendSmsResult =
  | { ok: true; sid: string | null; segments: number; simulated?: boolean }
  | { ok: false; reason: "not_configured" | "no_verified_phone" | "no_consent" | "region_not_supported" | "no_allowance" | "allowance_exhausted" | "send_failed" };

export interface AllowanceState { planId: PlanId; allowance: number; used: number; remaining: number; overageCents: number; periodStart: string }

/** Segments this organizer has spent in the current calendar month. */
export async function getAllowance(userId: string): Promise<AllowanceState> {
  const svc = createServiceClient();
  const { data: u } = await svc.from("users").select("subscription_tier, circuit_tier, circuit_status").eq("id", userId).maybeSingle();
  const planId = feePlanFor({
    subscriptionTier: (u?.subscription_tier as string | null) ?? null,
    circuitTier: (u?.circuit_tier as string | null) ?? null,
    circuitStatus: (u?.circuit_status as string | null) ?? null,
  });
  const allowance = await smsAllowance(planId);
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const { data: rows } = await svc.from("gs_sms_messages").select("segments").eq("billed_user_id", userId).gte("created_at", start.toISOString()).in("status", ["queued", "sent", "delivered"]);
  const used = ((rows ?? []) as { segments: number }[]).reduce((n, r) => n + (r.segments ?? 1), 0);
  const overageCents = await lever("sms_overage_cents", 2);
  // Only Circuit 256 may exceed its allowance (decided 2026-09-21).
  const canOverage = planId === "circuit_256";
  return { planId, allowance, used, remaining: canOverage ? Number.POSITIVE_INFINITY : Math.max(0, allowance - used), overageCents, periodStart: start.toISOString() };
}

export async function sendSms(args: SendSmsArgs): Promise<SendSmsResult> {
  const svc = createServiceClient();
  const billedUserId = args.billedUserId ?? args.toUserId;

  const permitted = await canText(args.toUserId, args.category);
  if (!permitted.ok) return { ok: false, reason: (permitted.reason as "no_verified_phone" | "no_consent" | "region_not_supported") ?? "no_consent" };

  // The footer is per MESSAGE, not per category: a one-time passcode should not
  // carry "Reply STOP" (it would read as an opt-out prompt mid-login), but a
  // recurring security alert should, and carriers expect to see it there.
  const body = composeSms(args.body, { footer: !args.noFooter });
  const segments = segmentCount(body);

  // Allowance (skipped for account security — those are ours, not an organizer's).
  if (args.category !== "account_security") {
    const allowance = await getAllowance(billedUserId);
    if (allowance.allowance === 0 && allowance.remaining !== Number.POSITIVE_INFINITY) return { ok: false, reason: "no_allowance" };
    if (allowance.remaining < segments) return { ok: false, reason: "allowance_exhausted" };
  }

  const row = {
    to_user_id: args.toUserId, to_e164: permitted.e164!, category: args.category, body, segments,
    billed_user_id: billedUserId, event_type: args.eventType ?? null, event_id: args.eventId ?? null,
  };

  // Non-production: log and record as delivered so the whole path is exercised.
  if (!isProduction && process.env.ALLOW_NONPROD_SMS !== "true") {
    console.log("[twilio:non-prod] would send:", { to: permitted.e164, category: args.category, segments, body: body.slice(0, 120) });
    await svc.from("gs_sms_messages").insert({ ...row, status: "delivered", twilio_sid: `SMsimulated${Date.now()}${Math.random().toString(36).slice(2, 8)}` });
    return { ok: true, sid: null, segments, simulated: true };
  }

  if (!smsConfigured()) return { ok: false, reason: "not_configured" };

  const { data: logged } = await svc.from("gs_sms_messages").insert({ ...row, status: "queued" }).select("id").single();
  try {
    const message = await getTwilio().messages.create({
      to: permitted.e164!,
      messagingServiceSid: SMS_ENV.messagingServiceSid()!,
      body,
      statusCallback: `${getBaseUrl()}/api/sms/status`,
    });
    await svc.from("gs_sms_messages").update({ twilio_sid: message.sid, status: "sent", updated_at: new Date().toISOString() }).eq("id", logged!.id);
    await svc.from("gs_user_phones").update({ last_sent_at: new Date().toISOString() }).eq("user_id", args.toUserId);
    return { ok: true, sid: message.sid, segments };
  } catch (e) {
    const code = (e as { code?: number | string }).code;
    // 21610 = the recipient replied STOP on Twilio's side; mirror it locally.
    if (String(code) === "21610") {
      const { setConsent } = await import("./consent");
      await setConsent(args.toUserId, args.category, false, "sms_keyword");
    }
    await svc.from("gs_sms_messages").update({ status: "failed", error_code: String(code ?? "unknown"), updated_at: new Date().toISOString() }).eq("id", logged!.id);
    console.error("[twilio] send failed:", e instanceof Error ? e.message : e);
    return { ok: false, reason: "send_failed" };
  }
}

/** Twilio status callback → our log (delivered / undelivered / failed). */
export async function recordStatus(sid: string, status: string, errorCode?: string | null): Promise<void> {
  const map: Record<string, string> = { queued: "queued", sending: "sent", sent: "sent", delivered: "delivered", undelivered: "undelivered", failed: "failed" };
  const mapped = map[status];
  if (!mapped) return;
  await createServiceClient().from("gs_sms_messages").update({ status: mapped, error_code: errorCode ?? null, updated_at: new Date().toISOString() }).eq("twilio_sid", sid);
}
