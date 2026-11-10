import "server-only";

/**
 * A game space's thing of the day and of the week (spaces round three, 2026-11-06, picks
 * https://claude.ai/artifact/Lxq5Ep5ejWMgc8ZBYwYFyL, all as recommended; Britton: GameShuffle tokens for all of it).
 * The same for everyone: the first read of a day or week rolls it from the space's own randomizer and keeps it in
 * `space_challenges` (supabase/space-challenges-m1.sql), new at midnight Pacific (weeks start Monday). People check
 * in (one tap for a daily, a step at a time for a weekly); check-ins keep a streak per space and pay tokens from
 * GameShuffle (token type earn_space, every amount a lever on Platform ▸ Token economy ▸ Game spaces). Before the
 * migration runs everything here reads as "not ready" and the space shows nothing new.
 *
 *   Mario Kart 8 Deluxe / World: Combo of the day (with the time trial of the day on today's track, spaceTt.ts),
 *     the Combo Cup each week (that week's combo on four tracks, scored by total time).
 *   Smash: Fighter of the day; the Gauntlet (win with five fighters by Sunday).
 *   Mario Party: Party of the day (board, turns, rules, Bonus Stars and your character); the party challenge (win
 *     on this week's board as this week's character).
 *   Pokémon: the Daily Dex and Daily Duel are its dailies already; Run of the week (the same Fire Red run for
 *     everyone, a badge at a time).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { ensureAccountWallet } from "@/lib/economy/accountWallet";
import { gsAddDays, gsDay, gsWeekStart } from "@/lib/time/gsClock";
import { getChatGame } from "@/lib/twitch/chatGames";
import { CHAT_SETUPS } from "@/lib/twitch/chatSetups";
import type { ChatRoll } from "@/lib/twitch/chatRoll";
import { trackPath, ttTrack, ttTracks, type TtGame } from "@/lib/timeTrials/tracks";
import { buildRun } from "@/lib/pokemon/frlgRun";
import type { GameSpace } from "@/lib/games/spaces";
import type { PersonAvatar } from "@/lib/home/people";

export type ChallengeKind = "day" | "week";

/** What a space's day or week holds, as stored. */
export type DayChallenge =
  | { type: "combo"; roll: ChatRoll; tt: { game: TtGame; track: string } | null }
  | { type: "fighter"; roll: ChatRoll }
  | { type: "party"; roll: ChatRoll };
export type WeekChallenge =
  | { type: "cup"; roll: ChatRoll; game: TtGame; tracks: string[] }
  | { type: "gauntlet"; rolls: ChatRoll[] }
  | { type: "party"; roll: ChatRoll }
  | { type: "run"; seed: string; version: "firered" | "leafgreen"; badges: { leader: string; badge: string }[] };

/** One step of a weekly people tick off (a fighter, a badge), or the weekly as one step. */
export interface WeekStep { label: string; img: string | null; done: boolean; href?: string }

export interface ChallengeFace { id: string; name: string; avatar: PersonAvatar }

export interface DayView {
  period: string;
  challenge: DayChallenge;
  /** "Combo of the day". */
  title: string;
  /** What to do, one sentence. */
  line: string;
  /** The check-in button ("I won a race with it"). */
  action: string;
  /** What the count counts ("won a race with it today"). */
  did: string;
  count: number;
  faces: ChallengeFace[];
  mine: boolean;
  streak: number;
}
export interface WeekView {
  period: string;
  challenge: WeekChallenge;
  title: string;
  line: string;
  steps: WeekStep[];
  /** Steps the viewer has done, as indexes. */
  progress: number[];
  done: boolean;
  /** How many finished it this week. */
  count: number;
  /** Days left, counting today. */
  daysLeft: number;
  /** Where the full thing lives (the run, the randomizer), when it's somewhere else. */
  link: { href: string; label: string } | null;
}
export interface ChallengeView {
  ready: boolean;
  day: DayView | null;
  week: WeekView | null;
  tokens: SpaceLevers;
}

