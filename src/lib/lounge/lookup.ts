/**
 * The lounge lookup (lookup picks, 2026-10-21, all as recommended): pure, client-safe rules for
 * the search as you type, friend codes, "Did you mean" on a name nobody has, the boards from
 * MKCentral's leaderboard and stats, where an MMR would land, and the player page's one sentence.
 * Server reads live in lookupServer.ts. Tests: npx tsx scripts/test-lounge-lookup.ts
 */

import { MMR_GAMES, MMR_GAME_IDS, standing, type DivisionStep, type MmrGame } from "@/lib/mmr/rules";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
export const fmtNum = (n: number) => Math.round(n).toLocaleString("en-US");

// ── Leaderboard rows ─────────────────────────────────────────────────────

/** One player in one game, from MKCentral's /player/leaderboard. */
export interface LeaderRow {
  id: number;
  name: string;
  country: string | null;
  game: MmrGame;
  mmr: number | null;
  maxMmr: number | null;
  /** The division by the number ("Platinum 2" in MK8DX). */
  division: string | null;
  /** World rank; null for a player with no event this season. */
  rank: number | null;
  events: number;
  winRate: number | null;
  wins10: number | null;
  losses10: number | null;
  /** MMR gained or lost over the last ten events. */
  gain10: number | null;
  /** Places moved since last week, as MKCentral counts them: negative = climbed. */
  weekChange: number | null;
}

export function toLeaderRow(raw: Record<string, unknown>, game: MmrGame): LeaderRow | null {
  const id = num(raw.id);
  const name = str(raw.name);
  if (id == null || !name) return null;
  const rank = (raw.mmrRank && typeof raw.mmrRank === "object" ? raw.mmrRank : null) as Record<string, unknown> | null;
  return {
    id,
    name,
    country: str(raw.countryCode),
    game,
    mmr: num(raw.mmr),
    maxMmr: num(raw.maxMmr),
    division: rank ? str(rank.name) ?? str(rank.division) : null,
    rank: num(raw.overallRank),
    events: num(raw.eventsPlayed) ?? 0,
    winRate: num(raw.winRate),
    wins10: num(raw.winsLastTen),
    losses10: num(raw.lossesLastTen),
    gain10: num(raw.gainLossLastTen),
    weekChange: num(raw.lastWeekRankChange),
  };
}

// ── Search as you type ───────────────────────────────────────────────────

/** "1234-5678-9012", "123456789012" or "SW-1234-5678-9012" as MKCentral wants it; null when it isn't one. */
export function parseFriendCode(text: string): string | null {
  const t = text.trim();
  if (!/^(?:sw[\s-]?)?[\d\s-]+$/i.test(t)) return null;
  const d = t.replace(/^sw/i, "").replace(/[\s-]/g, "");
  return /^\d{12}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8)}` : null;
}

export const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** One player across the lounge games, for the suggestion list and "Did you mean". */
export interface Suggestion {
  name: string;
  country: string | null;
  /** The game to open: their best MMR among the games they played this season. */
  primary: LeaderRow;
  /** Every game they played this season, in the site's game order. */
  games: MmrGame[];
  /** False when they have no event this season in any game. */
  played: boolean;
}

const better = (a: LeaderRow, b: LeaderRow) => (b.mmr ?? -1) - (a.mmr ?? -1) || MMR_GAME_IDS.indexOf(a.game) - MMR_GAME_IDS.indexOf(b.game);

/** Rows from several games joined by name (one entry per player). */
export function groupByName(rows: LeaderRow[]): Suggestion[] {
  const groups = new Map<string, LeaderRow[]>();
  for (const r of rows) {
    const k = normName(r.name);
    const list = groups.get(k) ?? [];
    // A game listed twice (two searches found the same row) counts once.
    if (!list.some((x) => x.game === r.game)) list.push(r);
    groups.set(k, list);
  }
  return [...groups.values()].map((list) => {
    const played = list.filter((r) => r.events > 0).sort(better);
    const primary = played[0] ?? [...list].sort(better)[0];
    return {
      name: primary.name,
      country: primary.country ?? list.find((r) => r.country)?.country ?? null,
      primary,
      games: MMR_GAME_IDS.filter((g) => played.some((r) => r.game === g)),
      played: played.length > 0,
    };
  });
}

const byStanding = (a: Suggestion, b: Suggestion) =>
  Number(b.played) - Number(a.played) || (b.primary.mmr ?? -1) - (a.primary.mmr ?? -1) || a.name.localeCompare(b.name);

/** The suggestion list: the exact name first when that player has played this season, then players
 *  with events this season by their best MMR, then everyone else (an exact name with no events too,
 *  so a half-typed name doesn't put an inactive player above the one being looked for). */
export function mergeSuggestions(rows: LeaderRow[], query: string, limit = 6): Suggestion[] {
  const q = normName(query);
  const lead = (s: Suggestion) => Number(s.played && normName(s.name) === q);
  return groupByName(rows)
    .sort((a, b) => lead(b) - lead(a) || byStanding(a, b))
    .slice(0, limit);
}

/** The words a suggestion row shows under the name. */
export function suggestionLine(s: Suggestion): string {
  const p = s.primary;
  if (!s.played) return "No events this season";
  return [p.division, p.mmr != null ? `${fmtNum(p.mmr)} MMR` : null, p.rank ? `#${fmtNum(p.rank)} in ${MMR_GAMES[p.game].short}` : null].filter(Boolean).join(" · ");
}

