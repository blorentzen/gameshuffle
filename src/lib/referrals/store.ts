/**
 * Referral links for the dailies (server only). Britton's picks, 2026-10-16
 * (https://claude.ai/artifact/EDTipNkH65NYaAqtW8AvKh), schema in
 * supabase/daily-referrals-m1.sql.
 *
 * Every account gets a short code that never changes; the dailies it shares
 * carry it (?r=K7Q2MX). When someone new finishes a daily from that link, the
 * account earns `referral_finish_tokens`; when that person makes an account,
 * `referral_signup_tokens` more, and the new account gets
 * `referral_welcome_tokens` on top of its welcome grant. Each person counts
 * once, for the first link they used.
 *
 * Fair play: only people who never finished a daily before; the finished game
 * is re-judged here; your own account and network never count; each account is
 * paid for at most `referral_paid_per_day` players a day, and a network brings
 * at most `referral_new_per_network` new players a day. All are levers on
 * Platform ▸ Token economy. Payments go through token_events once each
 * (idempotency_key), so a retry can't pay twice.
 */

import "server-only";
import { createHash, randomInt } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { ensureAccountWallet } from "@/lib/economy/accountWallet";
import { createNotification } from "@/lib/social/notifications";
import { judgeGame, type DailySchedule } from "@/lib/originals/daily";
import { playableDay } from "@/lib/daily/results";
import { extraGuesses } from "@/lib/daily/help";
import { weekOf } from "@/lib/originals/weekly";
import { gsDayStart, gsDay } from "@/lib/time/gsClock";
import { REFERRAL_CODE_RE, type ReferralGame, type ReferralLevers, type ReferralRow, type ReferralView } from "@/lib/referrals/types";

const SECRET = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "gameshuffle";
/** No 0/O or 1/I, so a code read aloud or typed is never ambiguous. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULTS: ReferralLevers = { finish: 100, signup: 500, welcome: 250, perDay: 10, perNetwork: 3, linkDays: 7 };
/** An account made this recently counts as new for the sign-up bonus. */
const NEW_ACCOUNT_DAYS = 7;

export const referralIpHash = (ip: string) => createHash("sha256").update(`referral-ip:${SECRET}:${ip}`).digest("hex").slice(0, 32);
const missing = (e: { code?: string } | null | undefined) => e?.code === "42P01" || e?.code === "PGRST205";
const duplicate = (e: { code?: string } | null | undefined) => e?.code === "23505";

export async function referralLevers(): Promise<ReferralLevers> {
  const { data, error } = await createServiceClient().from("gs_economy_config").select("key, value").like("key", "referral_%");
  if (error || !data) return DEFAULTS;
  const v = new Map((data as { key: string; value: number }[]).map((r) => [r.key, Number(r.value)]));
  const n = (k: string, d: number) => (Number.isFinite(v.get(k)) ? Math.max(0, v.get(k)!) : d);
  return {
    finish: n("referral_finish_tokens", DEFAULTS.finish),
    signup: n("referral_signup_tokens", DEFAULTS.signup),
    welcome: n("referral_welcome_tokens", DEFAULTS.welcome),
    perDay: n("referral_paid_per_day", DEFAULTS.perDay),
    perNetwork: n("referral_new_per_network", DEFAULTS.perNetwork),
    linkDays: n("referral_link_days", DEFAULTS.linkDays) || DEFAULTS.linkDays,
  };
}

/** The welcome grant every new account gets (the same lever the wallet uses). */
export async function welcomeGrant(): Promise<number> {
  const { data } = await createServiceClient().rpc("gs_economy_config_value", { p_key: "grant_start", p_default: 10000 });
  return typeof data === "number" ? data : Number(data) || 10000;
}

const newCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/** The account's code, made the first time it's asked for. Also notes its network. Null before the migration. */
export async function codeFor(userId: string, ip?: string | null): Promise<string | null> {
  const admin = createServiceClient();
  const ipHash = ip && ip !== "unknown" ? referralIpHash(ip) : null;
  const { data, error } = await admin.from("referral_codes").select("code, ip_hash").eq("user_id", userId).maybeSingle();
  if (missing(error)) return null;
  const row = data as { code: string; ip_hash: string | null } | null;
  if (row) {
    if (ipHash && row.ip_hash !== ipHash) await admin.from("referral_codes").update({ ip_hash: ipHash, updated_at: new Date().toISOString() }).eq("user_id", userId);
    return row.code;
  }
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    const { error: e } = await admin.from("referral_codes").insert({ user_id: userId, code, ip_hash: ipHash });
    if (!e) return code;
    if (!duplicate(e)) { console.error("[referrals] code failed:", e); return null; }
    // A duplicate is either this account (a race) or someone else's code: read again, then try another.
    const { data: again } = await admin.from("referral_codes").select("code").eq("user_id", userId).maybeSingle();
    if (again) return (again as { code: string }).code;
  }
  return null;
}

