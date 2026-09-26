import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { leverText } from "@/lib/pricing/catalog";
import { getTwilio, toE164, verifyConfigured, SMS_ENV } from "./client";

/**
 * Phone verification and per-category SMS consent.
 *
 * A number is only usable when it is verified (Twilio Verify) AND the category
 * is opted in AND the person hasn't replied STOP. Every state change is written
 * to `gs_sms_consent_events` as evidence, which is what carriers and the TCPA
 * expect if a complaint ever lands.
 *
 * Categories:
 *   event_reminders     "your game night is tomorrow"
 *   organizer_messages  an organizer messaging their attendees
 *   account_security    verification codes and security notices (always on)
 */

export type SmsCategory = "event_reminders" | "organizer_messages" | "account_security";
export const SMS_CATEGORIES: { id: SmsCategory; label: string; helper: string; optional: boolean }[] = [
  { id: "event_reminders", label: "Event reminders", helper: "A text the day before and an hour before events you're attending.", optional: true },
  { id: "organizer_messages", label: "Messages from organizers", helper: "When a host messages everyone attending their event.", optional: true },
  { id: "account_security", label: "Account security", helper: "Verification codes and security alerts. Always on while a number is saved.", optional: false },
];

export interface PhoneState {
  e164: string | null;
  verified: boolean;
  lineType: string | null;
  country: string;
  consent: Record<SmsCategory, boolean>;
}

const DEFAULT_CONSENT: Record<SmsCategory, boolean> = { event_reminders: false, organizer_messages: false, account_security: true };

async function logConsent(args: { userId: string | null; e164?: string | null; category?: string | null; action: "opt_in" | "opt_out" | "verify" | "unverify"; source: string; detail?: Record<string, unknown> }) {
  await createServiceClient().from("gs_sms_consent_events").insert({
    user_id: args.userId, e164: args.e164 ?? null, category: args.category ?? null, action: args.action, source: args.source, detail: args.detail ?? null,
  });
}

export async function getPhoneState(userId: string): Promise<PhoneState> {
  const svc = createServiceClient();
  const [{ data: phone }, { data: consent }] = await Promise.all([
    svc.from("gs_user_phones").select("e164, country, line_type, verified_at").eq("user_id", userId).maybeSingle(),
    svc.from("gs_sms_consent").select("category, state").eq("user_id", userId),
  ]);
  const map = { ...DEFAULT_CONSENT };
  for (const r of (consent ?? []) as { category: SmsCategory; state: string }[]) map[r.category] = r.state === "opted_in";
  return {
    e164: (phone?.e164 as string | null) ?? null,
    verified: !!phone?.verified_at,
    lineType: (phone?.line_type as string | null) ?? null,
    country: (phone?.country as string | null) ?? "US",
    consent: map,
  };
}

/** Countries we may text at all (10DLC: US only at launch). */
export async function allowedRegions(): Promise<string[]> {
  return (await leverText("sms_regions", "US")).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
}

export interface StartVerificationResult { ok: boolean; reason?: string; e164?: string }

