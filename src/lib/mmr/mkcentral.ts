import "server-only";

/**
 * MKCentral's public lounge API (https://lounge.mkcentral.com/swagger/v1/swagger.json).
 * It has no CORS headers, so every read goes through us. A player's details are
 * cached here for 90 seconds (the API itself says 180) and the division starts
 * for 6 hours, so an OBS card polling every 30 seconds doesn't lean on them.
 *
 * Finished seasons never change (lounge page picks, 2026-10-20), so a past
 * season's reads (`final: true`) are kept for good: in this instance's memory
 * and in Next's data cache (`cache: "force-cache"`, which pages without
 * `force-dynamic` honor), so each player's old season is read from MKCentral
 * about once.
 */

import { MMR_GAMES, MMR_GAME_IDS, stepsFrom, type DivisionStep, type MmrChange, type MmrGame } from "./rules";

const BASE = "https://lounge.mkcentral.com/api";
const DETAILS_TTL = 90_000;
const RANKS_TTL = 6 * 60 * 60_000;
/** How many finished-season reads one instance keeps (a busy MK World season 1 is ~100KB of changes). */
const FINAL_MAX = 200;

export interface LoungePlayer {
  playerId: number;
  name: string;
  country: string | null;
  game: MmrGame;
  season: number | null;
  mmr: number | null;
  maxMmr: number | null;
  division: string | null;
  worldRank: number | null;
  eventsPlayed: number;
  winRate: number | null;
  averageScore: number | null;
  /** Average score leaving out squad queue events. */
  noSqAverageScore: number | null;
  largestGain: number | null;
  largestGainTableId: number | null;
  /** The season's biggest loss as MKCentral reports it (often left out: the page works it out from the events). */
  largestLoss: number | null;
  largestLossTableId: number | null;
  winsLastTen: number | null;
  lossesLastTen: number | null;
  averageLastTen: number | null;
  /** Teammates' average score in this player's team events. */
  partnerAverage: number | null;
  countryName: string | null;
  /** Earlier names on the lounge, newest first. */
  nameHistory: string[];
  /** Newest first, the whole season. */
  changes: MmrChange[];
  registryLink: string | null;
}

type Cached<T> = { at: number; value: T };
const details = new Map<string, Cached<LoungePlayer | null>>();
/** Finished seasons, kept for good (oldest dropped past FINAL_MAX). */
const finalDetails = new Map<string, LoungePlayer | null>();

export class LoungeUnavailable extends Error {}

/** `permanent`: a finished season's read, kept in Next's data cache for good. */
async function getJson(path: string, permanent = false): Promise<unknown | null> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { accept: "application/json", "user-agent": "GameShuffle MMR card (gameshuffle.co)" },
    signal: AbortSignal.timeout(8000),
    ...(permanent ? { cache: "force-cache" as const } : { cache: "no-store" as const }),
  }).catch(() => null);
  if (!res) throw new LoungeUnavailable("no response");
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new LoungeUnavailable(`status ${res.status}`);
  // A page that isn't JSON (an outage page, a cut-off body) reads as the lounge being down, never as a crash.
  return res.json().catch(() => { throw new LoungeUnavailable("not json"); });
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** A /player/details answer as a LoungePlayer (exported for scripts/test-lounge-season.ts). */
export function toPlayer(raw: Record<string, unknown>, game: MmrGame): LoungePlayer | null {
  const playerId = num(raw.playerId);
  const name = str(raw.name);
  if (playerId == null || !name) return null;
  const rows = (Array.isArray(raw.mmrChanges) ? raw.mmrChanges : []) as Record<string, unknown>[];
  // A deleted table keeps its own row and gets a "TableDelete" row with the same id that undoes it:
  // the original stays on the chart (the number really moved) but no longer counts as an event.
  const deleted = new Set(rows.filter((c) => c.reason === "TableDelete").map((c) => num(c.changeId)).filter((v): v is number => v != null));
  const changes: MmrChange[] = rows
    .map((c) => {
      const reason = str(c.reason) ?? "Table";
      const id = num(c.changeId) ?? 0;
      return {
        // Placement rows have no id; they keep 0, which never matches a table or a newer change.
        id,
        mmr: num(c.newMmr) ?? 0,
        delta: num(c.mmrDelta) ?? 0,
        at: str(c.time) ?? new Date(0).toISOString(),
        reason: reason === "Table" && deleted.has(id) ? "TableDeleted" : reason,
        place: num(c.rank),
        score: num(c.score),
        tier: str(c.tier),
        teams: num(c.numTeams),
        players: num(c.numPlayers),
        partners: Array.isArray(c.partnerIds) ? (c.partnerIds as unknown[]).filter((v): v is number => typeof v === "number") : [],
        partnerScores: Array.isArray(c.partnerScores) ? (c.partnerScores as unknown[]).filter((v): v is number => typeof v === "number") : [],
      };
    })
    // The placement start stays (the season chart begins there); any other row without an id is dropped.
    .filter((c) => c.id > 0 || c.reason === "Placement")
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id - a.id);
  return {
    playerId,
    name,
    country: str(raw.countryCode),
    game,
    season: num(raw.season),
    mmr: num(raw.mmr),
    maxMmr: num(raw.maxMmr),
    division: str(raw.rank),
    worldRank: num(raw.overallRank),
    eventsPlayed: num(raw.eventsPlayed) ?? 0,
    winRate: num(raw.winRate),
    averageScore: num(raw.averageScore),
    noSqAverageScore: num(raw.noSQAverageScore),
    largestGain: num(raw.largestGain),
    largestGainTableId: num(raw.largestGainTableId),
    largestLoss: num(raw.largestLoss),
    largestLossTableId: num(raw.largestLossTableId),
    winsLastTen: num(raw.winsLastTen),
    lossesLastTen: num(raw.lossesLastTen),
    averageLastTen: num(raw.averageLastTen),
    partnerAverage: num(raw.partnerAverage),
    countryName: str(raw.countryName),
    nameHistory: [...new Set((Array.isArray(raw.nameHistory) ? raw.nameHistory : [])
      .map((h: Record<string, unknown>) => str(h?.name))
      .filter((n): n is string => !!n && n.toLowerCase() !== name.toLowerCase()))],
    changes,
    registryLink: str(raw.registryLink),
  };
}