interface Referrer { userId: string; name: string; ipHash: string | null }

export async function referrerFor(rawCode: unknown): Promise<Referrer | null> {
  const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";
  if (!REFERRAL_CODE_RE.test(code)) return null;
  const admin = createServiceClient();
  const { data, error } = await admin.from("referral_codes").select("user_id, ip_hash").eq("code", code).maybeSingle();
  if (error || !data) return null;
  const r = data as { user_id: string; ip_hash: string | null };
  const { data: u } = await admin.from("users").select("display_name, username").eq("id", r.user_id).maybeSingle();
  const user = u as { display_name: string | null; username: string | null } | null;
  return { userId: r.user_id, name: user?.display_name || user?.username || "A friend", ipHash: r.ip_hash };
}

async function accountName(userId: string): Promise<string> {
  const { data } = await createServiceClient().from("users").select("display_name, username").eq("id", userId).maybeSingle();
  const u = data as { display_name: string | null; username: string | null } | null;
  return u?.display_name || u?.username || "A new player";
}

/** Pays once per key into an account's wallet. Returns the tokens paid (0 if this key was already paid). */
async function payAccount(userId: string, amount: number, key: string, meta: Record<string, unknown>): Promise<number> {
  if (amount <= 0) return 0;
  const wallet = (await ensureAccountWallet(userId))?.identityId;
  if (!wallet) return 0;
  const { error } = await createServiceClient().from("token_events").insert({
    identity_id: wallet, community_id: null, amount, type: "earn_referral", meta: { source: "referral", ...meta }, idempotency_key: key,
  });
  if (error) { if (!duplicate(error)) console.error("[referrals] payout failed:", error); return 0; }
  return amount;
}

const todayStart = () => gsDayStart(gsDay()).toISOString();

async function paidToday(referrerId: string, column: "finished_at" | "signed_up_at"): Promise<number> {
  const { count } = await createServiceClient().from("referrals").select("id", { count: "exact", head: true })
    .eq("referrer_id", referrerId).gte(column, todayStart()).gt(column === "finished_at" ? "finish_tokens" : "signup_tokens", 0);
  return count ?? 0;
}

async function newFromNetwork(ipHash: string): Promise<number> {
  const { count } = await createServiceClient().from("referrals").select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash).gte("created_at", todayStart());
  return count ?? 0;
}

/** Has this person finished a daily before `day`? (An account's results, or a guest's on the boards.) */
async function playedBefore(player: { kind: "u" | "g"; id: string }, day: string): Promise<boolean> {
  const admin = createServiceClient();
  if (player.kind === "u") {
    const [{ data: d }, { data: w }] = await Promise.all([
      admin.from("daily_results").select("day").eq("user_id", player.id).lt("day", day).limit(1),
      admin.from("weekly_entries").select("week_start").eq("user_id", player.id).lt("week_start", weekOf()).limit(1),
    ]);
    return !!(d?.length || w?.length);
  }
  const { data } = await admin.from("daily_guest_results").select("day").eq("guest_key", player.id).lt("day", day).limit(1);
  return !!data?.length;
}

export type ReferralResult =
  | { ok: true; paid: number }
  | { ok: false; error: "not_ready" | "bad_code" | "self" | "not_new" | "not_finished" | "already" | "limit" };

/**
 * A new player finished a daily from a link: counts them for the referrer
 * (once ever) and pays the finish tokens, within the caps.
 */