export interface SpaceLevers {
  day: number;
  streak: number;
  streakEvery: number;
  week: number;
  ttEntry: number;
  ttDay: [number, number, number];
  cup: [number, number, number];
}
const DEFAULT_LEVERS: SpaceLevers = { day: 10, streak: 25, streakEvery: 7, week: 50, ttEntry: 10, ttDay: [100, 60, 40], cup: [250, 150, 100] };

let leverCache: { at: number; levers: SpaceLevers } | null = null;
/** The spaces' numbers from gs_economy_config (cached a minute), defaults where a row is missing. */
export async function spaceLevers(): Promise<SpaceLevers> {
  if (leverCache && Date.now() - leverCache.at < 60_000) return leverCache.levers;
  const { data } = await createServiceClient().from("gs_economy_config").select("key, value").like("key", "space_%");
  const m = new Map(((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, Number(r.value)]));
  const n = (k: string, d: number) => { const v = m.get(k); return v != null && Number.isFinite(v) && v >= 0 ? Math.floor(v) : d; };
  const D = DEFAULT_LEVERS;
  const levers: SpaceLevers = {
    day: n("space_day_tokens", D.day), streak: n("space_streak_tokens", D.streak), streakEvery: Math.max(2, n("space_streak_every", D.streakEvery)),
    week: n("space_week_tokens", D.week), ttEntry: n("space_tt_entry_tokens", D.ttEntry),
    ttDay: [n("space_tt_day_first_tokens", D.ttDay[0]), n("space_tt_day_second_tokens", D.ttDay[1]), n("space_tt_day_third_tokens", D.ttDay[2])],
    cup: [n("space_cup_first_tokens", D.cup[0]), n("space_cup_second_tokens", D.cup[1]), n("space_cup_third_tokens", D.cup[2])],
  };
  leverCache = { at: Date.now(), levers };
  return levers;
}

let readyAt = 0;
/** Whether space-challenges-m1 has run (asked again after a minute when it hasn't). */
export async function challengesReady(): Promise<boolean> {
  if (readyAt > 0) return true;
  if (readyAt < 0 && Date.now() + readyAt < 60_000) return false;
  // A plain one-row read: a header-only request to a missing table can come back without an error.
  const { error } = await createServiceClient().from("space_challenges").select("space").limit(1);
  readyAt = error ? -Date.now() : Date.now();
  return !error;
}

const ROLL = { owned: null, arg: "", taken: [] as string[] };

/**
 * Whether a space has a day or week of its own (rollDay / rollWeek below): Mario Kart, Smash, Mario Party, Pokémon.
 * The first wave of new spaces (2026-11-09) has none yet, so nothing is read or rolled for them.
 */
export function hasChallenges(s: GameSpace): boolean {
  return !!s.tt || s.id === "smash" || s.id === "mario-party" || s.id === "pokemon";
}

/** What a space's day is, rolled fresh (stored by the caller). Null for spaces without a daily of their own. */
function rollDay(s: GameSpace, day: string): DayChallenge | null {
  const game = getChatGame(s.primary);
  if (s.tt) {
    if (!game) return null;
    const tracks = ttTracks(s.tt);
    // The day's track walks the list by a hash of the day, so it doesn't follow cup order.
    const track = tracks[hashOf(`${s.id}:${day}`) % tracks.length];
    return { type: "combo", roll: game.roll(ROLL), tt: { game: s.tt, track: track.id } };
  }
  if (s.id === "smash" && game) return { type: "fighter", roll: game.roll(ROLL) };
  if (s.id === "mario-party" && game) return { type: "party", roll: partyRoll(s, game.roll(ROLL)) };
  return null;
}

