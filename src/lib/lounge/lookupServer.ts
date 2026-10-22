import "server-only";

/**
 * The lounge lookup's reads from MKCentral (lookup picks, 2026-10-21): the leaderboard (search,
 * world top 10, this week's climbers, the players around someone, how many are above a number),
 * players by friend code, and the season's full stats (players, events, median, divisions,
 * countries). MKCentral has no CORS headers, so all of it runs here. Every read is cached in this
 * instance's memory: searches for a minute, boards for five to ten, stats for ten.
 */

import { LoungeUnavailable, loungeStats, unverifiedTables } from "@/lib/mmr/mkcentral";
import { MMR_GAME_IDS, standing, stepsFrom, type DivisionStep, type MmrGame } from "@/lib/mmr/rules";
import {
  closestNames, countryBoard, groupByName, lookupQueries, mergeSuggestions, nearSkip, normName, toLeaderRow,
  type CountryRow, type LeaderRow, type Suggestion,
} from "./lookup";

const BASE = "https://lounge.mkcentral.com/api";
const MAX_ENTRIES = 1500;

type Cached<T> = { at: number; value: T };
const memory = new Map<string, Cached<unknown>>();

async function getJson(path: string): Promise<unknown | null> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { accept: "application/json", "user-agent": "GameShuffle lounge lookup (gameshuffle.co)" },
    signal: AbortSignal.timeout(6000),
    cache: "no-store",
  }).catch(() => null);
  if (!res) throw new LoungeUnavailable("no response");
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new LoungeUnavailable(`status ${res.status}`);
  return res.json().catch(() => { throw new LoungeUnavailable("not json"); });
}

/** A cached read: a fresh hit is returned, a stale one stands in when MKCentral is down. */
async function cached<T>(key: string, ttl: number, read: () => Promise<T>): Promise<T> {
  const hit = memory.get(key) as Cached<T> | undefined;
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  try {
    const value = await read();
    memory.set(key, { at: Date.now(), value });
    if (memory.size > MAX_ENTRIES) memory.delete(memory.keys().next().value as string);
    return value;
  } catch (e) {
    if (hit) return hit.value;
    throw e;
  }
}

export interface Board { total: number | null; season: number | null; rows: LeaderRow[] }

interface BoardQuery { search?: string; sortBy?: "Mmr" | "LastWeekRankChange"; skip?: number; pageSize?: number; minMmr?: number; minEvents?: number }

/** One page of a game's leaderboard. Throws LoungeUnavailable when MKCentral doesn't answer. */
export async function leaderboard(game: MmrGame, q: BoardQuery, ttl = 60_000): Promise<Board> {
  const p = new URLSearchParams({ game });
  if (q.search) p.set("search", q.search.trim().slice(0, 40));
  if (q.sortBy) p.set("sortBy", q.sortBy);
  if (q.skip) p.set("skip", String(Math.max(0, Math.floor(q.skip))));
  p.set("pageSize", String(Math.max(1, Math.min(100, q.pageSize ?? 20))));
  if (q.minMmr != null) p.set("minMmr", String(Math.floor(q.minMmr)));
  if (q.minEvents != null) p.set("minEventsPlayed", String(q.minEvents));
  const path = `/player/leaderboard?${p.toString()}`;
  return cached(path.toLowerCase(), ttl, async () => {
    const raw = (await getJson(path)) as { totalPlayers?: unknown; season?: unknown; data?: unknown } | null;
    const rows = (Array.isArray(raw?.data) ? raw!.data : []).map((r) => toLeaderRow(r as Record<string, unknown>, game)).filter((r): r is LeaderRow => !!r);
    return { total: typeof raw?.totalPlayers === "number" ? raw.totalPlayers : null, season: typeof raw?.season === "number" ? raw.season : null, rows };
  });
}

/** Search several games at once. Games that fail are left out; throws only when every one fails. */
async function searchRows(query: string, games: MmrGame[], pageSize: number, ttl: number): Promise<LeaderRow[]> {
  const pages = await Promise.allSettled(games.map((g) => leaderboard(g, { search: query, pageSize }, ttl)));
  if (pages.every((p) => p.status === "rejected")) throw new LoungeUnavailable("search failed");
  return pages.flatMap((p) => (p.status === "fulfilled" ? p.value.rows : []));
}

/** The suggestions for what someone is typing (two letters or more), across the games asked for. */
export async function suggestPlayers(query: string, games: MmrGame[] = MMR_GAME_IDS, limit = 6): Promise<Suggestion[]> {
  const q = query.trim().slice(0, 40);
  if (q.length < 2) return [];
  return mergeSuggestions(await searchRows(q, games, 20, 60_000), q, limit);
}

/** The player who has a friend code (it belongs to the account, so any game finds it), with their rows
 *  in the games asked for. Empty when nobody has it. */
