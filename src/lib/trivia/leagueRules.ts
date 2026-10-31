/**
 * Trivia leagues: the pure rules (client-safe, no I/O). Tests:
 * `npx tsx scripts/test-trivia-leagues.ts`.
 *
 * A league is a season of weekly trivia nights. Each night's final standings
 * turn into league points: by place (1st 10, 2nd 8, 3rd 6, 4th 5, then one
 * fewer down to 1, and everyone who plays gets at least 1) or by total score.
 * Tied teams share the place and its points. A team's best N nights count, so
 * one missed week doesn't sink a season.
 */

export type LeagueScoring = "place" | "total";

export interface LeagueSettings {
  weeks: number;
  teamSize: number;
  scoring: LeagueScoring;
  /** Best N nights count toward the standings (N <= weeks). */
  bestOf: number;
  /** The trivia template each week's night starts from. */
  template: string;
  /** Online, or at a venue (the series holds the address). */
  online: boolean;
}

export const LEAGUE_WEEKS = [4, 6, 8, 10, 12] as const;
export const LEAGUE_TEAM_SIZES = [2, 3, 4, 5, 6, 8, 10] as const;
export const MAX_LEAGUE_TEAMS = 40;

export const DEFAULT_LEAGUE: LeagueSettings = { weeks: 8, teamSize: 6, scoring: "place", bestOf: 6, template: "bar", online: false };

/** A sensible best-of for a season length: drop one week in 4-6, two in 8-10, three in 12. */
export function defaultBestOf(weeks: number): number {
  if (weeks <= 4) return weeks;
  if (weeks <= 6) return weeks - 1;
  if (weeks <= 10) return weeks - 2;
  return weeks - 3;
}

export function cleanSettings(raw: Partial<LeagueSettings> | null | undefined): LeagueSettings {
  const r = raw ?? {};
  const weeks = (LEAGUE_WEEKS as readonly number[]).includes(Number(r.weeks)) ? Number(r.weeks) : DEFAULT_LEAGUE.weeks;
  const teamSize = (LEAGUE_TEAM_SIZES as readonly number[]).includes(Number(r.teamSize)) ? Number(r.teamSize) : DEFAULT_LEAGUE.teamSize;
  const bestRaw = Math.round(Number(r.bestOf));
  const bestOf = Number.isFinite(bestRaw) && bestRaw >= 1 ? Math.min(weeks, bestRaw) : defaultBestOf(weeks);
  return {
    weeks,
    teamSize,
    scoring: r.scoring === "total" ? "total" : "place",
    bestOf,
    template: typeof r.template === "string" && r.template ? r.template : DEFAULT_LEAGUE.template,
    online: r.online === true,
  };
}

/** League points for a place (1-based). 1st 10, 2nd 8, 3rd 6, 4th 5, 5th 4 … never below 1. */
export function placePoints(place: number): number {
  if (place <= 1) return 10;
  if (place === 2) return 8;
  if (place === 3) return 6;
  return Math.max(1, 9 - place);
}

export interface NightTeam { teamId: string; score: number }
export interface NightResult { teamId: string; place: number; score: number; points: number }

/**
 * A night's places and league points. Ties share the place (1, 1, 3) and its
 * points. Total-score leagues use the night's score (never below 0).
 */
export function nightResults(teams: NightTeam[], scoring: LeagueScoring): NightResult[] {
  const sorted = [...teams].sort((a, b) => b.score - a.score || a.teamId.localeCompare(b.teamId));
  const out: NightResult[] = [];
  sorted.forEach((t, i) => {
    const place = i > 0 && sorted[i - 1].score === t.score ? out[i - 1].place : i + 1;
    out.push({ teamId: t.teamId, place, score: t.score, points: scoring === "total" ? Math.max(0, t.score) : placePoints(place) });
  });
  return out;
}

export interface ResultRow { teamId: string; week: number; place: number; score: number; points: number }
export interface StandingRow {
  teamId: string;
  rank: number;
  points: number;
  /** Every night's points, counted or not. */
  allPoints: number;
  nights: number;
  wins: number;
  bestPlace: number | null;
  /** Weeks whose points count (the best N). */
  counted: number[];
  /** The rank before the latest week, for ▲▼ (null when new this week). */
  previousRank: number | null;
}

