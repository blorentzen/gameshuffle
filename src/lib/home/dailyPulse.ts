import "server-only";

/**
 * Today's dailies, alive (dailies + explore picks 2026-11-05, 1A, 2A, 7A, 8A): for each daily, how many have played,
 * who's fastest (the Shuffle and the Dex by solve time, Fire Round by score, the Duel by the board), your place, and the
 * people you follow, by time, with the friends who haven't played yet (whom you can nudge). Only what the boards
 * already show: never an answer, and nobody who took themselves off the boards.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { boardView, describePlayers } from "@/lib/daily/boards";
import type { BoardGame } from "@/lib/daily/boardRules";
import { gsDay, gsDayStart } from "@/lib/time/gsClock";
import { formatTime } from "@/lib/originals/dailies";

export type PulseGame = BoardGame;
export const PULSE_GAMES: PulseGame[] = ["shuffle", "dex", "fire", "duel"];

export interface DayTop {
  name: string;
  avatar: string | null;
  profile: string | null;
  /** "0:41", "1,420", "6 turns". */
  value: string;
  you: boolean;
}

/** One daily's day so far, the same for everyone. */
export interface DayPulse {
  total: number;
  /** The Shuffle and the Dex: the fastest solve; Fire Round: the top score; the Duel: the board's leader. */
  top: DayTop | null;
}

export type Square = "miss" | "win" | "save";

/** Someone you follow (or you) on a daily today. */
export interface PersonDay {
  userId: string;
  name: string;
  avatar: string | null;
  profile: string | null;
  you: boolean;
  solved: boolean;
  guesses: number;
  seconds: number | null;
  score: number | null;
  /** Squares only (the Shuffle and the Dex), never the answer. */
  squares: Square[] | null;
  /** What the row says: "0:41", "in 4", "1,240", "6 turns", "Missed". */
  value: string;
  /** The fastest of your people today (the crown). */
  crown: boolean;
}

/** A friend (you follow each other) who hasn't played a daily yet today. */
export interface Waiting { userId: string; name: string; avatar: string | null }

export interface TodayLive {
  day: string;
  pulse: Record<PulseGame, DayPulse>;
  /** Your place on each daily today, once you've played it. */
  you: Record<PulseGame, { place: number; total: number } | null>;
  people: Record<PulseGame, PersonDay[]>;
  waiting: Record<PulseGame, Waiting[]>;
  /** How many people you follow (the board shows only when you follow someone). */
  following: number;
  /** Friends you've already nudged today (one a day each). */
  nudged: string[];
  /** Friends (you follow each other), for a night's faces and "Save seats for …" (context picks 1A). */
  friends: Waiting[];
}

type ScoreRow = { player: string; game: string; guesses: number; solved: boolean; seconds: number | null; score: number | null; points: number | null };

const PULSE_MS = 60_000;
const pulseCache = new Map<string, { at: number; pulse: Record<PulseGame, { total: number; top: (DayTop & { key: string | null }) | null }> }>();

const valueOf = (game: PulseGame, r: { solved: boolean; guesses: number; seconds: number | null; score: number | null }): string => {
  if (game === "fire") return (r.score ?? 0).toLocaleString("en-US");
  if (game === "duel") return r.solved ? `${r.guesses} ${r.guesses === 1 ? "turn" : "turns"}` : "Lost";
  if (!r.solved) return "Missed";
  return r.seconds != null ? formatTime(r.seconds) : `in ${r.guesses}`;
};

async function hiddenAmong(players: string[]): Promise<Set<string>> {
  if (!players.length) return new Set();
  const { data, error } = await createServiceClient().from("daily_board_hidden").select("player").in("player", players);
  return error ? new Set() : new Set(((data ?? []) as { player: string }[]).map((r) => r.player));
}

/** A top row with the player it belongs to (kept on the server; the page gets `you` instead). */
type KeyedTop = DayTop & { key: string | null };
type KeyedPulse = { total: number; top: KeyedTop | null };