export async function playersByFriendCode(fc: string, games: MmrGame[] = MMR_GAME_IDS): Promise<Suggestion[]> {
  const found = await cached(`fc:${fc}`, 10 * 60_000, async () => {
    // MK World first, MK8DX for a player who only plays that.
    for (const g of ["mkworld12p", "mk8dx"] as MmrGame[]) {
      const raw = (await getJson(`/player?fc=${encodeURIComponent(fc)}&game=${g}`)) as Record<string, unknown> | null;
      if (raw && typeof raw.name === "string" && typeof raw.id === "number") {
        return { id: raw.id, name: raw.name, country: typeof raw.countryCode === "string" ? raw.countryCode : null, mmr: typeof raw.mmr === "number" ? raw.mmr : null, game: g };
      }
    }
    return null;
  });
  if (!found) return [];
  const rows = (await searchRows(found.name, games, 20, 60_000).catch(() => [] as LeaderRow[])).filter((r) => normName(r.name) === normName(found.name));
  if (rows.length) return groupByName(rows);
  // Not on the leaderboard pages (or MKCentral's search didn't answer): what the friend code read gave.
  const steps = (await loungeStats(found.game).catch(() => null))?.steps ?? stepsFrom(null, found.game);
  return groupByName([{
    id: found.id, name: found.name, country: found.country, game: found.game, mmr: found.mmr, maxMmr: null,
    division: found.mmr != null ? standing(found.mmr, steps).division : null, rank: null, events: 0, winRate: null,
    wins10: null, losses10: null, gain10: null, weekChange: null,
  }]);
}

/** "Did you mean": the closest names to one nobody has, across all three games. */
export async function closestPlayers(typed: string, limit = 5): Promise<Suggestion[]> {
  const queries = lookupQueries(typed);
  if (!queries.length) return [];
  const rows = (await Promise.all(queries.map((q) => searchRows(q, MMR_GAME_IDS, q.length <= 4 ? 60 : 20, 10 * 60_000)))).flat();
  return closestNames(typed, groupByName(rows), limit);
}

// ── Boards ───────────────────────────────────────────────────────────────

/** The world's top ten in a game. */
export const worldTop = (game: MmrGame) => leaderboard(game, { pageSize: 10, sortBy: "Mmr" }, 5 * 60_000);

/** This week's biggest climbers in a game (MKCentral sorts the biggest climb first). */
export const weekClimbers = (game: MmrGame) => leaderboard(game, { pageSize: 10, sortBy: "LastWeekRankChange", minEvents: 1 }, 10 * 60_000);

/** The two players above and the two below a world rank. */
export const nearInWorld = (game: MmrGame, rank: number) => leaderboard(game, { pageSize: 5, skip: nearSkip(rank), sortBy: "Mmr" }, 5 * 60_000);

/** How many players with an event this season are above a number. */
export async function countAbove(game: MmrGame, mmr: number): Promise<number | null> {
  const page = await leaderboard(game, { pageSize: 1, minMmr: Math.floor(mmr) + 1, minEvents: 1 }, 10 * 60_000);
  return page.total;
}

// ── The season ───────────────────────────────────────────────────────────

export interface SeasonSummary {
  game: MmrGame;
  season: number | null;
  /** Players with an event this season. */
  players: number | null;
  events: number | null;
  medianMmr: number | null;
  steps: DivisionStep[];
  /** Players per division, top first (divisions nobody is in are left out by MKCentral). */
  divisions: { name: string; count: number }[];
  countries: CountryRow[];
  /** Countries with at least six players. */
  countryCount: number;
}

/** The season so far in a game. Cached ten minutes (the last good read stands in during an outage). */
export function seasonSummary(game: MmrGame): Promise<SeasonSummary> {
  return cached(`stats:${game}`, 10 * 60_000, async () => {
    const raw = (await getJson(`/player/stats?game=${game}`)) as Record<string, unknown> | null;
    if (!raw) throw new LoungeUnavailable("no stats");
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const divisions = (Array.isArray(raw.divisionData) ? raw.divisionData : [])
      .map((d: Record<string, unknown>) => ({ name: typeof d.tier === "string" ? d.tier : "", count: n(d.count) ?? 0 }))
      .filter((d) => d.name);
    const all = countryBoard(raw.countryData, 6, 500);
    return {
      game,
      season: n(raw.season),
      players: n(raw.totalPlayers) ?? (divisions.length ? divisions.reduce((s, d) => s + d.count, 0) : null),
      events: n(raw.totalMogis),
      medianMmr: n(raw.medianMmr),
      steps: stepsFrom(raw.ranks as Record<string, number> | undefined, game),
      divisions,
      countries: all.slice(0, 15),
      countryCount: all.length,
    };
  });
}

/** Tables submitted in a game that staff haven't verified yet (null when MKCentral doesn't say). */
export async function tablesWaiting(game: MmrGame): Promise<number | null> {
  try { return (await unverifiedTables(game)).length; } catch { return null; }
}