function rollWeek(s: GameSpace, week: string): WeekChallenge | null {
  const game = getChatGame(s.primary);
  if (s.tt && game) {
    const tracks = ttTracks(s.tt);
    const picked: string[] = [];
    for (let i = 0; picked.length < 4 && i < 40; i++) {
      const t = tracks[hashOf(`${s.id}:${week}:cup:${i}`) % tracks.length];
      if (!picked.includes(t.id)) picked.push(t.id);
    }
    return { type: "cup", roll: game.roll(ROLL), game: s.tt, tracks: picked };
  }
  if (s.id === "smash" && game) {
    const rolls: ChatRoll[] = [];
    for (let i = 0; rolls.length < 5 && i < 20; i++) {
      const r = game.roll({ ...ROLL, taken: rolls.map((x) => x.slots[0]?.name ?? "") });
      if (!rolls.some((x) => x.slots[0]?.name === r.slots[0]?.name)) rolls.push(r);
    }
    return { type: "gauntlet", rolls };
  }
  if (s.id === "mario-party" && game) return { type: "party", roll: partyRoll(s, game.roll(ROLL)) };
  if (s.id === "pokemon") {
    const seed = `week${week.replace(/-/g, "")}`;
    const version = hashOf(week) % 2 ? "leafgreen" : "firered";
    const run = buildRun(seed, { version, catches: 1, twists: true, noFishing: false });
    // Each gym's segment is "Brock, Pewter City" / "Boulder Badge · Rock type"; the last is the Elite Four.
    const badges = run.segments.map((x) => /badge/i.test(x.sub)
      ? { leader: x.title.split(",")[0], badge: x.sub.split(" · ")[0] }
      : { leader: "The League", badge: "Elite Four and Champion" });
    return { type: "run", seed, version, badges };
  }
  return null;
}

/** Mario Party: the night's setup (board, turns, rules, Bonus Stars) with the character second, like Roll a party. */
function partyRoll(s: GameSpace, pick: ChatRoll): ChatRoll {
  const setup = CHAT_SETUPS[s.primary]?.roll({ arg: "", players: 4 });
  if (!setup || !setup.slots.length || !pick.slots.length) return pick;
  return { ...setup, slots: [setup.slots[0], ...pick.slots, ...setup.slots.slice(1)], text: `${setup.text} · ${pick.slots.map((x) => x.name).join(", ")}` };
}

function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** The space's challenge for a period: the stored one, else rolled now and stored (the first insert wins a race). */
async function challengeFor<T extends DayChallenge | WeekChallenge>(s: GameSpace, kind: ChallengeKind, period: string): Promise<T | null> {
  const db = createServiceClient();
  const read = async () => ((await db.from("space_challenges").select("challenge").eq("space", s.id).eq("kind", kind).eq("period", period).maybeSingle()).data as { challenge: T } | null)?.challenge ?? null;
  const have = await read();
  if (have) return have;
  const fresh = kind === "day" ? rollDay(s, period) : rollWeek(s, period);
  if (!fresh) return null;
  await db.from("space_challenges").upsert({ space: s.id, kind, period, challenge: fresh }, { onConflict: "space,kind,period", ignoreDuplicates: true });
  return (await read()) as T | null;
}

export const dayOf = (s: GameSpace) => challengeFor<DayChallenge>(s, "day", gsDay());
export const weekOf = (s: GameSpace) => challengeFor<WeekChallenge>(s, "week", gsWeekStart());

/**
 * A space's pick in one line for small places (the home's Your games cards, journeys picks 2026-11-06, 7A): the day's
 * pick ("Combo of the day", "Tanooki Mario"), or the week's when the space has no day (Pokémon: "Run of the week",
 * "Leaf Green"). Null before the tables exist or when nothing could be rolled.
 */
export async function pickLine(s: GameSpace): Promise<{ label: string; name: string; img: string | null } | null> {
  if (!hasChallenges(s) || !(await challengesReady())) return null;
  const day = await dayOf(s).catch(() => null);
  if (day) {
    const lead = day.roll.slots[0];
    return { label: dayWords(s, day).title, name: lead?.name ?? "", img: lead?.img ?? null };
  }
  const week = await weekOf(s).catch(() => null);
  if (!week) return null;
  const name = week.type === "run" ? (week.version === "leafgreen" ? "Leaf Green" : "Fire Red")
    : week.type === "gauntlet" ? `${week.rolls.length} fighters` : week.roll.slots[0]?.name ?? "";
  return { label: weekWords(s, week).title, name, img: null };
}