/** A player's season in one game, by MKCentral id (stable through name changes) or name.
 *  `season` reads a past season; `final: true` says it's finished, so the read is kept for good
 *  (only pass it for a season before the current one). null = no such player in that game (or
 *  season); throws LoungeUnavailable when the API is down. */
export async function loungePlayer(who: { id?: number | null; name?: string | null }, game: MmrGame, opts: { fresh?: boolean; season?: number | null; final?: boolean } = {}): Promise<LoungePlayer | null> {
  const query = who.id ? `id=${who.id}` : who.name ? `name=${encodeURIComponent(who.name.trim())}` : null;
  if (!query || !MMR_GAMES[game]) return null;
  const season = opts.season != null && Number.isInteger(opts.season) && opts.season > 0 ? opts.season : null;
  const final = !!opts.final && season != null;
  const key = `${game}:${season ?? "now"}:${query.toLowerCase()}`;
  if (final && finalDetails.has(key)) return finalDetails.get(key) ?? null;
  const hit = details.get(key);
  if (!final && !opts.fresh && hit && Date.now() - hit.at < DETAILS_TTL) return hit.value;
  const raw = await getJson(`/player/details?${query}&game=${game}${season ? `&season=${season}` : ""}`, final);
  const value = raw && typeof raw === "object" ? toPlayer(raw as Record<string, unknown>, game) : null;
  if (final) {
    finalDetails.set(key, value);
    if (finalDetails.size > FINAL_MAX) finalDetails.delete(finalDetails.keys().next().value as string);
    return value;
  }
  details.set(key, { at: Date.now(), value });
  if (details.size > 2000) details.delete(details.keys().next().value as string);
  return value;
}

export interface LoungeStats {
  /** The season these numbers are for (null when MKCentral didn't answer and the fallback table is used). */
  season: number | null;
  steps: DivisionStep[];
  /** Players with an event this season (the sum of every division's count). */
  totalPlayers: number | null;
  /** Players per division, top division first. */
  divisions: { name: string; count: number }[];
}

const stats = new Map<string, Cached<LoungeStats>>();
const finalStats = new Map<string, LoungeStats>();

function toStats(raw: Record<string, unknown> | null, game: MmrGame): LoungeStats | null {
  const ranks = raw?.ranks as Record<string, number> | undefined;
  if (!raw || !ranks || !Object.keys(ranks).length) return null;
  const divisions = (Array.isArray(raw.divisionData) ? raw.divisionData : [])
    .map((d: Record<string, unknown>) => ({ name: str(d.tier) ?? "", count: num(d.count) ?? 0 }))
    .filter((d) => d.name);
  const total = num(raw.totalPlayers) ?? (divisions.length ? divisions.reduce((n, d) => n + d.count, 0) : null);
  return { season: num(raw.season), steps: stepsFrom(ranks, game), totalPlayers: total, divisions };
}

