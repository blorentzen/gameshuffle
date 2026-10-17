/**
 * Daily Shuffle results (server only), for the site and for the Discord
 * Activity.
 *
 *   daily_results           one row per account per day (the site, signed in)
 *   daily_identity_results  one row per Discord identity per day (the Activity;
 *                           no account needed), with the guesses so far
 *
 * Two games share the tables, told apart by puzzle id: the Daily Shuffle
 * (every puzzle but DEX_PUZZLE_ID) and the Daily Dex (DEX_PUZZLE_ID), each
 * with its own streak. Every function takes the game's schedule (default the
 * Shuffle). Since daily-boards-m1, daily_identity_results keeps a row per
 * identity per day per puzzle, so the Activity plays both.
 *
 * A person's stats read both: their account rows plus the rows of the Discord
 * identity that signs in to that account (users.discord_id). For a day in
 * both, the account row wins, and either way the first finished result for a
 * day stands. The server re-judges every result (judgeGame), so none can be
 * made up.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { DEX_PUZZLE_ID, SHUFFLE, answerFor, dayKey, guessLimits, judgeGame, puzzleFor, statsFrom, type DailySchedule, type DailyStats } from "@/lib/originals/daily";
import { gsAddDays } from "@/lib/time/gsClock";
import { playerForIdentity, recordScore, type ScoreResult } from "@/lib/daily/boards";
import type { DayMark } from "@/lib/originals/dailies";
import { extraGuesses } from "@/lib/daily/help";

export interface DailyRow { day: string; puzzle: string; guesses: number; solved: boolean }
/** `progress` = today's guesses saved by the Activity, finished or not. `recent` = the last 14 days, oldest first. */
export interface DailyView { stats: DailyStats; today: DailyRow | null; progress: string[] | null; recent: DayMark[] }
/** Who's playing: an account, a Discord identity, or both when they're linked. */
export interface DailyWho { userId?: string | null; identityId?: string | null }

/** Today, or yesterday so a game finished just after midnight Pacific still counts. */
export function playableDay(raw: unknown): string | null {
  const today = dayKey();
  const day = typeof raw === "string" ? raw : today;
  return day === today || day === gsAddDays(today, -1) ? day : null;
}

