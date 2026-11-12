import "server-only";

/**
 * What the war page shows (/wars/<slug>, walkthrough https://claude.ai/artifact/TGuceXNmWkKrh5BVpgJNBT): both
 * teams and the score, the lead after every race, the race list and the posted table. Places only, never the
 * Discord names behind taps: names reach the page only through a table the team posted themselves.
 *
 * Several teams (team sizes picks 2026-11-10): every team in the order they were named with its total and color,
 * the standings, and each race's points, places by team and winner. `us`/`them` stay your team and the rival
 * (the leader, or the team behind you when you lead).
 */

import { penaltyTeam, WAR_GAME_LABELS, warTrack, type WarGame, type WarSide } from "./rules";
import { formatLabel, placesOf, raceWinner, roomOf, swingFor, teamColor, teamScores } from "./format";
import { siteLogos } from "./logos";
import { warPagePath } from "./page";
import { parseTable, type TableModel } from "./table";
import { postedTableFor } from "./tables";
import { flagsFor } from "./flags";
import { warStanding, warTeams, type War, type WarStatus } from "./store";

export interface WarPageRace {
  n: number; code: string | null; track: string | null; spots: number[]; diff: number;
  /** The lead for `us` after this race (penalties given by then included). */
  lead: number;
  /** Every team's points this race, in the order they were named. */
  scores: number[];
  /** The team at each place (-1 for none); empty for a race carried over with only points. */
  owner: number[];
  /** The team that scored most (null on a tie at the top). */
  winner: number | null;
}
export interface WarPageTeam { tag: string; name: string; logo: string | null; total: number; won: number; /** Its color on the card and in the race list. */ color: string }

export interface WarPageView {
  id: string;
  path: string;
  status: WarStatus;
  game: WarGame;
  gameLabel: string;
  racesTotal: number;
  /** The day it started, in Pacific ("Oct 31, 2026"). */
  date: string;
  us: WarPageTeam;
  them: WarPageTeam;
  /** Every team in the order they were named (two for a two-team war). */
  teams: WarPageTeam[];
  /** Team numbers, highest total first. */
  order: number[];
  formatLabel: string;
  room: number;
  diff: number;
  played: number;
  left: number;
  decided: WarSide | null;
  need: { side: WarSide; avg: number } | null;
  /** The race after which the side ahead could no longer be caught, when that came before the last race. */
  decidedAt: number | null;
  races: WarPageRace[];
  penalties: { side: WarSide; tag: string; points: number; reason: string; team: number }[];
  table: TableModel | null;
  /** Each flag code in the table with a picture GameShuffle's pages may show. */
  flags: Record<string, string>;
}