/** A season's division starts and player counts (the current season when `season` is left out).
 *  The current season is cached 6 hours; a finished one (`final`) for good. */
export async function loungeStats(game: MmrGame, opts: { season?: number | null; final?: boolean } = {}): Promise<LoungeStats> {
  const season = opts.season != null && Number.isInteger(opts.season) && opts.season > 0 ? opts.season : null;
  const final = !!opts.final && season != null;
  const key = `${game}:${season ?? "now"}`;
  if (final && finalStats.has(key)) return finalStats.get(key)!;
  const hit = stats.get(key);
  if (!final && hit && Date.now() - hit.at < RANKS_TTL) return hit.value;
  const fallback: LoungeStats = { season: null, steps: stepsFrom(null, game), totalPlayers: null, divisions: [] };
  let value: LoungeStats | null = null;
  try {
    value = toStats((await getJson(`/player/stats?game=${game}${season ? `&season=${season}` : ""}`, final)) as Record<string, unknown> | null, game);
  } catch {
    if (hit) return hit.value;
  }
  if (!value) {
    // The fallback is kept 10 minutes (never for good): MKCentral may answer next time.
    stats.set(key, { at: Date.now() - (RANKS_TTL - 10 * 60_000), value: fallback });
    return fallback;
  }
  if (final) finalStats.set(key, value);
  else stats.set(key, { at: Date.now(), value });
  return value;
}

/** Where each division starts this season, from the lounge's stats (falls back to the last known table). */
export async function divisionSteps(game: MmrGame): Promise<DivisionStep[]> {
  return (await loungeStats(game)).steps;
}

const registrations = new Map<string, Cached<MmrGame[] | null>>();

/** The lounge games a player is registered in (MK World covers both 12 and 24 players). Cached 6 hours.
 *  null when MKCentral doesn't say (no such player, or it's down). */
export async function loungeGames(name: string): Promise<MmrGame[] | null> {
  const key = name.trim().toLowerCase().slice(0, 40);
  if (!key) return null;
  const hit = registrations.get(key);
  if (hit && Date.now() - hit.at < RANKS_TTL) return hit.value;
  let value: MmrGame[] | null = null;
  try {
    const raw = (await getJson(`/player/allgames?name=${encodeURIComponent(name.trim().slice(0, 40))}`)) as { registrations?: unknown } | null;
    if (raw && Array.isArray(raw.registrations)) {
      const reg = new Set(raw.registrations.filter((r): r is string => typeof r === "string").map((r) => r.toLowerCase()));
      value = MMR_GAME_IDS.filter((g) => reg.has(g) || ((g === "mkworld12p" || g === "mkworld24p") && reg.has("mkworld")));
    }
  } catch { if (hit) return hit.value; }
  registrations.set(key, { at: Date.now(), value });
  if (registrations.size > 2000) registrations.delete(registrations.keys().next().value as string);
  return value;
}

// ── Short lookups for the lounge page and boards ─────────────────────────

export interface LoungeBasic { playerId: number; name: string; mmr: number | null; country: string | null }
// (The light read has no division; the room read works it out from the number.)

const basics = new Map<string, Cached<LoungeBasic | null>>();
const BASIC_TTL = 6 * 60 * 60_000;

/** A player's name, number and country by MKCentral id or Discord id (the lounge keeps each player's Discord account).
 *  Names are cached for 6 hours: they change rarely and partner lists ask for several at once. */
export async function loungeBasic(who: { id?: number | null; discordId?: string | null; name?: string | null }, game: MmrGame, opts: { fresh?: boolean } = {}): Promise<LoungeBasic | null> {
  const query = who.id ? `id=${who.id}`
    : who.discordId && /^\d{5,25}$/.test(who.discordId) ? `discordId=${who.discordId}`
      : who.name?.trim() ? `name=${encodeURIComponent(who.name.trim().slice(0, 40))}` : null;
  if (!query || !MMR_GAMES[game]) return null;
  const key = `${game}:${query}`;
  const hit = basics.get(key);
  if (!opts.fresh && hit && Date.now() - hit.at < BASIC_TTL) return hit.value;
  const raw = (await getJson(`/player?${query}&game=${game}`)) as Record<string, unknown> | null;
  const id = raw ? num(raw.id) : null, name = raw ? str(raw.name) : null;
  const value = raw && id != null && name ? { playerId: id, name, mmr: num(raw.mmr), country: str(raw.countryCode) } : null;
  basics.set(key, { at: Date.now(), value });
  if (basics.size > 4000) basics.delete(basics.keys().next().value as string);
  return value;
}

