import "server-only";

/**
 * Share cards, server side (Britton's picks, 2026-10-19): works out a card from what the server
 * can check and keeps it behind a short code (gs_share_cards, supabase/share-cards-m1.sql).
 *
 *   Puzzles   the guesses come from the page and are judged again (judgeGame); for an account,
 *             or a guest on the leaderboard, they must match the saved result. Single-game cards
 *             get the trait squares (hintFor); the day card a square per guess.
 *   Fire      the round is the server's own record (a run of this player's, else today's).
 *   Weekly    an account's entry for this week.
 *
 * Who: an account with a public profile shows its name, picture and background (banner, else
 * brand theme); a private profile gets the guest card. A guest shows their leaderboard name once
 * they've added one. Times, streaks and places come from the server, never the page.
 */

import { randomInt } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { SHUFFLE, answerFor, dayKey, guessLimits, hintFor, judgeGame, puzzleFor, puzzleNumber, type DailySchedule } from "@/lib/originals/daily";
import { DEX } from "@/lib/originals/dailyDex";
import { dailyView } from "@/lib/daily/results";
import { boardView, timesFor } from "@/lib/daily/boards";
import { parsePlayer, type BoardGame } from "@/lib/daily/boardRules";
import { streakEnding } from "@/lib/originals/winners";
import { fireShareFacts } from "@/lib/fireRound/store";
import { weekNumber, weekOf } from "@/lib/originals/weekly";
import { getEntry, getWeek } from "@/lib/weekly/store";
import { accountAvatar, type AccountRow } from "@/lib/discord/faces";
import { BRAND_THEMES } from "@/lib/theme/brand";
import { codeFor } from "@/lib/referrals/store";
import { supporterInfo } from "@/lib/support/store";
import { SITE_URL } from "@/lib/seo";
import { clockLabel, clockSeconds, isQuizClock, isQuizSet, setLabel, setPool } from "@/lib/pokemon/nameQuiz";
import { shareAlt, type NamesPart, type FirePart, type PuzzlePart, type ShareBackground, type ShareCell, type ShareData, type ShareKind, type ShareMade, type SharePart, type SharePlayer, type ShareRequest, type SupporterPart, type WeeklyPart } from "./types";

type DbError = { code?: string; message?: string } | null;
const missing = (e: DbError) => !!e && (["42P01", "PGRST205"].includes(e.code ?? "") || /does not exist|schema cache/i.test(e.message ?? ""));

export type ShareError = "not_ready" | "bad_request" | "no_result" | "mismatch";

const SCHEDULE: Record<"shuffle" | "dex", DailySchedule> = { shuffle: SHUFFLE, dex: DEX };

function cleanGuesses(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 12) return null;
  const out = raw.filter((g): g is string => typeof g === "string" && g.length > 0 && g.length <= 60);
  return out.length === raw.length ? out : null;
}

/** A finished puzzle, judged again (allowing up to two bought guesses on the last chance). */
function judge(day: string, guesses: string[], s: DailySchedule): { guesses: number; solved: boolean; saved: boolean } | null {
  for (let extra = 0; extra <= 2; extra++) {
    const r = judgeGame(day, guesses, s, extra);
    if (r) return { ...r, saved: r.solved && r.guesses > guessLimits(puzzleFor(day, s)).main };
  }
  return null;
}

/** The result the server has saved for this player today: an account's, or a guest's on the leaderboard. */
async function savedResult(key: string, game: "shuffle" | "dex", day: string): Promise<{ guesses: number; solved: boolean } | null> {
  const p = parsePlayer(key);
  if (!p) return null;
  if (p.kind === "u") {
    const v = await dailyView({ userId: p.id }, SCHEDULE[game]).catch(() => null);
    return v?.today && v.today.day === day ? { guesses: v.today.guesses, solved: v.today.solved } : null;
  }
  if (p.kind === "g") {
    const puzzle = game === "dex" ? "pokemon-dex" : puzzleFor(day, SHUFFLE).id;
    const { data } = await createServiceClient().from("daily_guest_results").select("guesses, solved").eq("guest_key", p.id).eq("day", day).eq("puzzle", puzzle).maybeSingle();
    return (data as { guesses: number; solved: boolean } | null) ?? null;
  }
  return null;
}

