/**
 * Team series rules: a night's standings from its tournament races, the champions, awards, predictions and
 * how a prediction's pot is split. Pure and client-safe; the store (src/lib/series/store.ts) feeds it.
 */

import { computeStandings, DEFAULT_SCORING_TABLE, type TournamentRace } from "@/lib/tournaments/scoring";

export type SeriesStatus = "draft" | "announced" | "live" | "finished";
export type PlayerRole = "competitive" | "creator";
export type NightState = "upcoming" | "live" | "done";

export const ROLE_LABEL: Record<PlayerRole, string> = { competitive: "Competitive", creator: "Creator" };

export interface SeriesTeamLite { id: string; n: number; name: string; tag: string; color: string }

/** A night's participants, as the tournament holds them. */
export interface NightParticipant { id: string; display_name: string; team: number | null; user_id: string | null; status?: string | null }

export interface TeamRow {
  teamId: string;
  n: number;
  place: number;
  points: number;
  /** Points from the latest race. */
  last: number;
}

export interface PlayerRow { participantId: string; userId: string | null; name: string; team: number | null; points: number; races: number }

export interface NightResult {
  state: NightState;
  racesDone: number;
  racesTotal: number;
  teams: TeamRow[];
  players: PlayerRow[];
}

/** Places that share on equal points (1, 2, 2, 4), for rows already sorted best first. */
export function placesWithTies<T extends { points: number }>(rows: T[]): (T & { place: number })[] {
  let place = 0;
  let prev: number | null = null;
  return rows.map((r, i) => {
    if (prev === null || r.points !== prev) place = i + 1;
    prev = r.points;
    return { ...r, place };
  });
}

/**
 * A night's standings. Team numbers in the tournament are the series teams' `n`. A team with no races yet
 * still shows (0 points). The night is done once its race count is reached or the tournament is complete.
 */
export function nightResult(args: {
  teams: SeriesTeamLite[];
  participants: NightParticipant[];
  races: TournamentRace[];
  scoringTable?: number[] | null;
  raceCount?: number | null;
  tournamentStatus?: string | null;
}): NightResult {
  const table = args.scoringTable?.length ? args.scoringTable : DEFAULT_SCORING_TABLE;
  const racesTotal = Math.max(1, Number(args.raceCount) || 12);
  const sorted = [...args.races].sort((a, b) => a.race_number - b.race_number);
  const active = args.participants.filter((p) => p.status !== "dropped");
  const rows = computeStandings(active, sorted, table);
  const latest = sorted[sorted.length - 1] ?? null;
  const lastByParticipant = new Map<string, number>();
  if (latest) for (const [pid, pos] of Object.entries(latest.placements ?? {})) lastByParticipant.set(pid, table[pos - 1] ?? 0);

  const teamRows = args.teams.map((t) => {
    const members = rows.filter((r) => r.team === t.n);
    return {
      teamId: t.id, n: t.n,
      points: members.reduce((s, r) => s + r.points, 0),
      last: latest ? members.reduce((s, r) => s + (lastByParticipant.get(r.participantId) ?? 0), 0) : 0,
    };
  }).sort((a, b) => b.points - a.points || a.n - b.n);

  const userOf = new Map(active.map((p) => [p.id, p.user_id]));
  const players: PlayerRow[] = rows.map((r) => ({ participantId: r.participantId, userId: userOf.get(r.participantId) ?? null, name: r.name, team: r.team, points: r.points, races: r.racesPlayed }));

  const racesDone = sorted.length;
  const state: NightState = args.tournamentStatus === "complete" || racesDone >= racesTotal ? "done" : racesDone > 0 || args.tournamentStatus === "in_progress" ? "live" : "upcoming";
  return { state, racesDone, racesTotal, teams: placesWithTies(teamRows), players };
}

/** Points added up over the nights that count. Null when no counted night has a race yet. */
export function seriesTotal(teams: SeriesTeamLite[], nights: { counts: boolean; result: NightResult | null }[]): TeamRow[] | null {
  const counted = nights.filter((n) => n.counts && n.result && n.result.racesDone > 0);
  if (counted.length < 2) return null; // one counted night: its own standings are the total
  const rows = teams.map((t) => ({
    teamId: t.id, n: t.n,
    points: counted.reduce((s, n) => s + (n.result!.teams.find((r) => r.teamId === t.id)?.points ?? 0), 0),
    last: 0,
  })).sort((a, b) => b.points - a.points || a.n - b.n);
  return placesWithTies(rows);
}

/**
 * Who'd be champions from the results: first on the counted nights' points, once every counted night is
 * done. Null while any counted night isn't done, or when two teams share first (the organizers decide).
 */
export function championFromResults(teams: SeriesTeamLite[], nights: { counts: boolean; result: NightResult | null }[]): string | null {
  const counted = nights.filter((n) => n.counts);
  if (!counted.length || counted.some((n) => n.result?.state !== "done")) return null;
  const rows = counted.length === 1 ? counted[0].result!.teams : seriesTotal(teams, nights) ?? [];
  const first = rows.filter((r) => r.place === 1);
  return first.length === 1 ? first[0].teamId : null;
}

// ── Predictions ───────────────────────────────────────────────────────────────────────────────────

export type PredictionKind = "team_finish" | "player_points" | "night_winner";
export interface PredictionOption { key: string; label: string }

