/**
 * Daily Shuffle results (server only), for the site and for the Discord
 * Activity.
 *
 *   daily_results           one row per account per day (the site, signed in)
 *   daily_identity_results  one row per Discord identity per day (the Activity;
 *                           no account needed), with the guesses so far
 *
 * A person's stats read both: their account rows plus the rows of the Discord
 * identity that signs in to that account (users.discord_id). For a day in
 * both, the account row wins, and either way the first finished result for a
 * day stands. The server re-judges every result (judgeGame), so none can be
 * made up.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { MAX_GUESSES, answerFor, dayKey, judgeGame, puzzleFor, statsFrom, type DailyStats } from "@/lib/originals/daily";
import { gsAddDays } from "@/lib/time/gsClock";

export interface DailyRow { day: string; puzzle: string; guesses: number; solved: boolean }
/** `progress` = today's guesses saved by the Activity, finished or not. */
export interface DailyView { stats: DailyStats; today: DailyRow | null; progress: string[] | null }
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

async function accountRows(userId: string): Promise<DailyRow[]> {
  const { data, error } = await createServiceClient().from("daily_results").select("day, puzzle, guesses, solved")
    .eq("user_id", userId).order("day", { ascending: false }).limit(1000);
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

export async function dailyView(who: DailyWho): Promise<DailyView> {
  const identityId = who.identityId ?? (who.userId ? await discordIdentityFor(who.userId).catch(() => null) : null);
  const [acct, ident] = await Promise.all([
    who.userId ? accountRows(who.userId) : Promise.resolve([] as DailyRow[]),
    identityId ? identityRows(identityId) : Promise.resolve([]),
  ]);
  const finished = ident.filter((r) => r.finished).map(({ day, puzzle, guesses, solved }) => ({ day, puzzle, guesses, solved }));
  // Account rows first: statsFrom keeps the first row it sees for a day.
  const rows = [...acct, ...finished];
  const today = dayKey();
  // Today's guesses as saved by the Activity (finished or not), so reopening it shows the game.
  const saved = ident.find((r) => r.day === today && r.puzzle === puzzleFor(today).id);
  return { stats: statsFrom(rows, today), today: rows.find((r) => r.day === today) ?? null, progress: saved?.guess_list.length ? saved.guess_list : null };
}

async function hasFinished(who: DailyWho, day: string): Promise<boolean> {
  const admin = createServiceClient();
  const identityId = who.identityId ?? (who.userId ? await discordIdentityFor(who.userId).catch(() => null) : null);
  if (who.userId) {
    const { data } = await admin.from("daily_results").select("day").eq("user_id", who.userId).eq("day", day).limit(1);
    if (data?.length) return true;
  }
  if (identityId) {
    const { data } = await admin.from("daily_identity_results").select("day").eq("identity_id", identityId).eq("day", day).not("finished_at", "is", null).limit(1);
    if (data?.length) return true;
  }
  return false;
}

export type SaveDailyResult = { ok: true } | { ok: false; error: "wrong_day" | "not_a_finished_game" | "save_failed" };

/** Records a finished game for an account (the site). The first result for a day stands, from either surface. */
export async function saveAccountResult(userId: string, rawDay: unknown, rawGuesses: unknown): Promise<SaveDailyResult> {
  const day = playableDay(rawDay);
  if (!day) return { ok: false, error: "wrong_day" };
  const guesses = Array.isArray(rawGuesses) ? rawGuesses.filter((g): g is string => typeof g === "string") : [];
  const result = judgeGame(day, guesses);
  if (!result) return { ok: false, error: "not_a_finished_game" };
  if (await hasFinished({ userId }, day)) return { ok: true };
  const { error } = await createServiceClient().from("daily_results")
    .upsert({ user_id: userId, day, puzzle: puzzleFor(day).id, guesses: result.guesses, solved: result.solved }, { onConflict: "user_id,day,puzzle", ignoreDuplicates: true });
  if (error) {
    console.error("[daily] save failed:", error);
    return { ok: false, error: "save_failed" };
  }
  return { ok: true };
}

/**
 * The Activity: saves the guesses so far, and the result once the game is
 * over. Guesses must be names from the day's roster, in order, with nothing
 * after the answer. A finished row is never changed.
 */
export async function saveIdentityGame(who: { identityId: string; userId?: string | null }, rawDay: unknown, rawGuesses: unknown): Promise<SaveDailyResult> {
  const day = playableDay(rawDay);
  if (!day) return { ok: false, error: "wrong_day" };
  const guesses = Array.isArray(rawGuesses) ? rawGuesses.filter((g): g is string => typeof g === "string") : [];
  const roster = puzzleFor(day).characters;
  const answer = answerFor(day).name;
  const at = guesses.indexOf(answer);
  const valid = guesses.length >= 1 && guesses.length <= MAX_GUESSES && new Set(guesses).size === guesses.length
    && guesses.every((g) => roster.some((c) => c.name === g)) && (at === -1 || at === guesses.length - 1);
  if (!valid) return { ok: false, error: "not_a_finished_game" };
  const result = judgeGame(day, guesses);
  if (result && await hasFinished(who, day)) return { ok: true };

  const admin = createServiceClient();
  const now = new Date().toISOString();
  const row = {
    identity_id: who.identityId, day, puzzle: puzzleFor(day).id, guess_list: guesses, updated_at: now,
    ...(result ? { guesses: result.guesses, solved: result.solved, finished_at: now } : {}),
  };
  // Only an unfinished row (or none) may be written: a finished game stays as it was.
  const { data: existing } = await admin.from("daily_identity_results").select("finished_at").eq("identity_id", who.identityId).eq("day", day).maybeSingle();
  if ((existing as { finished_at: string | null } | null)?.finished_at) return { ok: true };
  const { error } = existing
    ? await admin.from("daily_identity_results").update(row).eq("identity_id", who.identityId).eq("day", day).is("finished_at", null)
    : await admin.from("daily_identity_results").insert(row);
  if (error && error.code !== "23505") {
    console.error("[daily] activity save failed:", error);
    return { ok: false, error: "save_failed" };
  }
  return { ok: true };
}