/** Consecutive solved days ending today: an account's from its results, a guest's from the leaderboard. */
async function puzzleStreak(key: string, game: "shuffle" | "dex", day: string): Promise<number> {
  const p = parsePlayer(key);
  if (!p) return 0;
  if (p.kind === "u") return (await dailyView({ userId: p.id }, SCHEDULE[game]).catch(() => null))?.stats.streak ?? 0;
  const { data } = await createServiceClient().from("daily_scores").select("day").eq("player", key).eq("game", game).eq("solved", true).lte("day", day).order("day", { ascending: false }).limit(400);
  return streakEnding(new Set(((data ?? []) as { day: string }[]).map((r) => r.day)), day);
}

/** This player's place on today's board (null when they aren't on it). */
async function placeToday(key: string, game: BoardGame, day: string): Promise<number | null> {
  const v = await boardView({ game, period: "day", day, me: key, limit: 1 }).catch(() => null);
  return v?.you?.place ?? null;
}

async function puzzlePart(key: string, game: "shuffle" | "dex", day: string, raw: unknown, full: boolean): Promise<PuzzlePart | ShareError> {
  const s = SCHEDULE[game];
  const puzzle = puzzleFor(day, s);
  const main = guessLimits(puzzle).main;
  const saved = await savedResult(key, game, day);
  const guesses = cleanGuesses(raw);
  let result: { guesses: number; solved: boolean; saved: boolean } | null = null;
  let rows: ShareCell[][] = [];
  if (guesses) {
    result = judge(day, guesses, s);
    if (!result) return "no_result";
    // An account (or a guest on the board) shares the game it saved, nothing else.
    if (saved && (saved.guesses !== result.guesses || saved.solved !== result.solved)) return "mismatch";
    if (full) {
      const answer = answerFor(day, s);
      rows = guesses.map((g) => (hintFor(g, answer, puzzle)?.cells ?? []).map((c) => c.status as ShareCell));
    }
  } else if (saved) {
    result = { ...saved, saved: saved.solved && saved.guesses > main };
  } else {
    return "no_result";
  }
  const [times, streak, place] = await Promise.all([
    timesFor(key, game, day).catch(() => ({ seconds: null })),
    puzzleStreak(key, game, day),
    placeToday(key, game, day),
  ]);
  return {
    kind: game, number: puzzleNumber(day, s), rows, cols: rows[0]?.length ?? 0,
    guesses: result.guesses, main, solved: result.solved, saved: result.saved,
    seconds: result.solved ? times.seconds ?? null : null, streak, place,
  };
}

async function firePart(key: string, runId: string | null): Promise<FirePart | null> {
  const p = parsePlayer(key);
  if (!p || p.kind === "i") return null;
  const f = await fireShareFacts(p, runId);
  if (!f) return null;
  const place = f.daily && f.counts ? await placeToday(key, "fire", f.day) : null;
  return { kind: "fire", daily: f.daily, number: f.number, score: f.score, right: f.right, bestStreak: f.bestStreak, categoryLabel: f.categoryLabel, lengthLabel: f.lengthLabel, streak: f.daily ? f.streak : 0, place };
}

async function weeklyPart(key: string): Promise<WeeklyPart | null> {
  const p = parsePlayer(key);
  if (p?.kind !== "u") return null;
  const week = weekOf();
  const [row, entry] = await Promise.all([getWeek(week).catch(() => null), getEntry(week, p.id).catch(() => null)]);
  if (!row || !entry) return null;
  const e = entry as { ballot?: unknown; answer?: string | null; predictions?: unknown };
  if (!e.ballot && !e.answer && !e.predictions) return null;
  return { kind: "weekly", number: weekNumber(week), title: row.title };
}