export const ORDINAL = (n: number): string => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export function finishOptions(teamCount: number): PredictionOption[] {
  return Array.from({ length: teamCount }, (_, i) => ({ key: String(i + 1), label: ORDINAL(i + 1) }));
}
export function overUnderOptions(line: number): PredictionOption[] {
  return [{ key: "over", label: `Over ${formatLine(line)}` }, { key: "under", label: `Under ${formatLine(line)}` }];
}
export function winnerOptions(teams: SeriesTeamLite[]): PredictionOption[] {
  return [...teams].sort((a, b) => a.n - b.n).map((t) => ({ key: `t${t.n}`, label: t.name }));
}
export function formatLine(line: number): string {
  return Number.isInteger(line) ? String(line) : line.toFixed(1);
}

/** A sensible over-or-under line: half a point under the even share of the night's points, so there's no tie. */
export function defaultLine(scoringTable: number[] | null | undefined, races = 12, players = 12): number {
  const table = scoringTable?.length ? scoringTable : DEFAULT_SCORING_TABLE;
  const perRace = table.slice(0, players).reduce((s, x) => s + x, 0) / players;
  return Math.round(perRace * races) - 0.5;
}

/** The winning option keys for a prediction, from the night's result. */
export function predictionWinners(
  p: { kind: PredictionKind; teamId: string | null; participantIds?: string[]; userId?: string | null; name?: string | null; line: number | null },
  result: NightResult,
  teams: SeriesTeamLite[],
): string[] {
  if (p.kind === "team_finish") {
    const row = result.teams.find((r) => r.teamId === p.teamId);
    return row ? [String(row.place)] : [];
  }
  if (p.kind === "night_winner") {
    return result.teams.filter((r) => r.place === 1).map((r) => `t${teams.find((t) => t.id === r.teamId)?.n ?? r.n}`);
  }
  // player_points
  const row = result.players.find((r) => (p.participantIds?.includes(r.participantId)) || (p.userId && r.userId === p.userId) || (!p.userId && p.name && r.name.toLowerCase() === p.name.toLowerCase()));
  const points = row?.points ?? 0;
  if (p.line == null) return [];
  return [points > p.line ? "over" : "under"];
}

export interface StakeLite { identityId: string; option: string; amount: number }

/**
 * Splits a prediction's pot: everyone who picked a winning option shares every token put in, by how much
 * they put in; the leftover from rounding goes to the biggest winner. Nobody right means everyone gets their
 * tokens back. Returns tokens paid per identity.
 */
export function splitPot(stakes: StakeLite[], winners: string[]): { payouts: Map<string, number>; refunded: boolean } {
  const pot = stakes.reduce((s, x) => s + x.amount, 0);
  const win = new Set(winners);
  const byWinner = new Map<string, number>();
  for (const s of stakes) if (win.has(s.option)) byWinner.set(s.identityId, (byWinner.get(s.identityId) ?? 0) + s.amount);
  const payouts = new Map<string, number>();
  if (!pot) return { payouts, refunded: false };
  if (!byWinner.size) {
    for (const s of stakes) payouts.set(s.identityId, (payouts.get(s.identityId) ?? 0) + s.amount);
    return { payouts, refunded: true };
  }
  const winStake = [...byWinner.values()].reduce((a, b) => a + b, 0);
  const sorted = [...byWinner.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  let paid = 0;
  for (const [id, stake] of sorted) { const share = Math.floor((pot * stake) / winStake); payouts.set(id, share); paid += share; }
  if (pot > paid) payouts.set(sorted[0][0], (payouts.get(sorted[0][0]) ?? 0) + (pot - paid));
  return { payouts, refunded: false };
}

// ── Awards ────────────────────────────────────────────────────────────────────────────────────────

export interface AwardPick { playerId?: string; teamId?: string; detail: string }

/** The creator with the most points over the counted nights. */
export function bestCreator(
  players: { id: string; role: PlayerRole; points: number }[],
): { playerId: string; points: number } | null {
  const creators = players.filter((p) => p.role === "creator" && p.points > 0).sort((a, b) => b.points - a.points);
  if (!creators.length || (creators[1] && creators[1].points === creators[0].points)) return null;
  return { playerId: creators[0].id, points: creators[0].points };
}

/** The team that climbed the most places from the first night to the last (both done). */
export function mostImproved(first: NightResult | null, last: NightResult | null): { teamId: string; climbed: number } | null {
  if (!first || !last || first.state !== "done" || last.state !== "done") return null;
  const climbs = last.teams.map((r) => ({ teamId: r.teamId, climbed: (first.teams.find((x) => x.teamId === r.teamId)?.place ?? r.place) - r.place }))
    .filter((c) => c.climbed > 0).sort((a, b) => b.climbed - a.climbed);
  if (!climbs.length || (climbs[1] && climbs[1].climbed === climbs[0].climbed)) return null;
  return climbs[0];
}

// ── Small helpers ─────────────────────────────────────────────────────────────────────────────────

/** Default team colors, each with text that passes AA on it (white or near-black, see inkOn). */
export const TEAM_COLORS = ["#2f6fe4", "#7c4ddb", "#d63a3a", "#c2307f", "#b98a06", "#2e9a52", "#0d7a7c", "#e0661b"];

/** White or near-black text on a team color, whichever reads better (WCAG luminance). */
export function inkOn(hex: string): "#ffffff" | "#141a2e" {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // #141a2e's luminance is about 0.0107.
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.0607 ? "#ffffff" : "#141a2e";
}

export function slugOk(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug);
}