/** The Discord identity that signs in to this account, if any. */
export async function discordIdentityFor(userId: string): Promise<string | null> {
  const admin = createServiceClient();
  const { data: user } = await admin.from("users").select("discord_id").eq("id", userId).maybeSingle();
  const discordId = (user as { discord_id: string | null } | null)?.discord_id;
  if (!discordId) return null;
  const { data } = await admin.from("gs_identities").select("id").eq("platform", "discord").eq("platform_id", discordId).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/** The account that signs in with this Discord user, if any. */
export async function accountForDiscord(discordId: string): Promise<string | null> {
  const { data } = await createServiceClient().from("users").select("id").eq("discord_id", discordId).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/** Which rows belong to a game: the Dex's own puzzle id, or every other puzzle for the Shuffle. */
const ofGame = (game: DailySchedule, puzzle: string) => (game.id === "dex") === (puzzle === DEX_PUZZLE_ID);

async function accountRows(userId: string, game: DailySchedule): Promise<DailyRow[]> {
  const base = createServiceClient().from("daily_results").select("day, puzzle, guesses, solved").eq("user_id", userId);
  const { data, error } = await (game.id === "dex" ? base.eq("puzzle", DEX_PUZZLE_ID) : base.neq("puzzle", DEX_PUZZLE_ID))
    .order("day", { ascending: false }).limit(1000);
  if (error) throw error;
  return (data ?? []) as DailyRow[];
}

/** Every row for an identity, finished or not (a missing table reads as none). */
async function identityRows(identityId: string): Promise<(DailyRow & { guess_list: string[]; finished: boolean })[]> {
  const { data, error } = await createServiceClient().from("daily_identity_results").select("day, puzzle, guesses, solved, guess_list, finished_at")
    .eq("identity_id", identityId).order("day", { ascending: false }).limit(1000);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw error;
  }
  return ((data ?? []) as { day: string; puzzle: string; guesses: number | null; solved: boolean | null; guess_list: string[]; finished_at: string | null }[])
    .map((r) => ({ day: r.day, puzzle: r.puzzle, guesses: r.guesses ?? 0, solved: !!r.solved, guess_list: r.guess_list ?? [], finished: !!r.finished_at }));
}

export async function dailyView(who: DailyWho, game: DailySchedule = SHUFFLE): Promise<DailyView> {
  const identityId = who.identityId ?? (who.userId ? await discordIdentityFor(who.userId).catch(() => null) : null);
  const [acct, allIdent] = await Promise.all([
    who.userId ? accountRows(who.userId, game) : Promise.resolve([] as DailyRow[]),
    identityId ? identityRows(identityId) : Promise.resolve([]),
  ]);
  const ident = allIdent.filter((r) => ofGame(game, r.puzzle));
  const finished = ident.filter((r) => r.finished).map(({ day, puzzle, guesses, solved }) => ({ day, puzzle, guesses, solved }));
  // Account rows first: statsFrom keeps the first row it sees for a day.
  const rows = [...acct, ...finished];
  const today = dayKey();
  // Today's guesses as saved by the Activity (finished or not), so reopening it shows the game.
  const saved = ident.find((r) => r.day === today && r.puzzle === puzzleFor(today, game).id);
  return { stats: statsFrom(rows, today, game), today: rows.find((r) => r.day === today) ?? null, progress: saved?.guess_list.length ? saved.guess_list : null, recent: recentMarks(rows, today, game) };
}

/**
 * The days a player solved this game (last-chance saves count, as for streaks),
 * with the account's rows first and a linked Discord identity's finished games
 * filling the rest, the way the streak cards count them.
 */
export async function solvedDays(who: DailyWho, game: DailySchedule = SHUFFLE): Promise<Set<string>> {
  const identityId = who.identityId ?? (who.userId ? await discordIdentityFor(who.userId).catch(() => null) : null);
  const [acct, ident] = await Promise.all([
    who.userId ? accountRows(who.userId, game) : Promise.resolve([] as DailyRow[]),
    identityId ? identityRows(identityId) : Promise.resolve([]),
  ]);
  const byDay = new Map<string, boolean>();
  for (const r of acct) if (!byDay.has(r.day)) byDay.set(r.day, r.solved);
  for (const r of ident) if (r.finished && ofGame(game, r.puzzle) && !byDay.has(r.day)) byDay.set(r.day, r.solved);
  return new Set([...byDay].filter(([, solved]) => solved).map(([day]) => day));
}

/** The last `n` days for a streak card, oldest first: the first result per day stands. */
function recentMarks(rows: DailyRow[], today: string, game: DailySchedule, n = 14): DayMark[] {
  const byDay = new Map<string, DailyRow>();
  for (const r of rows) if (!byDay.has(r.day)) byDay.set(r.day, r);
  return Array.from({ length: n }, (_, i) => {
    const day = gsAddDays(today, i - n + 1);
    const r = byDay.get(day);
    if (!r) return null;
    return !r.solved ? "missed" : r.guesses > guessLimits(puzzleFor(day, game)).main ? "saved" : "won";
  });
}

export async function hasFinished(who: DailyWho, day: string, game: DailySchedule = SHUFFLE): Promise<boolean> {
  const admin = createServiceClient();
  const identityId = who.identityId ?? (who.userId ? await discordIdentityFor(who.userId).catch(() => null) : null);
  if (who.userId) {
    const { data } = await admin.from("daily_results").select("puzzle").eq("user_id", who.userId).eq("day", day).limit(10);
    if ((data ?? []).some((r) => ofGame(game, (r as { puzzle: string }).puzzle))) return true;
  }
  if (identityId) {
    const { data } = await admin.from("daily_identity_results").select("puzzle").eq("identity_id", identityId).eq("day", day).not("finished_at", "is", null).limit(1);
    if ((data ?? []).some((r) => ofGame(game, (r as { puzzle: string }).puzzle))) return true;
  }
  return false;
}

/** `score` = the game's points and tokens on the boards (null before daily-boards-m1, or when this day was already scored). */
export type SaveDailyResult = { ok: true; score?: ScoreResult | null } | { ok: false; error: "wrong_day" | "not_a_finished_game" | "save_failed" };

/** Records a finished game for an account (the site). The first result for a day stands, from either surface. */
export async function saveAccountResult(userId: string, rawDay: unknown, rawGuesses: unknown, game: DailySchedule = SHUFFLE): Promise<SaveDailyResult> {
  const day = playableDay(rawDay);
  if (!day) return { ok: false, error: "wrong_day" };
  const guesses = Array.isArray(rawGuesses) ? rawGuesses.filter((g): g is string => typeof g === "string") : [];
  const result = judgeGame(day, guesses, game, await extraGuesses(`u:${userId}`, game.id, day));
  if (!result) return { ok: false, error: "not_a_finished_game" };
  if (await hasFinished({ userId }, day, game)) return { ok: true };
  const { error } = await createServiceClient().from("daily_results")
    .upsert({ user_id: userId, day, puzzle: puzzleFor(day, game).id, guesses: result.guesses, solved: result.solved }, { onConflict: "user_id,day,puzzle", ignoreDuplicates: true });
  if (error) {
    console.error("[daily] save failed:", error);
    return { ok: false, error: "save_failed" };
  }
  // On the boards: points, and tokens into the account's wallet (once per day per game).
  const score = await recordScore({ game: game.id, day, player: { kind: "u", id: userId }, guesses: result.guesses, solved: result.solved, main: guessLimits(puzzleFor(day, game)).main })
    .catch((e) => { console.error("[daily] score failed:", e); return null; });
  return { ok: true, score };
}

/**
 * The Activity: saves the guesses so far, and the result once the game is
 * over. Guesses must be names from the day's roster, in order, with nothing
 * after the answer. A finished row is never changed.
 */
export async function saveIdentityGame(who: { identityId: string; userId?: string | null }, rawDay: unknown, rawGuesses: unknown, where?: { channelId: string; guildId: string } | null, game: DailySchedule = SHUFFLE): Promise<SaveDailyResult & { day?: string; finished?: boolean }> {
  const day = playableDay(rawDay);
  if (!day) return { ok: false, error: "wrong_day" };
  const guesses = Array.isArray(rawGuesses) ? rawGuesses.filter((g): g is string => typeof g === "string") : [];
  const roster = puzzleFor(day, game).characters;
  const answer = answerFor(day, game).name;
  const at = guesses.indexOf(answer);
  const extra = await extraGuesses(`i:${who.identityId}`, game.id, day);
  const valid = guesses.length >= 1 && guesses.length <= guessLimits(puzzleFor(day, game)).total + extra && new Set(guesses).size === guesses.length
    && guesses.every((g) => roster.some((c) => c.name === g)) && (at === -1 || at === guesses.length - 1);
  if (!valid) return { ok: false, error: "not_a_finished_game" };
  const result = judgeGame(day, guesses, game, extra);
  if (result && await hasFinished(who, day, game)) return { ok: true };

  const admin = createServiceClient();
  const now = new Date().toISOString();
  const row = {
    identity_id: who.identityId, day, puzzle: puzzleFor(day, game).id, guess_list: guesses, updated_at: now,
    ...(result ? { guesses: result.guesses, solved: result.solved, finished_at: now } : {}),
    // The latest server channel they played in (Discord-confirmed), for its results card.
    ...(where ? { channel_id: where.channelId, guild_id: where.guildId } : {}),
  };
  // Only an unfinished row (or none) may be written: a finished game stays as it was.
  // By puzzle too: once daily-boards-m1 runs, an identity can hold both dailies on a day.
  const puzzle = puzzleFor(day, game).id;
  const { data: existing } = await admin.from("daily_identity_results").select("finished_at").eq("identity_id", who.identityId).eq("day", day).eq("puzzle", puzzle).maybeSingle();
  if ((existing as { finished_at: string | null } | null)?.finished_at) return { ok: true };
  const { error } = existing
    ? await admin.from("daily_identity_results").update(row).eq("identity_id", who.identityId).eq("day", day).eq("puzzle", puzzle).is("finished_at", null)
    : await admin.from("daily_identity_results").insert(row);
  if (error && error.code !== "23505") {
    console.error("[daily] activity save failed:", error);
    return { ok: false, error: "save_failed" };
  }
  // A finished game goes on the boards: under the account when the Discord user has one, else the identity.
  let score: ScoreResult | null = null;
  if (result && !error) {
    const player = await playerForIdentity(who.identityId, who.userId).catch(() => ({ kind: "i" as const, id: who.identityId }));
    score = await recordScore({ game: game.id, day, player, guesses: result.guesses, solved: result.solved, main: guessLimits(puzzleFor(day, game)).main })
      .catch((e) => { console.error("[daily] score failed:", e); return null; });
  }
  return { ok: true, day, finished: !!result, score };
}