function rankRows(rows: Omit<StandingRow, "rank" | "previousRank">[], names: Map<string, string>): (Omit<StandingRow, "rank" | "previousRank"> & { rank: number })[] {
  const sorted = [...rows].sort((a, b) =>
    b.points - a.points
    || b.wins - a.wins
    || (a.bestPlace ?? 999) - (b.bestPlace ?? 999)
    || b.nights - a.nights
    || (names.get(a.teamId) ?? a.teamId).localeCompare(names.get(b.teamId) ?? b.teamId),
  );
  const out: (Omit<StandingRow, "rank" | "previousRank"> & { rank: number })[] = [];
  sorted.forEach((r, i) => {
    const prev = out[i - 1];
    const tied = prev && prev.points === r.points && prev.wins === r.wins && prev.bestPlace === r.bestPlace && prev.nights === r.nights;
    out.push({ ...r, rank: tied ? prev.rank : i + 1 });
  });
  return out;
}

function tally(teamIds: string[], results: ResultRow[], bestOf: number) {
  return teamIds.map((teamId) => {
    const mine = results.filter((r) => r.teamId === teamId);
    const best = [...mine].sort((a, b) => b.points - a.points || a.week - b.week).slice(0, Math.max(1, bestOf));
    return {
      teamId,
      points: best.reduce((s, r) => s + r.points, 0),
      allPoints: mine.reduce((s, r) => s + r.points, 0),
      nights: mine.length,
      wins: mine.filter((r) => r.place === 1).length,
      bestPlace: mine.length ? Math.min(...mine.map((r) => r.place)) : null,
      counted: best.map((r) => r.week).sort((a, b) => a - b),
    };
  });
}

/**
 * The season's standings: best N nights, then wins, then best place, then
 * nights played (teams level on all four share the rank). Teams that haven't
 * played yet sit at the bottom with 0.
 * `previousRank` compares with the standings before the latest week played.
 */
export function standings(teamIds: string[], results: ResultRow[], bestOf: number, names: Map<string, string> = new Map()): StandingRow[] {
  const now = rankRows(tally(teamIds, results, bestOf), names);
  const latest = results.length ? Math.max(...results.map((r) => r.week)) : 0;
  const before = latest > 1 ? rankRows(tally(teamIds, results.filter((r) => r.week < latest), bestOf), names) : [];
  const beforeRank = new Map(before.filter((r) => r.nights > 0).map((r) => [r.teamId, r.rank]));
  return now.map((r) => ({ ...r, previousRank: beforeRank.get(r.teamId) ?? null }));
}

/** The next week to play: one past the highest week recorded or started, capped at the season. */
export function nextWeek(weeksPlayed: number[], weeks: number): number | null {
  const top = weeksPlayed.length ? Math.max(...weeksPlayed) : 0;
  return top >= weeks ? null : top + 1;
}

/** The champion once the last week is in: the top of the standings, or null on a tie at the top. */
export function champion(rows: StandingRow[]): string | null {
  const top = rows.filter((r) => r.rank === 1 && r.nights > 0);
  return top.length === 1 ? top[0].teamId : null;
}

/** "Week 3 of 8". */
export const weekLabel = (week: number, weeks: number) => `Week ${week} of ${weeks}`;

/** A URL slug from a league title: lowercase words joined by dashes, 3 to 64 characters. */
export function leagueSlug(title: string): string {
  const base = title
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56).replace(/-+$/g, "");
  return base.length >= 3 ? base : `trivia-league${base ? `-${base}` : ""}`;
}

/** How points work, in one plain line for the league page. */
export function scoringLine(s: LeagueSettings): string {
  const each = s.scoring === "total" ? "Each night, a team's score is its league points." : "Each night: 1st 10 points, 2nd 8, 3rd 6, 4th 5, then one fewer a place; everyone who plays gets at least 1.";
  const best = s.bestOf < s.weeks ? ` A team's best ${s.bestOf} of ${s.weeks} nights count.` : " Every night counts.";
  return each + best + " Level on points: more wins, then the best finish, then more nights played.";
}
