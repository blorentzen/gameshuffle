import "server-only";

/**
 * What the war page shows (/wars/<slug>, walkthrough https://claude.ai/artifact/TGuceXNmWkKrh5BVpgJNBT): both
 * teams and the score, the lead after every race, the race list and the posted table. Places only, never the
 * Discord names behind taps: names reach the page only through a table the team posted themselves.
 */

import { trackCode } from "@/lib/timeTrials/codes";
import { TT_GAMES } from "@/lib/timeTrials/tracks";
import { maxSwing, raceScore, standing, warTrack, type WarGame, type WarSide } from "./rules";
import { siteLogos } from "./logos";
import { warPagePath } from "./page";
import { parseTable, type TableModel } from "./table";
import { postedTableFor } from "./tables";
import { flagsFor } from "./flags";
import type { War, WarStatus } from "./store";

export interface WarPageRace { n: number; code: string | null; track: string | null; spots: number[]; diff: number; /** The lead for `us` after this race (penalties given by then included). */ lead: number }
export interface WarPageTeam { tag: string; name: string; logo: string | null; total: number; won: number }

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
  diff: number;
  played: number;
  left: number;
  decided: WarSide | null;
  need: { side: WarSide; avg: number } | null;
  /** The race after which the side ahead could no longer be caught, when that came before the last race. */
  decidedAt: number | null;
  races: WarPageRace[];
  penalties: { side: WarSide; tag: string; points: number; reason: string }[];
  table: TableModel | null;
  /** Each flag code in the table with a picture GameShuffle's pages may show. */
  flags: Record<string, string>;
}

/** The war as the page shows it (logos only where GameShuffle's own pages may show them). */
export async function warPageView(war: War): Promise<WarPageView> {
  const [safe, body] = await Promise.all([siteLogos([war.us.logo, war.them.logo]), postedTableFor(war.id).catch(() => null)]);
  const s = standing(war.races, war.penalties, war.racesTotal);
  const swing = maxSwing();
  let sum = 0;
  let decidedAt: number | null = null;
  const races: WarPageRace[] = war.races.map((r, i) => {
    const score = raceScore(r.spots);
    sum += score.diff;
    // A penalty counts from the race before it was given (the last race takes every penalty).
    const next = war.races[i + 1];
    const pens = war.penalties.filter((p) => !next || p.at < next.at);
    const lead = sum - pens.filter((p) => p.side === "us").reduce((a, p) => a + p.points, 0) + pens.filter((p) => p.side === "them").reduce((a, p) => a + p.points, 0);
    const left = war.racesTotal - r.n;
    if (decidedAt == null && left > 0 && Math.abs(lead) > swing * left) decidedAt = r.n;
    const t = r.track ? warTrack(war.game, r.track) : null;
    return { n: r.n, code: t ? trackCode(t) : null, track: t?.name ?? null, spots: r.spots, diff: score.diff, lead };
  });
  const won = (side: WarSide) => races.filter((r) => (side === "us" ? r.diff > 0 : r.diff < 0)).length;
  const team = (side: WarSide): WarPageTeam => {
    const t = war[side];
    return { tag: t.tag, name: t.name || t.tag, logo: t.logo && safe.has(t.logo) ? t.logo : null, total: s[side], won: won(side) };
  };
  const table = body ? parseTable(body) : null;
  const codes = table ? table.teams.flatMap((t) => t.players.map((p) => p.flag).filter((f): f is string => !!f)) : [];
  const flags = codes.length ? await flagsFor(war.guildId, codes, { site: true }).catch(() => ({})) : {};
  return {
    id: war.id,
    path: warPagePath(war),
    status: war.status,
    game: war.game,
    gameLabel: TT_GAMES[war.game].label,
    racesTotal: war.racesTotal,
    date: new Date(war.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }),
    us: team("us"),
    them: team("them"),
    diff: s.diff,
    played: s.played,
    left: s.left,
    decided: s.decided,
    need: s.need,
    decidedAt,
    races,
    penalties: war.penalties.map((p) => ({ side: p.side, tag: war[p.side].tag, points: p.points, reason: p.reason })),
    table,
    flags,
  };
}

/** One sentence for the header and the link preview. */
export function warSentence(v: WarPageView): string {
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