export async function recordFinish(args: {
  code: unknown; player: { kind: "u" | "g"; id: string }; game: ReferralGame; schedule?: DailySchedule;
  day: unknown; guesses: unknown; fresh: boolean; ip: string;
}): Promise<ReferralResult> {
  const referrer = await referrerFor(args.code);
  if (!referrer) return { ok: false, error: "bad_code" };
  const ipHash = args.ip && args.ip !== "unknown" ? referralIpHash(args.ip) : null;
  const accountId = args.player.kind === "u" ? args.player.id : null;
  if (accountId === referrer.userId || (ipHash && ipHash === referrer.ipHash)) return { ok: false, error: "self" };

  // A real finished game: re-judged like the leaderboards, or this week's Weekly answer.
  const day = args.game === "weekly" ? gsDay() : playableDay(args.day);
  if (!day) return { ok: false, error: "not_finished" };
  if (args.game === "weekly") {
    if (!accountId) return { ok: false, error: "not_finished" };
    const { data } = await createServiceClient().from("weekly_entries").select("ballot, answer").eq("week_start", weekOf()).eq("user_id", accountId).maybeSingle();
    const e = data as { ballot: unknown; answer: string | null } | null;
    if (!e || (!e.ballot && !e.answer)) return { ok: false, error: "not_finished" };
  } else {
    const guesses = Array.isArray(args.guesses) ? args.guesses.filter((g): g is string => typeof g === "string") : [];
    const extra = args.schedule && accountId ? await extraGuesses(`u:${accountId}`, args.schedule.id, day) : 0;
    if (!args.schedule || !judgeGame(day, guesses, args.schedule, extra)) return { ok: false, error: "not_finished" };
  }

  if (!args.fresh || await playedBefore(args.player, day)) return { ok: false, error: "not_new" };

  const admin = createServiceClient();
  const playerKey = `${args.player.kind}:${args.player.id}`;
  const { data: existingRow, error: readError } = await admin.from("referrals").select("id, referrer_id, finished_at")
    .or(accountId ? `player.eq.${playerKey},account_id.eq.${accountId}` : `player.eq.${playerKey}`).limit(1).maybeSingle();
  if (missing(readError)) return { ok: false, error: "not_ready" };
  const existing = existingRow as { id: string; referrer_id: string; finished_at: string | null } | null;
  if (existing?.finished_at) return { ok: false, error: "already" };
  // First link wins: a person who signed up from someone else's link stays theirs.
  const referrerId = existing?.referrer_id ?? referrer.userId;

  const levers = await referralLevers();
  if (!existing && ipHash && await newFromNetwork(ipHash) >= levers.perNetwork) return { ok: false, error: "limit" };
  const capped = (await paidToday(referrerId, "finished_at")) >= levers.perDay;
  const now = new Date().toISOString();

  let rowId: string | null = existing?.id ?? null;
  if (existing) {
    const { data: claimed } = await admin.from("referrals").update({ finished_at: now, game: args.game }).eq("id", existing.id).is("finished_at", null).select("id").maybeSingle();
    if (!claimed) return { ok: false, error: "already" };
  } else {
    const { data: made, error } = await admin.from("referrals").insert({
      referrer_id: referrerId, player: playerKey, account_id: accountId, game: args.game, ip_hash: ipHash, finished_at: now,
    }).select("id").maybeSingle();
    if (error) return duplicate(error) ? { ok: false, error: "already" } : { ok: false, error: missing(error) ? "not_ready" : "already" };
    rowId = (made as { id: string } | null)?.id ?? null;
  }
  if (capped) return { ok: false, error: "limit" };

  const paid = await payAccount(referrerId, levers.finish, `referral:finish:${playerKey}`, { kind: "finish", game: args.game, player: playerKey });
  if (paid && rowId) await admin.from("referrals").update({ finish_tokens: paid }).eq("id", rowId);
  if (paid) {
    const who = accountId ? await accountName(accountId) : "A new player";
    const what = args.game === "dex" ? "the Daily Dex" : args.game === "weekly" ? "the Weekly" : "the Daily";
    await createNotification({ userId: referrerId, type: "referral", title: `+${paid} tokens`, message: `${who} finished ${what} from your link.`, link: "/account?tab=invite", data: { tokens: paid } }).catch(() => {});
  }
  return { ok: true, paid };
}

/**
 * A person who came from a link made an account: pays the referrer's sign-up
 * tokens and the new account's welcome extra, once. Only accounts made in the
 * last week count, and never the referrer's own.
 */