// ── Words ───────────────────────────────────────────────────────────────────

function dayWords(s: GameSpace, c: DayChallenge): { title: string; line: string; action: string; did: string } {
  const lead = c.roll.slots[0]?.name ?? "it";
  if (c.type === "combo") return { title: "Combo of the day", line: `Win a race with this combo today, any mode. Same combo for everyone; a new one at midnight.`, action: "I won a race with it", did: "won a race with it today" };
  if (c.type === "fighter") return { title: "Fighter of the day", line: `Win one match with ${lead} today, any mode, online or on the couch. Same fighter for everyone; a new one at midnight.`, action: `I won with ${lead}`, did: `won with ${lead} today` };
  return { title: "Party of the day", line: "Play tonight's party: this board, these rules, your character. Same party for everyone; a new one at midnight.", action: "We played it", did: "played it today" };
}

function weekWords(s: GameSpace, c: WeekChallenge): { title: string; line: string } {
  if (c.type === "cup") return { title: "Combo Cup", line: "This week's combo on four tracks. Post a time trial on each with it; the lowest total wins the cup." };
  if (c.type === "gauntlet") return { title: "The Gauntlet", line: "Win a match with all five by Sunday. Tick each one off as you go." };
  if (c.type === "party") {
    const board = c.roll.slots[0]?.name ?? "this week's board";
    const who = c.roll.slots[1]?.name ?? "this week's character";
    return { title: "Party challenge", line: `Win a game on ${board} as ${who} by Sunday.` };
  }
  return { title: "Run of the week", line: `The same ${c.version === "leafgreen" ? "Leaf Green" : "Fire Red"} run for everyone: its starter, its catches, its level caps. Tick off each badge, then the League.` };
}

function weekSteps(c: WeekChallenge): WeekStep[] {
  if (c.type === "gauntlet") return c.rolls.map((r) => ({ label: r.slots[0]?.name ?? "", img: r.slots[0]?.img ?? null, done: false }));
  if (c.type === "run") return c.badges.map((b) => ({ label: b.badge, img: null, done: false }));
  if (c.type === "party") return [{ label: "Won it", img: null, done: false }];
  return c.tracks.flatMap((id) => {
    const t = ttTrack(c.game, id);
    return t ? [{ label: t.name, img: t.image, done: false, href: trackPath(t, 150, { items: "shrooms" }) }] : [];
  });
}

// ── Check-ins ───────────────────────────────────────────────────────────────

type CheckinRow = { user_id: string; progress: number[] | null; done: boolean; period: string; created_at: string };

/** Days in a row with a daily check-in in this space, ending today (or yesterday, before today's). */
/** The days of this week (Monday to Sunday, Pacific) and which of them you checked in on in a space (the You tab). */
export async function weekCheckins(userId: string, spaceId: string): Promise<{ days: string[]; done: string[]; today: string }> {
  const start = gsWeekStart();
  const days = Array.from({ length: 7 }, (_, i) => gsAddDays(start, i));
  const { data } = await createServiceClient().from("space_checkins").select("period").eq("user_id", userId).eq("space", spaceId).eq("kind", "day").gte("period", start).lte("period", days[6]);
  return { days, done: ((data ?? []) as { period: string }[]).map((r) => r.period), today: gsDay() };
}

export async function streakOf(userId: string, spaceId: string): Promise<number> {
  const since = gsAddDays(gsDay(), -120);
  const { data } = await createServiceClient().from("space_checkins").select("period").eq("user_id", userId).eq("space", spaceId).eq("kind", "day").gte("period", since);
  const days = new Set(((data ?? []) as { period: string }[]).map((r) => r.period));
  let d = gsDay();
  if (!days.has(d)) d = gsAddDays(d, -1);
  let n = 0;
  while (days.has(d)) { n++; d = gsAddDays(d, -1); }
  return n;
}

