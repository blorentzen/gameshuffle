import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { sendSms } from "./send";

/**
 * Security alerts: the "something changed on your account" texts.
 *
 * These ride the always-on `account_security` category, so they reach anyone who
 * has a confirmed number saved without a separate opt-in. That is the point of
 * the category: a password change you did NOT make is exactly the message you
 * want to arrive even if you turned every other text off.
 *
 * They carry the STOP footer (unlike a one-time passcode), because they are
 * recurring messages and a recipient must always have the opt-out in front of
 * them.
 */

export type SecurityAlertKind =
  | "password_changed"
  | "mfa_enabled"
  | "mfa_disabled"
  | "phone_changed"
  | "account_deleted";

const BODIES: Record<SecurityAlertKind, string> = {
  password_changed: "Your password was just changed. If that wasn't you, reset it now at gameshuffle.co/forgot-password",
  mfa_enabled: "Two-step verification is now ON for your account. If that wasn't you, secure your account at gameshuffle.co/account",
  mfa_disabled: "Two-step verification was just turned OFF. If that wasn't you, secure your account at gameshuffle.co/account",
  phone_changed: "This number was just added to your account for security alerts. If that wasn't you, remove it at gameshuffle.co/account",
  account_deleted: "Your account deletion has started. If that wasn't you, contact support@gameshuffle.co right away.",
};

/** A user cannot be made to text themselves in a loop. */
const COOLDOWN_MS = 30_000;

async function recentlyAlerted(userId: string): Promise<boolean> {
  const since = new Date(Date.now() - COOLDOWN_MS).toISOString();
  const { data } = await createServiceClient()
    .from("gs_sms_messages")
    .select("id")
    .eq("to_user_id", userId)
    .eq("category", "account_security")
    .gte("created_at", since)
    .limit(1);
  return (data ?? []).length > 0;
}

export async function sendSecurityAlert(userId: string, kind: SecurityAlertKind): Promise<{ ok: boolean; reason?: string }> {
  const body = BODIES[kind];
  if (!body) return { ok: false, reason: "unknown_kind" };
  if (await recentlyAlerted(userId)) return { ok: false, reason: "cooldown" };

  // Billed to the recipient: this is their own account's security, not an
  // organizer's campaign, so it must never spend a host's allowance.
  const res = await sendSms({ toUserId: userId, category: "account_security", body, billedUserId: userId });
  return res.ok ? { ok: true } : { ok: false, reason: res.reason };
}