/** Where a suggestion opens. */
export const suggestionHref = (s: Pick<Suggestion, "name" | "primary">) =>
  `/lounge/${encodeURIComponent(s.name)}${s.primary.game === "mkworld12p" ? "" : `?game=${s.primary.game}`}`;

// ── Did you mean ─────────────────────────────────────────────────────────

/** Edits between two strings (insert, delete, change, or swap two neighbours). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** How many edits still count as "close" for a name this long. */
export const closeEnough = (length: number) => (length <= 3 ? 1 : length <= 5 ? 2 : length <= 9 ? 3 : 4);

/** What to search MKCentral for when a name isn't found: its first letters (3, or 4 for a longer
 *  name), the whole name, and for a long name its last 3 letters (a slip near the start). */
export function lookupQueries(typed: string): string[] {
  const t = typed.trim().slice(0, 40);
  if (t.length < 2) return [];
  const out = new Set<string>([t.slice(0, t.length >= 6 ? 4 : 3)]);
  if (t.length > 3) out.add(t);
  if (t.length >= 6) out.add(t.slice(-3));
  return [...out];
}

/** The closest names to what was typed, up to `limit`. A player with no event this season counts as
 *  one edit further away (someone looking a name up is usually after an active player), then
 *  ties go to standing. */
export function closestNames(typed: string, candidates: Suggestion[], limit = 5): (Suggestion & { distance: number })[] {
  const t = normName(typed);
  const max = closeEnough(t.length);
  const score = (s: Suggestion & { distance: number }) => s.distance + (s.played ? 0 : 1);
  return candidates
    .map((s) => ({ ...s, distance: editDistance(t, normName(s.name)) }))
    .filter((s) => s.distance <= max)
    .sort((a, b) => score(a) - score(b) || byStanding(a, b))
    .slice(0, limit);
}

// ── Boards ───────────────────────────────────────────────────────────────

export interface CountryRow { code: string; players: number; topSix: number; best: { name: string; mmr: number } | null }

/** Countries with at least `min` players, by their top six players' average MMR. */
export function countryBoard(data: unknown, min = 6, limit = 15): CountryRow[] {
  if (!data || typeof data !== "object") return [];
  return Object.entries(data as Record<string, unknown>)
    .map(([code, v]): CountryRow | null => {
      const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
      const players = num(o.playerTotal) ?? 0;
      const top = (Array.isArray(o.topSixPlayers) ? o.topSixPlayers : []) as Record<string, unknown>[];
      const topSix = num(o.topSixMmr);
      if (!/^[A-Z]{2}$/.test(code) || players < min || top.length < min || topSix == null) return null;
      const bestRaw = [...top].sort((a, b) => (num(b.mmr) ?? 0) - (num(a.mmr) ?? 0))[0];
      const best = bestRaw && str(bestRaw.name) ? { name: str(bestRaw.name)!, mmr: num(bestRaw.mmr) ?? 0 } : null;
      return { code, players, topSix: Math.round(topSix), best };
    })
    .filter((r): r is CountryRow => !!r)
    .sort((a, b) => b.topSix - a.topSix || b.players - a.players)
    .slice(0, limit);
}

/** Players who climbed since last week, biggest climb first (MKCentral counts a climb as a negative change). */
export const climbers = (rows: LeaderRow[], limit = 10) =>
  rows.filter((r) => (r.weekChange ?? 0) < 0).sort((a, b) => (a.weekChange ?? 0) - (b.weekChange ?? 0)).slice(0, limit);

/** The `skip` that puts a world rank in the middle of a page of five. */
export const nearSkip = (rank: number) => Math.max(0, rank - 3);

// ── Divisions and where a number lands ───────────────────────────────────