/** Send a verification code. Also records the number (unverified) + line type. */
export async function startPhoneVerification(userId: string, rawPhone: string): Promise<StartVerificationResult> {
  const e164 = toE164(rawPhone);
  if (!e164) return { ok: false, reason: "invalid_number" };
  const regions = await allowedRegions();
  if (regions.includes("US") && regions.length === 1 && !e164.startsWith("+1")) return { ok: false, reason: "region_not_supported" };
  if (!verifyConfigured()) return { ok: false, reason: "not_configured" };

  const svc = createServiceClient();
  // Someone else already verified this number → refuse rather than hijack it.
  const { data: taken } = await svc.from("gs_user_phones").select("user_id").eq("e164", e164).not("verified_at", "is", null).maybeSingle();
  if (taken && taken.user_id !== userId) return { ok: false, reason: "number_in_use" };

  const twilio = getTwilio();
  // Line type: a landline can't receive SMS, so tell the user now, not later.
  let lineType: string | null = null;
  let carrier: string | null = null;
  try {
    const lookup = await twilio.lookups.v2.phoneNumbers(e164).fetch({ fields: "line_type_intelligence" });
    const lti = (lookup.lineTypeIntelligence ?? {}) as { type?: string; carrier_name?: string };
    lineType = lti.type ?? null;
    carrier = lti.carrier_name ?? null;
    if (lineType === "landline") return { ok: false, reason: "landline" };
  } catch {
    // Lookup is advisory; a failure must not block verification.
  }

  await twilio.verify.v2.services(SMS_ENV.verifyServiceSid()!).verifications.create({ to: e164, channel: "sms" });
  await svc.from("gs_user_phones").upsert({ user_id: userId, e164, country: "US", line_type: lineType, carrier, verified_at: null, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return { ok: true, e164 };
}

/** Check the code. On success the number is verified and security texts are on. */
export async function checkPhoneVerification(userId: string, code: string): Promise<{ ok: boolean; reason?: string }> {
  if (!verifyConfigured()) return { ok: false, reason: "not_configured" };
  const svc = createServiceClient();
  const { data: phone } = await svc.from("gs_user_phones").select("e164").eq("user_id", userId).maybeSingle();
  const e164 = (phone?.e164 as string | null) ?? null;
  if (!e164) return { ok: false, reason: "no_pending_number" };

  const check = await getTwilio().verify.v2.services(SMS_ENV.verifyServiceSid()!).verificationChecks.create({ to: e164, code: code.trim() });
  if (check.status !== "approved") return { ok: false, reason: "bad_code" };

  await svc.from("gs_user_phones").update({ verified_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("user_id", userId);
  await svc.from("gs_sms_consent").upsert({ user_id: userId, category: "account_security", state: "opted_in", source: "account_settings", updated_at: new Date().toISOString() }, { onConflict: "user_id,category" });
  await logConsent({ userId, e164, action: "verify", source: "account_settings" });
  return { ok: true };
}

export async function removePhone(userId: string): Promise<void> {
  const svc = createServiceClient();
  const { data: phone } = await svc.from("gs_user_phones").select("e164").eq("user_id", userId).maybeSingle();
  await svc.from("gs_user_phones").delete().eq("user_id", userId);
  await svc.from("gs_sms_consent").delete().eq("user_id", userId);
  await logConsent({ userId, e164: (phone?.e164 as string | null) ?? null, action: "unverify", source: "account_settings" });
}

export async function setConsent(userId: string, category: SmsCategory, optedIn: boolean, source = "account_settings"): Promise<void> {
  const svc = createServiceClient();
  await svc.from("gs_sms_consent").upsert({ user_id: userId, category, state: optedIn ? "opted_in" : "opted_out", source, updated_at: new Date().toISOString() }, { onConflict: "user_id,category" });
  const { data: phone } = await svc.from("gs_user_phones").select("e164").eq("user_id", userId).maybeSingle();
  await logConsent({ userId, e164: (phone?.e164 as string | null) ?? null, category, action: optedIn ? "opt_in" : "opt_out", source });
}

/** STOP / START / HELP arriving from a phone (Twilio inbound webhook). */
export async function applyKeyword(e164: string, keyword: "stop" | "start" | "help"): Promise<{ matched: boolean }> {
  const svc = createServiceClient();
  const { data: phone } = await svc.from("gs_user_phones").select("user_id").eq("e164", e164).maybeSingle();
  const userId = (phone?.user_id as string | null) ?? null;
  if (keyword === "help") {
    await logConsent({ userId, e164, action: "opt_in", source: "sms_keyword", detail: { keyword: "help" } });
    return { matched: !!userId };
  }
  const optedIn = keyword === "start";
  if (userId) {
    for (const c of ["event_reminders", "organizer_messages"] as SmsCategory[]) {
      await svc.from("gs_sms_consent").upsert({ user_id: userId, category: c, state: optedIn ? "opted_in" : "opted_out", source: "sms_keyword", updated_at: new Date().toISOString() }, { onConflict: "user_id,category" });
    }
  }
  await logConsent({ userId, e164, action: optedIn ? "opt_in" : "opt_out", source: "sms_keyword", detail: { keyword } });
  return { matched: !!userId };
}

/** May we text this user in this category right now? */
export async function canText(userId: string, category: SmsCategory): Promise<{ ok: boolean; e164?: string; reason?: string }> {
  const state = await getPhoneState(userId);
  if (!state.e164 || !state.verified) return { ok: false, reason: "no_verified_phone" };
  if (!state.consent[category]) return { ok: false, reason: "no_consent" };
  const regions = await allowedRegions();
  if (regions.length && !regions.includes(state.country)) return { ok: false, reason: "region_not_supported" };
  return { ok: true, e164: state.e164 };
}
