import "server-only";

/**
 * GS Pro given by GameShuffle until a date (pro_gifts, supabase/series-m1.sql). A team series gives its
 * streamers GS Pro for the event month and its champions a year (Summer Series picks 9A and 11A).
 *
 * Like a Backer or Champion support level, a gift switches `users.subscription_tier` to 'pro' so every
 * existing gate works, and records that it did (`set_pro`). The Stripe sync and the support sync never take
 * Pro from an account with a live gift; when the last live gift ends (the every-minute sweep), an account the
 * gift switched goes back to Free with GS Pro's downgrade cleanup, unless a plan, support level or role
 * still gives it Pro. Staff and admins are left alone.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { normalizeTier, isStaffRole } from "@/lib/subscription";

export interface ProGift { id: string; userId: string; until: string; reason: string; ref: string | null; setPro: boolean; createdAt: string }

const COLS = "id, user_id, until, reason, ref, set_pro, created_at";
const PRO_LIVE = ["trialing", "active", "past_due"];

type Raw = { id: string; user_id: string; until: string; reason: string; ref: string | null; set_pro: boolean; created_at: string };
const toGift = (r: Raw): ProGift => ({ id: r.id, userId: r.user_id, until: r.until, reason: r.reason, ref: r.ref, setPro: r.set_pro, createdAt: r.created_at });

const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || /pro_gifts/.test(e.message ?? ""));

/** The account's live gift with the latest end, if any. Never throws (null before the migration). */
export async function liveGift(userId: string): Promise<ProGift | null> {
  const { data, error } = await createServiceClient().from("pro_gifts").select(COLS)
    .eq("user_id", userId).is("ended_at", null).gt("until", new Date().toISOString())
    .order("until", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return toGift(data as Raw);
}

/** Live gifts for several accounts (for organizer screens). */
export async function liveGiftsFor(userIds: string[]): Promise<Map<string, ProGift>> {
  const out = new Map<string, ProGift>();
  if (!userIds.length) return out;
  const { data, error } = await createServiceClient().from("pro_gifts").select(COLS)
    .in("user_id", userIds).is("ended_at", null).gt("until", new Date().toISOString());
  if (error) return out;
  for (const r of (data ?? []) as Raw[]) {
    const cur = out.get(r.user_id);
    if (!cur || r.until > cur.until) out.set(r.user_id, toGift(r));
  }
  return out;
}

/** Whether the account has its own live GS Pro plan (or Circuit 256), which a gift never replaces. */
async function ownPaidPro(userId: string): Promise<boolean> {
  const { data } = await createServiceClient().from("subscriptions").select("product, tier, status").eq("user_id", userId).in("status", PRO_LIVE);
  return ((data ?? []) as { product: string | null; tier: string | null }[]).some((r) => (r.product ?? "pro") === "pro" || r.tier === "circuit_256");
}

export type GiveResult = { ok: true; gift: ProGift } | { ok: false; error: "not_ready" | "no_account" | "bad_date" | "failed" };

/**
 * Gives an account GS Pro until `until`. One live gift per `ref` (giving again with the same ref moves its
 * end date). Switches the account to Pro when nothing else gives it.
 */
export async function giveProUntil(args: { userId: string; until: Date; reason: string; ref?: string | null; grantedBy?: string | null }): Promise<GiveResult> {
  if (!(args.until instanceof Date) || Number.isNaN(args.until.getTime()) || args.until.getTime() <= Date.now()) return { ok: false, error: "bad_date" };
  const admin = createServiceClient();
  const { data: user } = await admin.from("users").select("id, subscription_tier, subscription_status, role").eq("id", args.userId).maybeSingle();
  const u = user as { id: string; subscription_tier: string | null; subscription_status: string | null; role: string | null } | null;
  if (!u) return { ok: false, error: "no_account" };
  const alreadyPro = normalizeTier(u.subscription_tier) === "pro" && PRO_LIVE.includes(u.subscription_status ?? "");
  const switchIt = !alreadyPro && !isStaffRole(u.role);
  const ref = args.ref?.slice(0, 80) ?? null;
  const reason = args.reason.trim().slice(0, 120) || "Given by GameShuffle";

  let existing: Raw | null = null;
  if (ref) {
    const { data, error } = await admin.from("pro_gifts").select(COLS).eq("user_id", u.id).eq("ref", ref).is("ended_at", null).maybeSingle();
    if (missing(error)) return { ok: false, error: "not_ready" };
    existing = (data as Raw | null) ?? null;
  }
  let row: Raw | null = null;
  if (existing) {
    const { data, error } = await admin.from("pro_gifts").update({ until: args.until.toISOString(), reason, set_pro: existing.set_pro || switchIt }).eq("id", existing.id).select(COLS).single();
    if (error) return { ok: false, error: missing(error) ? "not_ready" : "failed" };
    row = data as Raw;
  } else {
    const { data, error } = await admin.from("pro_gifts").insert({ user_id: u.id, until: args.until.toISOString(), reason, ref, granted_by: args.grantedBy ?? null, set_pro: switchIt }).select(COLS).single();
    if (error) return { ok: false, error: missing(error) ? "not_ready" : "failed" };
    row = data as Raw;
  }
  if (switchIt) {
    await admin.from("users").update({ subscription_tier: "pro", subscription_status: "active", updated_at: new Date().toISOString() }).eq("id", u.id);
  }
  return { ok: true, gift: toGift(row!) };
}

/** Ends gifts now (by id or by ref), then settles each account's Pro. */
export async function endGifts(where: { ids?: string[]; ref?: string }): Promise<number> {
  const admin = createServiceClient();
  let q = admin.from("pro_gifts").update({ ended_at: new Date().toISOString() }).is("ended_at", null);
  if (where.ids?.length) q = q.in("id", where.ids);
  else if (where.ref) q = q.eq("ref", where.ref);
  else return 0;
  const { data, error } = await q.select("user_id, set_pro");
  if (error) return 0;
  const rows = (data ?? []) as { user_id: string; set_pro: boolean }[];
  for (const uid of new Set(rows.filter((r) => r.set_pro).map((r) => r.user_id))) await settleAfterGift(uid);
  return rows.length;
}

/**
 * After a gift ends: if the account has no other live gift, no plan of its own, no live support level and
 * isn't staff, it goes back to Free with the Twitch disconnect GS Pro's downgrade does.
 */
async function settleAfterGift(userId: string): Promise<void> {
  if (await liveGift(userId)) return;
  const admin = createServiceClient();
  const { data } = await admin.from("users").select("subscription_tier, role").eq("id", userId).maybeSingle();
  const u = data as { subscription_tier: string | null; role: string | null } | null;
  if (!u || normalizeTier(u.subscription_tier) !== "pro" || isStaffRole(u.role)) return;
  if (await ownPaidPro(userId)) return;
  const { supportProGrant } = await import("@/lib/support/store");
  if (await supportProGrant(userId).catch(() => null)) return;
  await admin.from("users").update({ subscription_tier: "free", subscription_status: "canceled", updated_at: new Date().toISOString() }).eq("id", userId);
  const { disconnectTwitchIntegration } = await import("@/lib/twitch/disconnect");
  await disconnectTwitchIntegration(userId).catch((err: unknown) => console.error(`[gifts] Twitch disconnect after the gift ended failed for ${userId}:`, err));
}

/** Every minute: gifts whose date has passed end, and their accounts are settled. */
export async function sweepProGifts(): Promise<number> {
  const { data, error } = await createServiceClient().from("pro_gifts").select("id").is("ended_at", null).lte("until", new Date().toISOString()).limit(200);
  if (error || !data?.length) return 0;
  return endGifts({ ids: (data as { id: string }[]).map((r) => r.id) });
}