/** A share of the season's players as a short label: "31%", "4.2%", "0.4%", "under 0.1%". */
export function shareWord(count: number, total: number | null): string {
  if (!total || total < 1) return "";
  if (count <= 0) return "0%";
  const pct = (count / total) * 100;
  if (pct < 0.1) return "under 0.1%";
  if (pct < 10) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

export interface DivisionRow { name: string; at: number; count: number; share: string }

/** Every division, top first, with where it starts and how many players are in it this season. */
export function divisionTable(steps: DivisionStep[], counts: { name: string; count: number }[], total: number | null): DivisionRow[] {
  const by = new Map(counts.map((c) => [c.name, c.count]));
  return [...steps].sort((a, b) => b.at - a.at).map((s) => {
    const count = by.get(s.name) ?? 0;
    return { name: s.name, at: s.at, count, share: shareWord(count, total) };
  });
}

/** Players above a number when only division counts are known: the divisions above it in full,
 *  plus the part of its own division above it (players spread evenly through a division). */
export function estimateAbove(mmr: number, steps: DivisionStep[], counts: { name: string; count: number }[]): number {
  const asc = [...steps].sort((a, b) => a.at - b.at);
  if (!asc.length) return 0;
  const by = new Map(counts.map((c) => [c.name, c.count]));
  let i = 0;
  for (let k = 0; k < asc.length; k++) if (mmr >= asc[k].at) i = k;
  const cur = asc[i], next = asc[i + 1] ?? null;
  const higher = asc.slice(i + 1).reduce((n, s) => n + (by.get(s.name) ?? 0), 0);
  // The top division has no ceiling: give it the width of the one below.
  const width = next ? next.at - cur.at : i > 0 ? cur.at - asc[i - 1].at : 1000;
  const frac = Math.max(0, Math.min(1, 1 - (Math.max(mmr, cur.at) - cur.at) / Math.max(1, width)));
  return higher + Math.round((by.get(cur.name) ?? 0) * frac);
}

export interface Landing { mmr: number; division: string; rank: number | null; total: number | null; exact: boolean }

/** Where an MMR would land this season. `above` is the exact count of players above it when known. */
export function landing(mmr: number, steps: DivisionStep[], counts: { name: string; count: number }[], total: number | null, above?: number | null): Landing {
  const division = standing(mmr, steps).division;
  if (!total || total < 1) return { mmr, division, rank: null, total: null, exact: false };
  const exact = above != null && Number.isFinite(above);
  const n = exact ? above! : estimateAbove(mmr, steps, counts);
  return { mmr, division, rank: Math.max(1, Math.min(total, n + 1)), total, exact };
}

/** "9,000 is Platinum: about the top 5%, around #267 of 5,988 players this season." */
export function landingLine(l: Landing): string {
  const head = `${fmtNum(l.mmr)} is ${l.division}`;
  if (l.rank == null || !l.total) return `${head}.`;
  const pct = (l.rank / l.total) * 100;
  const where = pct < 1
    ? `about the top ${Math.max(0.1, Math.ceil(pct * 10) / 10).toFixed(1)}%`
    : pct <= 50 ? `about the top ${Math.ceil(pct)}%`
      : 100 - Math.ceil(pct) > 0 ? `higher than about ${100 - Math.ceil(pct)}% of players` : "at the bottom of the lounge";
  return `${head}: ${where}, around #${fmtNum(l.rank)} of ${fmtNum(l.total)} players this season.`;
}

// ── The player page's sentence ───────────────────────────────────────────

export interface SentenceFacts {
  name: string;
  mmr: number | null;
  worldRank: number | null;
  countryRank: number | null;
  country: string | null;
  events: number;
  winRate: number | null;
  /** Null for the current season; the season's number for a finished one. */
  finishedSeason: number | null;
}

/** One plain sentence under the name, with only the parts that are known:
 *  "Kevo is #3 in the world and #1 in Mexico with 15,672 MMR, and has won 74% of 198 events this season." */
export function playerSentence(f: SentenceFacts): string | null {
  const past = f.finishedSeason != null;
  if (past && f.events < 1) return null;
  const ranks = [f.worldRank ? `#${fmtNum(f.worldRank)} in the world` : null, f.countryRank && f.country ? `#${fmtNum(f.countryRank)} in ${f.country}` : null].filter(Boolean).join(" and ");
  const mmr = f.mmr != null ? `${fmtNum(f.mmr)} MMR` : null;
  const ev = `${fmtNum(f.events)} ${f.events === 1 ? "event" : "events"}`;
  const pct = f.winRate != null ? `${Math.round(f.winRate * 100)}%` : null;
  if (past) {
    const head = `${f.name} finished season ${f.finishedSeason}${ranks ? ` at ${ranks}` : ""}${mmr ? ` with ${mmr}` : ""}`;
    return `${head}, and ${pct ? `won ${pct} of ${ev}` : `played ${ev}`}.`;
  }
  const played = f.events > 0 ? (pct ? `has won ${pct} of ${ev} this season` : `has played ${ev} this season`) : "hasn't played an event this season";
  if (ranks) return `${f.name} is ${ranks}${mmr ? ` with ${mmr}` : ""}, and ${played}.`;
  if (mmr) return `${f.name} has ${mmr} and ${played}.`;
  return `${f.name} ${played}.`;
}