/** The day so far for each daily: everyone's (kept a minute on this server). */
async function sharedPulse(day: string): Promise<Record<PulseGame, KeyedPulse>> {
  const hit = pulseCache.get(day);
  if (hit && Date.now() - hit.at < PULSE_MS) return hit.pulse;
  const pulse = await loadPulse(day);
  if (pulseCache.size > 4) pulseCache.clear();
  pulseCache.set(day, { at: Date.now(), pulse });
  return pulse;
}

/** The day so far, for a viewer (`me` = their board key, so the crown can say "you"). */
export async function dayPulse(day = gsDay(), me: string | null = null): Promise<Record<PulseGame, DayPulse>> {
  const shared = await sharedPulse(day);
  return Object.fromEntries(PULSE_GAMES.map((g) => {
    const p = shared[g];
    if (!p.top) return [g, { total: p.total, top: null }];
    const { key, ...top } = p.top;
    return [g, { total: p.total, top: { ...top, you: !!me && key === me } }];
  })) as Record<PulseGame, DayPulse>;
}

async function loadPulse(day: string): Promise<Record<PulseGame, KeyedPulse>> {
  const db = createServiceClient();
  const boards = await Promise.all(PULSE_GAMES.map((g) => boardView({ game: g, period: "day", day, limit: 1 }).catch(() => null)));
  // The fastest solve on the Shuffle and the Dex (the board ranks guesses first, so its leader isn't always fastest).
  const fastest = await Promise.all((["shuffle", "dex"] as const).map(async (g) => {
    const { data, error } = await db.from("daily_scores").select("player, guesses, solved, seconds, score").eq("game", g).eq("day", day)
      .eq("solved", true).not("seconds", "is", null).order("seconds", { ascending: true }).limit(8);
    if (error) return null;
    const rows = (data ?? []) as ScoreRow[];
    const hidden = await hiddenAmong(rows.map((r) => r.player));
    return rows.find((r) => !hidden.has(r.player)) ?? null;
  }));
  const fastKeys = fastest.filter((r): r is ScoreRow => !!r).map((r) => r.player);
  const names = fastKeys.length ? await describePlayers(fastKeys) : new Map();
  const out = {} as Record<PulseGame, KeyedPulse>;
  PULSE_GAMES.forEach((g, i) => {
    const b = boards[i];
    const total = b?.total ?? 0;
    let top: KeyedTop | null = null;
    if (g === "shuffle" || g === "dex") {
      const f = fastest[g === "shuffle" ? 0 : 1];
      const who = f ? names.get(f.player) : null;
      if (f && who) top = { name: who.name, avatar: who.avatar, profile: who.profile, value: formatTime(f.seconds ?? 0), you: false, key: f.player };
    } else if (b?.rows[0] && (g !== "fire" || (b.rows[0].score ?? 0) > 0)) {
      const r = b.rows[0];
      top = { name: r.name, avatar: r.avatar, profile: r.profile, value: valueOf(g, { solved: g === "duel" ? r.points > 0 : true, guesses: r.guesses, seconds: r.seconds, score: r.score }), you: false, key: null };
    }
    out[g] = { total, top };
  });
  return out;
}

