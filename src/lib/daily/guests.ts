/**
 * Guests on the Daily leaderboards (server only). Britton's pick, 2026-10-16:
 * a guest picks a name to go on the boards, their results count like anyone's,
 * and the tokens they earn are held for 30 days for an account to claim. A
 * guest never gets a wallet of their own: every new wallet comes with the
 * 10,000-token welcome grant, which a fresh browser could farm.
 *
 * The browser keeps a random id (localStorage gs-daily-guest) and sends it in
 * the x-daily-guest header; the database only ever sees its hash (guest_key).
 * Joining passes Turnstile once, and a network can add only a few new guests a
 * day. Claiming moves the held tokens into the account's wallet, and the
 * guest's scores and results onto the account (where the account has none for
 * that day), so a streak started as a guest carries on.
 */

import "server-only";
import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { ensureAccountWallet } from "@/lib/economy/accountWallet";
import { isBlockedText } from "@/lib/text/filter";
import { isReservedName } from "@/lib/reservedName";
import { judgeGame, puzzleFor, guessLimits, type DailySchedule } from "@/lib/originals/daily";
import { playableDay } from "@/lib/daily/results";
import { boardsMissing, recordScore, type ScoreResult } from "@/lib/daily/boards";
import { tidyName, type BoardGame } from "@/lib/daily/boardRules";
import { moveFireRuns } from "@/lib/fireRound/store";

const SECRET = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "gameshuffle";
/** New guests a network may add in a day. */
export const GUESTS_PER_NETWORK = 3;

export const validGuestSecret = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(s);
export const guestKey = (secret: string) => createHash("sha256").update(`daily-guest:${SECRET}:${secret}`).digest("hex");
const ipHash = (ip: string) => createHash("sha256").update(`daily-ip:${SECRET}:${ip}`).digest("hex").slice(0, 32);

export interface Guest { key: string; name: string; claimedBy: string | null }

export async function guestFor(secret: unknown): Promise<Guest | null> {
  if (!validGuestSecret(secret)) return null;
  const key = guestKey(secret);
  const { data, error } = await createServiceClient().from("daily_guests").select("guest_key, name, claimed_by").eq("guest_key", key).maybeSingle();
  if (error || !data) return null;
  const r = data as { guest_key: string; name: string; claimed_by: string | null };
  return { key: r.guest_key, name: r.name, claimedBy: r.claimed_by };
}

/** Checks a board name: 2 to 24 characters, nothing rude, and not passing as GameShuffle. */
export function nameProblem(raw: unknown): string | null {
  const name = tidyName(raw);
  if (name.length < 2) return "Pick a name with at least 2 characters.";
  if (isBlockedText(name)) return "Pick a different name.";
  if (isReservedName(name)) return "That name is kept for GameShuffle itself.";
  return null;
}

export type JoinResult = { ok: true; guest: Guest } | { ok: false; error: "bad_name" | "too_many" | "claimed" | "not_ready" | "failed"; message?: string };

/** Puts a guest on the boards with a name, or renames one already there. */
export async function joinBoards(secret: string, rawName: unknown, ip: string): Promise<JoinResult> {
  const problem = nameProblem(rawName);
  if (problem) return { ok: false, error: "bad_name", message: problem };
  const name = tidyName(rawName);
  const admin = createServiceClient();
  const key = guestKey(secret);
  const existing = await guestFor(secret);
  if (existing?.claimedBy) return { ok: false, error: "claimed" };
  if (existing) {
    const { error } = await admin.from("daily_guests").update({ name, updated_at: new Date().toISOString() }).eq("guest_key", key);
    return error ? { ok: false, error: "failed" } : { ok: true, guest: { ...existing, name } };
  }
  const net = ipHash(ip);
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error: countErr } = await admin.from("daily_guests").select("guest_key", { count: "exact", head: true }).eq("ip_hash", net).gte("created_at", since);
  if (countErr) return { ok: false, error: boardsMissing(countErr) ? "not_ready" : "failed" };
  if ((count ?? 0) >= GUESTS_PER_NETWORK) return { ok: false, error: "too_many" };
  const { error } = await admin.from("daily_guests").insert({ guest_key: key, name, ip_hash: net });
  if (error) return { ok: false, error: "failed" };
  return { ok: true, guest: { key, name, claimedBy: null } };
}

export type GuestSave = { ok: true; score: ScoreResult | null } | { ok: false; error: "not_on_board" | "claimed" | "wrong_day" | "not_a_finished_game" | "failed" };

/** Records a guest's finished game (the first result for a day stands) and its points and held tokens. */
export async function saveGuestResult(secret: string, game: DailySchedule, rawDay: unknown, rawGuesses: unknown): Promise<GuestSave> {
  const guest = await guestFor(secret);
  if (!guest) return { ok: false, error: "not_on_board" };
  if (guest.claimedBy) return { ok: false, error: "claimed" };
  const day = playableDay(rawDay);
  if (!day) return { ok: false, error: "wrong_day" };
  const guesses = Array.isArray(rawGuesses) ? rawGuesses.filter((g): g is string => typeof g === "string") : [];
  const result = judgeGame(day, guesses, game);
  if (!result) return { ok: false, error: "not_a_finished_game" };
  const puzzle = puzzleFor(day, game);
  const { error } = await createServiceClient().from("daily_guest_results")
    .upsert({ guest_key: guest.key, day, puzzle: puzzle.id, guesses: result.guesses, solved: result.solved }, { onConflict: "guest_key,day,puzzle", ignoreDuplicates: true });
  if (error) { console.error("[boards] guest result failed:", error); return { ok: false, error: "failed" }; }
  const score = await recordScore({ game: game.id as BoardGame, day, player: { kind: "g", id: guest.key }, guesses: result.guesses, solved: result.solved, main: guessLimits(puzzle).main });
  return { ok: true, score };
}