/** Pays once per key into an account's wallet. Returns the tokens paid (0 if this key was already paid). */
export async function paySpace(userId: string, amount: number, key: string, meta: Record<string, unknown>): Promise<number> {
  if (amount <= 0) return 0;
  const wallet = (await ensureAccountWallet(userId))?.identityId;
  if (!wallet) return 0;
  const { error } = await createServiceClient().from("token_events").insert({
    identity_id: wallet, community_id: null, amount, type: "earn_space", meta: { source: "space", ...meta }, idempotency_key: `space:${key}`,
  });
  if (error) {
    if (error.code !== "23505") console.error("[spaces] token payout failed:", error);
    return 0;
  }
  return amount;
}

export interface CheckinResult { ok: boolean; error?: "not_ready" | "no_challenge" | "bad_step" | "already"; tokens: number; streak: number; done: boolean; progress: number[] }

/** A daily check-in: once a day per space, pays the day's tokens and, every `streakEvery` days in a row, a bonus. */
export async function checkInDay(userId: string, s: GameSpace): Promise<CheckinResult> {
  const none = { tokens: 0, streak: 0, done: false, progress: [] };
  if (!(await challengesReady())) return { ok: false, error: "not_ready", ...none };
  const day = gsDay();
  const c = await challengeFor<DayChallenge>(s, "day", day);
  if (!c) return { ok: false, error: "no_challenge", ...none };
  const db = createServiceClient();
  const { error } = await db.from("space_checkins").insert({ space: s.id, kind: "day", period: day, user_id: userId, done: true });
  if (error && error.code === "23505") return { ok: false, error: "already", ...none, streak: await streakOf(userId, s.id), done: true };
  if (error) throw error;
  const lv = await spaceLevers();
  let tokens = await paySpace(userId, lv.day, `day:${s.id}:${day}:${userId}`, { space: s.id, kind: "day", day });
  const streak = await streakOf(userId, s.id);
  if (streak > 0 && streak % lv.streakEvery === 0) tokens += await paySpace(userId, lv.streak, `streak:${s.id}:${day}:${userId}`, { space: s.id, kind: "streak", streak });
  return { ok: true, tokens, streak, done: true, progress: [] };
}

/** A weekly step (a fighter beaten, a badge earned, the party won). Finishing every step pays the week's tokens once.
 *  Steps can't be taken back. The Combo Cup's steps are time trial entries (spaceTt.ts), not check-ins. */
export async function checkInWeek(userId: string, s: GameSpace, step: number): Promise<CheckinResult> {
  const none = { tokens: 0, streak: 0, done: false, progress: [] };
  if (!(await challengesReady())) return { ok: false, error: "not_ready", ...none };
  const week = gsWeekStart();
  const c = await challengeFor<WeekChallenge>(s, "week", week);
  if (!c || c.type === "cup") return { ok: false, error: "no_challenge", ...none };
  const steps = weekSteps(c);
  if (!Number.isInteger(step) || step < 0 || step >= steps.length) return { ok: false, error: "bad_step", ...none };
  const db = createServiceClient();
  const { data: was } = await db.from("space_checkins").select("progress, done").eq("space", s.id).eq("kind", "week").eq("period", week).eq("user_id", userId).maybeSingle();
  const before = new Set(((was as { progress: number[] | null } | null)?.progress ?? []).filter((n) => Number.isInteger(n)));
  before.add(step);
  const progress = [...before].sort((a, b) => a - b);
  const done = progress.length >= steps.length;
  const { error } = await db.from("space_checkins").upsert({ space: s.id, kind: "week", period: week, user_id: userId, progress, done, updated_at: new Date().toISOString() }, { onConflict: "space,kind,period,user_id" });
  if (error) throw error;
  const lv = await spaceLevers();
  const tokens = done ? await paySpace(userId, lv.week, `week:${s.id}:${week}:${userId}`, { space: s.id, kind: "week", week }) : 0;
  return { ok: true, tokens, streak: 0, done, progress };
}