/** The name, picture and background on the card. */
async function who(key: string): Promise<{ player: SharePlayer | null; background: ShareBackground | null; referral: string | null }> {
  const p = parsePlayer(key);
  const svc = createServiceClient();
  if (p?.kind === "u") {
    const { data } = await svc.from("users").select("id, display_name, username, is_public, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar, profile_banner_url, profile_theme").eq("id", p.id).maybeSingle();
    const u = data as (AccountRow & { display_name: string | null; username: string | null; is_public: boolean | null; profile_banner_url: string | null; profile_theme: string | null }) | null;
    const referral = await codeFor(p.id, null).catch(() => null);
    // A private profile shares the guest card: no name, picture or background.
    if (!u || u.is_public === false) return { player: null, background: null, referral };
    const theme = BRAND_THEMES.find((t) => t.id === u.profile_theme && t.id !== "default");
    return {
      player: { name: u.display_name || u.username || "A player", avatar: accountAvatar(u), profile: u.username ? `/u/${u.username}` : null, guest: false },
      background: u.profile_banner_url || theme ? { banner: u.profile_banner_url ?? null, theme: theme?.gradient ?? null } : null,
      referral,
    };
  }
  if (p?.kind === "g") {
    const { data } = await svc.from("daily_guests").select("name").eq("guest_key", p.id).maybeSingle();
    const name = (data as { name: string } | null)?.name;
    return { player: name ? { name, avatar: null, profile: null, guest: true } : null, background: null, referral: null };
  }
  return { player: null, background: null, referral: null };
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const newCode = () => Array.from({ length: 7 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/**
 * A supporter's card: an account that supports GameShuffle now, or (from the thank-you page) the
 * paid Checkout session of a gift made signed out. Since when and whether monthly; never an amount.
 */
async function supporterPart(key: string, session: string | undefined): Promise<SupporterPart | null> {
  const p = parsePlayer(key);
  if (p?.kind === "u") {
    const info = await supporterInfo(p.id).catch(() => null);
    if (info?.supporter && info.since) return { kind: "supporter", since: info.since, monthly: !!info.monthly };
  }
  if (session && /^cs_[A-Za-z0-9_]{10,200}$/.test(session)) {
    const { data } = await createServiceClient().from("support_gifts").select("paid_at, kind, status").eq("checkout_session_id", session).maybeSingle();
    const g = data as { paid_at: string; kind: string; status: string } | null;
    if (g?.status === "paid") return { kind: "supporter", since: g.paid_at, monthly: g.kind === "monthly" };
  }
  return null;
}

/**
 * Name every Pokémon: a quiz played in the browser, so the score is the player's own word. It's
 * checked for sense (real Pokémon in the set, each once; the time inside the clock) and carries no
 * tokens or leaderboard place.
 */
function namesPart(raw: ShareRequest["names"]): NamesPart | null {
  if (!raw || !isQuizSet(raw.set) || !isQuizClock(raw.clock) || !Array.isArray(raw.named) || raw.named.length > 1100) return null;
  const pool = new Set(setPool(raw.set).map((p) => p.dex));
  const count = new Set(raw.named.filter((d) => typeof d === "number" && pool.has(d))).size;
  const limit = clockSeconds(raw.set, raw.clock) ?? 12 * 3600;
  const seconds = Math.max(0, Math.min(limit, Math.round(Number(raw.seconds) || 0)));
  return { kind: "names", set: raw.set, setLabel: setLabel(raw.set), count, of: pool.size, seconds, clockLabel: clockLabel(raw.set, raw.clock) };
}

/** Makes (or refreshes) this player's card for a request and returns its link. */
export async function makeShare(key: string, req: ShareRequest): Promise<ShareMade | ShareError> {
  const kind = req.kind;
  if (!["shuffle", "dex", "fire", "weekly", "day", "supporter", "names"].includes(kind)) return "bad_request";
  const day = dayKey();
  const parts: SharePart[] = [];
  let ref = "";

  if (kind === "shuffle" || kind === "dex") {
    const part = await puzzlePart(key, kind, day, kind === "shuffle" ? req.shuffle : req.dex, true);
    if (typeof part === "string") return part;
    parts.push(part);
  } else if (kind === "fire") {
    const runId = typeof req.fireRun === "string" && /^[0-9a-f-]{36}$/i.test(req.fireRun) ? req.fireRun : null;
    const part = await firePart(key, runId);
    if (!part) return "no_result";
    parts.push(part);
    ref = part.daily ? "" : runId ?? "";
  } else if (kind === "names") {
    const part = namesPart(req.names);
    if (!part) return "bad_request";
    parts.push(part);
    // One card per set and clock a day.
    ref = `${part.set}-${req.names!.clock}`;
  } else if (kind === "supporter") {
    const part = await supporterPart(key, req.session);
    if (!part) return "no_result";
    parts.push(part);
    // A gift made signed out gets its own card per gift.
    ref = parsePlayer(key)?.kind === "u" ? "" : (req.session ?? "");
  } else if (kind === "weekly") {
    const part = await weeklyPart(key);
    if (!part) return "no_result";
    parts.push(part);
  } else {
    // The whole day: every daily this player has finished today, in the bar's order.
    for (const game of ["shuffle", "dex"] as const) {
      const part = await puzzlePart(key, game, day, game === "shuffle" ? req.shuffle : req.dex, false);
      if (typeof part !== "string") parts.push(part);
      else if (part === "mismatch") return part;
    }
    const fire = await firePart(key, null);
    if (fire) parts.push(fire);
    const weekly = await weeklyPart(key);
    if (weekly) parts.push(weekly);
    if (parts.length < 2) return "no_result";
  }

  const found = await who(key);
  // A supporter card from a signed-out gift never carries a guest's leaderboard name.
  const { player, background, referral } = kind === "supporter" && parsePlayer(key)?.kind !== "u" ? { player: null, background: null, referral: null } : found;
  const data: ShareData = { v: 1, kind, day, player, background, parts, referral };
  const svc = createServiceClient();
  const { data: had, error } = await svc.from("gs_share_cards").select("code").eq("player", key).eq("kind", kind).eq("day", day).eq("ref", ref).maybeSingle();
  if (error) return missing(error) ? "not_ready" : "bad_request";
  const now = new Date().toISOString();
  let code = (had as { code: string } | null)?.code ?? null;
  if (code) {
    await svc.from("gs_share_cards").update({ data, updated_at: now }).eq("code", code);
  } else {
    for (let i = 0; i < 5 && !code; i++) {
      const c = newCode();
      const ins = await svc.from("gs_share_cards").insert({ code: c, player: key, kind, day, ref, data, updated_at: now });
      if (!ins.error) code = c;
      else if (ins.error.code === "23505") {
        // Another tab made this card first: use theirs.
        const { data: race } = await svc.from("gs_share_cards").select("code").eq("player", key).eq("kind", kind).eq("day", day).eq("ref", ref).maybeSingle();
        if (race) code = (race as { code: string }).code;
      } else return "bad_request";
    }
  }
  if (!code) return "bad_request";
  return { code, url: `${SITE_URL}/r/${code}`, version: Date.parse(now), alt: shareAlt(data) };
}

/** A card by its code (the result page and its pictures). */
export async function loadShare(code: string): Promise<{ data: ShareData; updatedAt: string } | null> {
  if (!/^[a-z0-9]{6,12}$/.test(code)) return null;
  const { data, error } = await createServiceClient().from("gs_share_cards").select("data, updated_at").eq("code", code).maybeSingle();
  if (error || !data) return null;
  const row = data as { data: ShareData; updated_at: string };
  return { data: row.data, updatedAt: row.updated_at };
}

/** Whose card a code is (`u:`/`i:`/`g:`), for the leaderboard's "shared this". Server only: never sent to a page. */
export async function sharePlayer(code: string): Promise<string | null> {
  if (!/^[a-z0-9]{6,12}$/.test(code)) return null;
  const { data } = await createServiceClient().from("gs_share_cards").select("player").eq("code", code).maybeSingle();
  return (data as { player: string } | null)?.player ?? null;
}

export type { ShareKind };