export async function recordSignup(args: { code: unknown; accountId: string; guestKey: string | null; ip: string }): Promise<ReferralResult> {
  const admin = createServiceClient();
  const { data: u } = await admin.from("users").select("created_at").eq("id", args.accountId).maybeSingle();
  const created = (u as { created_at: string | null } | null)?.created_at;
  if (!created || Date.now() - Date.parse(created) > NEW_ACCOUNT_DAYS * 86_400_000) return { ok: false, error: "not_new" };

  const referrer = await referrerFor(args.code);
  if (!referrer) return { ok: false, error: "bad_code" };
  const ipHash = args.ip && args.ip !== "unknown" ? referralIpHash(args.ip) : null;
  if (args.accountId === referrer.userId || (ipHash && ipHash === referrer.ipHash)) return { ok: false, error: "self" };

  const accountKey = `u:${args.accountId}`;
  const filters = [`player.eq.${accountKey}`, `account_id.eq.${args.accountId}`, ...(args.guestKey ? [`player.eq.g:${args.guestKey}`] : [])].join(",");
  const { data: rows, error: readError } = await admin.from("referrals").select("id, referrer_id, signed_up_at, account_id").or(filters).limit(3);
  if (missing(readError)) return { ok: false, error: "not_ready" };
  const list = (rows ?? []) as { id: string; referrer_id: string; signed_up_at: string | null; account_id: string | null }[];
  if (list.some((r) => r.signed_up_at)) return { ok: false, error: "already" };
  const existing: (typeof list)[number] | null = list.find((r) => r.account_id === args.accountId) ?? list.at(0) ?? null;
  const referrerId = existing?.referrer_id ?? referrer.userId;
  if (referrerId === args.accountId) return { ok: false, error: "self" };

  const levers = await referralLevers();
  if (!existing && ipHash && await newFromNetwork(ipHash) >= levers.perNetwork) return { ok: false, error: "limit" };
  const now = new Date().toISOString();
  let rowId: string | null = existing?.id ?? null;
  if (existing) {
    const { data: claimed } = await admin.from("referrals").update({ signed_up_at: now, account_id: args.accountId }).eq("id", existing.id).is("signed_up_at", null).select("id").maybeSingle();
    if (!claimed) return { ok: false, error: "already" };
  } else {
    const { data: made, error } = await admin.from("referrals").insert({ referrer_id: referrerId, player: accountKey, account_id: args.accountId, ip_hash: ipHash, signed_up_at: now }).select("id").maybeSingle();
    if (error) return { ok: false, error: duplicate(error) ? "already" : missing(error) ? "not_ready" : "already" };
    rowId = (made as { id: string } | null)?.id ?? null;
  }

  // The friend's extra is theirs whatever the referrer's cap.
  await payAccount(args.accountId, levers.welcome, `referral:welcome:${args.accountId}`, { kind: "welcome", referrer: referrerId });
  if ((await paidToday(referrerId, "signed_up_at")) >= levers.perDay) return { ok: false, error: "limit" };
  const paid = await payAccount(referrerId, levers.signup, `referral:signup:${args.accountId}`, { kind: "signup", player: accountKey });
  if (paid && rowId) await admin.from("referrals").update({ signup_tokens: paid }).eq("id", rowId);
  if (paid) {
    const who = await accountName(args.accountId);
    await createNotification({ userId: referrerId, type: "referral", title: `+${paid} tokens`, message: `${who} made a GameShuffle account from your link.`, link: "/account?tab=invite", data: { tokens: paid } }).catch(() => {});
  }
  return { ok: true, paid };
}

/** Account ▸ Invite friends: your link, what it's brought, and the amounts. */
export async function referralView(userId: string, ip?: string | null): Promise<ReferralView> {
  const [code, levers] = await Promise.all([codeFor(userId, ip), referralLevers()]);
  if (!code) return { ready: false, code: null, levers, played: 0, accounts: 0, tokens: 0, rows: [] };
  const admin = createServiceClient();
  const { data } = await admin.from("referrals").select("player, account_id, game, finished_at, finish_tokens, signed_up_at, signup_tokens, created_at")
    .eq("referrer_id", userId).order("created_at", { ascending: false }).limit(200);
  const all = (data ?? []) as { player: string; account_id: string | null; game: ReferralGame | null; finished_at: string | null; finish_tokens: number; signed_up_at: string | null; signup_tokens: number; created_at: string }[];
  const ids = [...new Set(all.map((r) => r.account_id).filter((x): x is string => !!x))];
  const { data: users } = ids.length ? await admin.from("users").select("id, display_name, username").in("id", ids) : { data: [] };
  const names = new Map(((users ?? []) as { id: string; display_name: string | null; username: string | null }[]).map((u) => [u.id, u.display_name || u.username || "A new player"]));
  const rows: ReferralRow[] = [];
  for (const r of all) {
    const who = (r.account_id && names.get(r.account_id)) || "A new player";
    if (r.signed_up_at) rows.push({ who, what: "signup", game: null, at: r.signed_up_at, tokens: r.signup_tokens });
    if (r.finished_at) rows.push({ who, what: "finish", game: r.game, at: r.finished_at, tokens: r.finish_tokens });
  }
  rows.sort((a, b) => b.at.localeCompare(a.at));
  return {
    ready: true, code, levers,
    played: all.filter((r) => r.finished_at).length,
    accounts: all.filter((r) => r.signed_up_at).length,
    tokens: all.reduce((n, r) => n + r.finish_tokens + r.signup_tokens, 0),
    rows: rows.slice(0, 50),
  };
}