// ── The view ────────────────────────────────────────────────────────────────

async function facesOf(ids: string[]): Promise<ChallengeFace[]> {
  if (!ids.length) return [];
  const { data } = await createServiceClient().from("users").select("id, display_name, username, is_public, avatar_source, avatar_seed, avatar_options, twitch_avatar, discord_avatar").in("id", ids);
  type U = { id: string; display_name: string | null; username: string | null; is_public: boolean | null; avatar_source: string | null; avatar_seed: string | null; avatar_options: Record<string, unknown> | null; twitch_avatar: string | null; discord_avatar: string | null };
  const byId = new Map(((data ?? []) as U[]).filter((u) => u.is_public !== false && u.username).map((u) => [u.id, u]));
  return ids.flatMap((id) => {
    const u = byId.get(id);
    return u ? [{ id, name: u.display_name || u.username!, avatar: { id, avatar_source: u.avatar_source, avatar_seed: u.avatar_seed, avatar_options: u.avatar_options, twitch_avatar: u.twitch_avatar, discord_avatar: u.discord_avatar } }] : [];
  });
}

/** Everything the space's Today hero shows: the day, the week, the counts and the viewer's own progress. */
export async function challengeView(s: GameSpace, viewerId: string | null): Promise<ChallengeView> {
  const tokens = await spaceLevers().catch(() => DEFAULT_LEVERS);
  if (!hasChallenges(s) || !(await challengesReady())) return { ready: false, day: null, week: null, tokens };
  const today = gsDay();
  const week = gsWeekStart();
  const db = createServiceClient();
  const [dayC, weekC] = await Promise.all([challengeFor<DayChallenge>(s, "day", today), challengeFor<WeekChallenge>(s, "week", week)]);
  const [dayRows, weekRows] = await Promise.all([
    dayC ? db.from("space_checkins").select("user_id, created_at").eq("space", s.id).eq("kind", "day").eq("period", today).order("created_at", { ascending: false }).limit(500) : Promise.resolve({ data: [] }),
    weekC ? db.from("space_checkins").select("user_id, progress, done").eq("space", s.id).eq("kind", "week").eq("period", week).limit(2000) : Promise.resolve({ data: [] }),
  ]);
  const dRows = (dayRows.data ?? []) as Pick<CheckinRow, "user_id" | "created_at">[];
  const wRows = (weekRows.data ?? []) as Pick<CheckinRow, "user_id" | "progress" | "done">[];

  let day: DayView | null = null;
  if (dayC) {
    const w = dayWords(s, dayC);
    const faces = await facesOf(dRows.slice(0, 8).map((r) => r.user_id)).catch(() => []);
    day = {
      period: today, challenge: dayC, ...w, count: dRows.length, faces: faces.slice(0, 3),
      mine: !!viewerId && dRows.some((r) => r.user_id === viewerId),
      streak: viewerId ? await streakOf(viewerId, s.id).catch(() => 0) : 0,
    };
  }

  let wk: WeekView | null = null;
  if (weekC) {
    const w = weekWords(s, weekC);
    const mineRow = viewerId ? wRows.find((r) => r.user_id === viewerId) : undefined;
    const progress = (mineRow?.progress ?? []).filter((n) => Number.isInteger(n));
    const steps = weekSteps(weekC).map((st, i) => ({ ...st, done: progress.includes(i) }));
    const daysLeft = 7 - Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${week}T12:00:00Z`)) / 86_400_000);
    const link = weekC.type === "run"
      ? { href: `/randomizers/pokemon-firered-leafgreen?seed=${weekC.seed}&v=${weekC.version}`, label: "Open the run" }
      : weekC.type === "cup" ? { href: "#sp-cup", label: "Standings and this week's combo" } : null;
    wk = { period: week, challenge: weekC, ...w, steps, progress, done: !!mineRow?.done, count: wRows.filter((r) => r.done).length, daysLeft, link };
  }
  return { ready: true, day, week: wk, tokens };
}