/** The war as the page shows it (logos only where GameShuffle's own pages may show them). */
export async function warPageView(war: War): Promise<WarPageView> {
  const all = warTeams(war);
  const [safe, body] = await Promise.all([siteLogos(all.map((t) => t.logo)), postedTableFor(war.id).catch(() => null)]);
  const s = warStanding(war);
  const swing = swingFor(war.game, war.format);
  const room = roomOf(war.format);
  let sum = 0;
  let decidedAt: number | null = null;
  const races: WarPageRace[] = war.races.map((r, i) => {
    const scores = teamScores(r, war.game, war.format);
    const diff = (scores[0] ?? 0) - (scores[s.rival] ?? 0);
    sum += diff;
    // A penalty counts from the race before it was given (the last race takes every penalty).
    const next = war.races[i + 1];
    const pens = war.penalties.filter((p) => !next || p.at < next.at);
    const lead = sum - pens.filter((p) => penaltyTeam(p) === 0).reduce((a, p) => a + p.points, 0) + pens.filter((p) => penaltyTeam(p) === s.rival).reduce((a, p) => a + p.points, 0);
    const left = war.racesTotal - r.n;
    if (decidedAt == null && left > 0 && Math.abs(lead) > swing * left) decidedAt = r.n;
    const t = r.track ? warTrack(war.game, r.track) : null;
    const owner: number[] = [];
    const places = placesOf(r, war.format);
    if (places) {
      for (let k = 0; k < room; k++) owner.push(-1);
      places.forEach((list, team) => list.forEach((p) => { if (p >= 1 && p <= room) owner[p - 1] = team; }));
    }
    return { n: r.n, code: t ? t.code : null, track: t?.name ?? null, spots: r.spots, diff, lead, scores, owner, winner: raceWinner(r, war.game, war.format) };
  });
  const teams: WarPageTeam[] = all.map((t, i) => ({
    tag: t.tag, name: t.name || t.tag, logo: t.logo && safe.has(t.logo) ? t.logo : null, total: s.totals[i] ?? 0,
    // Two teams: a race won is a race with the better score; several: the race's top score.
    won: races.filter((r) => (war.format.teams === 2 ? (i === 0 ? r.diff > 0 : r.diff < 0) : r.winner === i)).length,
    color: teamColor(i),
  }));
  const team = (side: WarSide): WarPageTeam => teams[side === "us" ? 0 : s.rival];
  const table = body ? parseTable(body) : null;
  const codes = table ? table.teams.flatMap((t) => t.players.map((p) => p.flag).filter((f): f is string => !!f)) : [];
  const flags = codes.length ? await flagsFor(war.guildId, codes, { site: true }).catch(() => ({})) : {};
  return {
    id: war.id,
    path: warPagePath(war),
    status: war.status,
    game: war.game,
    gameLabel: WAR_GAME_LABELS[war.game],
    racesTotal: war.racesTotal,
    date: new Date(war.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }),
    us: team("us"),
    them: team("them"),
    teams,
    order: s.order,
    formatLabel: formatLabel(war.format),
    room,
    diff: s.diff,
    played: s.played,
    left: s.left,
    decided: s.decided,
    need: s.need,
    decidedAt,
    races,
    penalties: war.penalties.map((p) => ({ side: p.side, tag: all[penaltyTeam(p)]?.tag ?? war.them.tag, points: p.points, reason: p.reason, team: penaltyTeam(p) })),
    table,
    flags,
  };
}

/** "Kart Club vs Night Owls", or with more than three teams their tags. */
export const warPageTitle = (v: WarPageView) => (v.teams.length > 3 ? v.teams.map((t) => t.tag).join(" vs ") : v.teams.map((t) => t.name).join(" vs "));

/** One sentence for the header and the link preview. */
export function warSentence(v: WarPageView): string {
  if (v.teams.length > 2) {
    const [first, second] = v.order.map((i) => v.teams[i]);
    const tied = first.total === second.total;
    const level = `${first.name} and ${second.name} level on ${first.total}`;
    if (v.status === "done") {
      return tied ? `${first.name} and ${second.name} finished level on ${first.total} over ${v.played} races.` : `${first.name} won with ${first.total} over ${v.played} races, ${first.total - second.total} ahead of ${second.name}.`;
    }
    if (v.status === "ended") {
      if (!v.played) return "Ended before any races went in.";
      return `${tied ? level : `${first.name} led with ${first.total}`} when it ended after ${v.played} of ${v.racesTotal} races.`;
    }
    if (!v.played) return `${v.teams.length} teams, ${v.racesTotal} races to come.`;
    return `${tied ? level : `${first.name} ahead with ${first.total}`} after race ${v.played} of ${v.racesTotal}.`;
  }
  const a = v.us, b = v.them;
  const lead = v.diff > 0 ? a : b;
  const trail = v.diff > 0 ? b : a;
  if (v.status === "done") {
    if (v.diff === 0) return `${a.name} and ${b.name} drew ${a.total} to ${b.total} over ${v.played} races.`;
    return `${lead.name} beat ${trail.name} ${lead.total} to ${trail.total} over ${v.played} races.`;
  }
  if (v.status === "ended") {
    if (!v.played) return "Ended before any races went in.";
    if (v.diff === 0) return `Level at ${a.total} when it ended after ${v.played} of ${v.racesTotal} races.`;
    return `${lead.name} led ${lead.total} to ${trail.total} when it ended after ${v.played} of ${v.racesTotal} races.`;
  }
  if (!v.played) return `${v.racesTotal} races to come.`;
  if (v.diff === 0) return `Level at ${a.total} after race ${v.played} of ${v.racesTotal}.`;
  if (v.decided) return `${lead.name} ahead ${lead.total} to ${trail.total} with ${v.left} ${v.left === 1 ? "race" : "races"} left: they can't be caught.`;
  return `${lead.name} ahead ${lead.total} to ${trail.total} after race ${v.played} of ${v.racesTotal}.`;
}