const counts = new Map<string, Cached<number | null>>();

/** How many players in a country are at or above an MMR (one leaderboard request: its total).
 *  A player's country rank is the count above them plus one. Cached 10 minutes; a finished
 *  season's count (`final`) for good. */
export async function countryCountAbove(game: MmrGame, country: string, minMmr: number, opts: { season?: number | null; final?: boolean } = {}): Promise<number | null> {
  if (!/^[A-Z]{2}$/.test(country)) return null;
  const season = opts.season != null && Number.isInteger(opts.season) && opts.season > 0 ? opts.season : null;
  const final = !!opts.final && season != null;
  const key = `${game}:${season ?? "now"}:${country}:${minMmr}`;
  const hit = counts.get(key);
  if (hit && (final || Date.now() - hit.at < 10 * 60_000)) return hit.value;
  let value: number | null = null;
  try {
    const raw = (await getJson(`/player/leaderboard?game=${game}&country=${country}&minMmr=${minMmr}&pageSize=1${season ? `&season=${season}` : ""}`, final)) as { totalPlayers?: number } | null;
    value = typeof raw?.totalPlayers === "number" ? raw.totalPlayers : null;
  } catch { value = null; }
  counts.set(key, { at: Date.now(), value });
  if (counts.size > 2000) counts.delete(counts.keys().next().value as string);
  return value;
}

// ── Tables ───────────────────────────────────────────────────────────────

export interface LoungeTableScore { playerId: number; name: string; score: number | null; prevMmr: number | null; newMmr: number | null; delta: number | null; multiplier: number | null; discordId: string | null }
export interface LoungeTable {
  id: number; game: MmrGame; season: number | null; createdOn: string | null; verifiedOn: string | null;
  tier: string | null; format: string | null; numTeams: number; numPlayers: number;
  teams: { rank: number; scores: LoungeTableScore[] }[];
}

function toTable(raw: Record<string, unknown>, game: MmrGame): LoungeTable | null {
  const id = num(raw.id);
  if (id == null) return null;
  const teams = (Array.isArray(raw.teams) ? raw.teams : []).map((t: Record<string, unknown>) => ({
    rank: num(t.rank) ?? 0,
    scores: (Array.isArray(t.scores) ? t.scores : []).map((s: Record<string, unknown>) => ({
      playerId: num(s.playerId) ?? 0, name: str(s.playerName) ?? "", score: num(s.score), prevMmr: num(s.prevMmr), newMmr: num(s.newMmr),
      delta: num(s.delta), multiplier: num(s.multiplier), discordId: str(s.playerDiscordId),
    })).filter((s) => s.playerId > 0),
  }));
  return {
    id, game, season: num(raw.season), createdOn: str(raw.createdOn), verifiedOn: str(raw.verifiedOn), tier: str(raw.tier), format: str(raw.format),
    numTeams: num(raw.numTeams) ?? teams.length, numPlayers: num(raw.numPlayers) ?? teams.reduce((n, t) => n + t.scores.length, 0), teams,
  };
}

/** Every table in a game created between two times (the lounge returns a week in one response). */
export async function loungeTables(game: MmrGame, fromIso: string, toIso: string): Promise<LoungeTable[]> {
  const raw = await getJson(`/table/list?game=${game}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`);
  return (Array.isArray(raw) ? raw : []).map((t) => toTable(t as Record<string, unknown>, game)).filter((t): t is LoungeTable => !!t);
}

const unverified = new Map<MmrGame, Cached<LoungeTable[]>>();
/** Tables submitted but not yet verified by staff (placements and ratings before, no changes yet). Cached a minute. */
export async function unverifiedTables(game: MmrGame): Promise<LoungeTable[]> {
  const hit = unverified.get(game);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  let value: LoungeTable[] = [];
  try {
    const raw = await getJson(`/table/unverified?game=${game}`);
    value = (Array.isArray(raw) ? raw : []).map((t) => toTable(t as Record<string, unknown>, game)).filter((t): t is LoungeTable => !!t);
  } catch { if (hit) return hit.value; }
  unverified.set(game, { at: Date.now(), value });
  return value;
}