/** Tokens held for a guest and not yet claimed or expired. */
export async function heldTokens(key: string): Promise<{ tokens: number; expires: string | null }> {
  const { data } = await createServiceClient().from("daily_guest_rewards").select("amount, expires_at")
    .eq("guest_key", key).is("claimed_at", null).gt("expires_at", new Date().toISOString());
  const rows = (data ?? []) as { amount: number; expires_at: string }[];
  return { tokens: rows.reduce((s, r) => s + r.amount, 0), expires: rows.map((r) => r.expires_at).sort()[0] ?? null };
}

export type ClaimResult = { ok: true; tokens: number; days: number } | { ok: false; error: "not_on_board" | "claimed_by_other" | "failed" };

/**
 * Moves a guest onto an account: held tokens into the account's wallet (a
 * game the account also played that day pays once), scores and results onto
 * the account where it has none for that day. Safe to call again.
 */
export async function claimGuest(secret: string, userId: string): Promise<ClaimResult> {
  const guest = await guestFor(secret);
  if (!guest) return { ok: false, error: "not_on_board" };
  if (guest.claimedBy && guest.claimedBy !== userId) return { ok: false, error: "claimed_by_other" };
  const admin = createServiceClient();
  const now = new Date().toISOString();

  // Scores: onto the account for days it has none; otherwise the account's own stands.
  const [{ data: gScores }, { data: uScores }] = await Promise.all([
    admin.from("daily_scores").select("game, day").eq("player", `g:${guest.key}`),
    admin.from("daily_scores").select("game, day").eq("player", `u:${userId}`),
  ]);
  const accountHas = new Set(((uScores ?? []) as { game: string; day: string }[]).map((r) => `${r.game}:${r.day}`));
  let days = 0;
  for (const s of (gScores ?? []) as { game: string; day: string }[]) {
    const where = admin.from("daily_scores").delete().eq("player", `g:${guest.key}`).eq("game", s.game).eq("day", s.day);
    if (accountHas.has(`${s.game}:${s.day}`)) { await where; continue; }
    const { error } = await admin.from("daily_scores").update({ player: `u:${userId}`, user_id: userId, guest_key: null })
      .eq("player", `g:${guest.key}`).eq("game", s.game).eq("day", s.day);
    if (!error) days += 1;
  }

  // Results: onto daily_results where the account has none that day, so streaks carry on.
  const { data: results } = await admin.from("daily_guest_results").select("day, puzzle, guesses, solved").eq("guest_key", guest.key);
  for (const r of (results ?? []) as { day: string; puzzle: string; guesses: number; solved: boolean }[]) {
    await admin.from("daily_results").upsert({ user_id: userId, day: r.day, puzzle: r.puzzle, guesses: r.guesses, solved: r.solved }, { onConflict: "user_id,day,puzzle", ignoreDuplicates: true });
  }

  // Held tokens: into the wallet, each once. A game's tokens the account already earned that day aren't paid twice.
  const { data: rewards } = await admin.from("daily_guest_rewards").select("id, kind, amount, ref").eq("guest_key", guest.key).is("claimed_at", null).gt("expires_at", now);
  const wallet = (await ensureAccountWallet(userId))?.identityId ?? null;
  let tokens = 0;
  for (const r of (rewards ?? []) as { id: string; kind: "play" | "prize"; amount: number; ref: string }[]) {
    const m = /^daily:(shuffle|dex|fire):(\d{4}-\d{2}-\d{2}):/.exec(r.ref);
    const twice = r.kind === "play" && m && accountHas.has(`${m[1]}:${m[2]}`);
    if (!twice && wallet) {
      const { error } = await admin.from("token_events").insert({
        identity_id: wallet, community_id: null, amount: r.amount, type: r.kind === "play" ? "earn_daily" : "award_board",
        meta: { source: "daily", claimed_from: "guest", ref: r.ref }, idempotency_key: `daily:claim:${r.id}`,
      });
      if (error && error.code !== "23505") { console.error("[boards] claim payout failed:", error); continue; }
      if (!error) tokens += r.amount;
    }
    await admin.from("daily_guest_rewards").update({ claimed_at: now, claimed_by: userId }).eq("id", r.id).is("claimed_at", null);
  }

  // Fire Round runs (personal bests, today's round) move too.
  await moveFireRuns(guest.key, userId).catch((e) => console.error("[boards] fire runs move failed:", e));

  await admin.from("daily_guests").update({ claimed_by: userId, claimed_at: now, updated_at: now }).eq("guest_key", guest.key);
  return { ok: true, tokens, days };
}