/** Everything the room's Today needs for one account: the pulse, your places, your people and who's waiting. */
export async function todayLive(userId: string): Promise<TodayLive> {
  const db = createServiceClient();
  const day = gsDay();
  const me = `u:${userId}`;
  const [pulse, mine, follows, backs, nudges] = await Promise.all([
    dayPulse(day, me),
    Promise.all(PULSE_GAMES.map((g) => boardView({ game: g, period: "day", day, me, limit: 1 }).catch(() => null))),
    db.from("follows").select("followee_user_id").eq("follower_user_id", userId).limit(60).then((r) => ((r.data ?? []) as { followee_user_id: string }[]).map((f) => f.followee_user_id)),
    db.from("follows").select("follower_user_id").eq("followee_user_id", userId).limit(500).then((r) => new Set(((r.data ?? []) as { follower_user_id: string }[]).map((f) => f.follower_user_id))),
    db.from("notifications").select("user_id").eq("type", "daily_nudge").eq("actor_user_id", userId).gte("created_at", new Date(gsDayStart(day)).toISOString())
      .then((r) => (r.error ? [] : ((r.data ?? []) as { user_id: string }[]).map((n) => n.user_id))),
  ]);
  const you = Object.fromEntries(PULSE_GAMES.map((g, i) => {
    const v = mine[i]?.you;
    return [g, v ? { place: v.place, total: mine[i]!.total } : null];
  })) as TodayLive["you"];
  // Fire Round and the Duel crown the board's leader: that's you when you're first.
  for (const g of ["fire", "duel"] as const) if (pulse[g].top && you[g]?.place === 1) pulse[g].top!.you = true;

  const ids = [userId, ...follows];
  const keys = ids.map((id) => `u:${id}`);
  const [{ data: scores }, hidden, names] = await Promise.all([
    db.from("daily_scores").select("player, game, guesses, solved, seconds, score, points").eq("day", day).in("player", keys),
    hiddenAmong(keys.filter((k) => k !== me)),
    describePlayers(keys),
  ]);
  const people = Object.fromEntries(PULSE_GAMES.map((g) => [g, [] as PersonDay[]])) as Record<PulseGame, PersonDay[]>;
  const played = new Map<PulseGame, Set<string>>(PULSE_GAMES.map((g) => [g, new Set()]));
  for (const s of (scores ?? []) as ScoreRow[]) {
    const g = (s.game === "pokemon-dex" ? "dex" : s.game) as PulseGame;
    if (!PULSE_GAMES.includes(g) || hidden.has(s.player)) continue;
    const who = names.get(s.player);
    if (!who || (s.player !== me && !who.profile)) continue; // private profiles stay off your board
    const uid = s.player.slice(2);
    played.get(g)!.add(uid);
    const squares: Square[] | null = g === "shuffle" || g === "dex"
      ? Array.from({ length: Math.max(1, s.guesses) }, (_, i) => (i < s.guesses - 1 ? "miss" : !s.solved ? "miss" : s.points === 1 ? "save" : "win"))
      : null;
    people[g].push({
      userId: uid, name: s.player === me ? "You" : who.name, avatar: who.avatar, profile: who.profile, you: s.player === me,
      solved: s.solved, guesses: s.guesses, seconds: s.seconds, score: s.score, squares, value: valueOf(g, s), crown: false,
    });
  }
  for (const g of PULSE_GAMES) {
    const rows = people[g];
    rows.sort((a, b) => {
      if (g === "fire") return (b.score ?? 0) - (a.score ?? 0);
      if (a.solved !== b.solved) return a.solved ? -1 : 1;
      if (g === "duel" && a.guesses !== b.guesses) return a.guesses - b.guesses;
      return (a.seconds ?? 1e9) - (b.seconds ?? 1e9) || a.guesses - b.guesses;
    });
    // The crown: the fastest of your people (top score on Fire Round), once there are two of you.
    if (rows.length > 1 && (g === "fire" ? (rows[0].score ?? 0) > 0 : rows[0].solved)) rows[0].crown = true;
  }

  // Friends (you follow each other) who haven't played each daily yet: up to three, never someone hidden.
  const friends = follows.filter((id) => backs.has(id) && !hidden.has(`u:${id}`) && names.get(`u:${id}`)?.profile);
  const waiting = Object.fromEntries(PULSE_GAMES.map((g) => [g, friends.filter((id) => !played.get(g)!.has(id)).slice(0, 3).map((id) => {
    const w = names.get(`u:${id}`)!;
    return { userId: id, name: w.name, avatar: w.avatar };
  })])) as TodayLive["waiting"];

  const faces = friends.slice(0, 6).map((id) => { const w = names.get(`u:${id}`)!; return { userId: id, name: w.name, avatar: w.avatar }; });
  return { day, pulse, you, people, waiting, following: follows.length, nudged: [...new Set(nudges)], friends: faces };
}
