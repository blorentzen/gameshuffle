/**
 * What a team series page, its overlay piece and its organizer screen read. Client-safe types and the
 * settings reader.
 */

import type { DraftStatus } from "./draft";
import type { NightState, PredictionKind, SeriesStatus, TeamRow } from "./rules";
import type { PlayerCard } from "./cards";
import { baseBank, cleanBank } from "./tracks";
import { DEFAULT_TARGET, DEFAULT_TURN_SECONDS } from "./draft";

export type { PlayerCard } from "./cards";

export interface SeriesSettings {
  /** The draft's bank (track ids) and how many tracks the pool ends with (umikofy's question 3). */
  bank: string[];
  target: number;
  turnSeconds: number;
  /** The Rules tab, as paragraphs (blank lines between). */
  rules: string;
  faq: { q: string; a: string }[];
  discordUrl: string | null;
  povGuideUrl: string | null;
  povDueAt: string | null;
  /** Over or under lines for each role's points predictions (null = worked out from the scoring table). */
  lines: { competitive: number | null; creator: number | null };
}

const httpsUrl = (v: unknown): string | null => (typeof v === "string" && /^https:\/\/\S{3,300}$/.test(v.trim()) ? v.trim() : null);
const lineOf = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) || n < 0 || n > 999 ? null : Math.round(n * 2) / 2;
};

export function readSettings(raw: unknown): SeriesSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const bank = cleanBank(r.bank);
  const lines = (r.lines ?? {}) as Record<string, unknown>;
  const faq = Array.isArray(r.faq)
    ? r.faq.flatMap((x) => {
        const f = (x ?? {}) as { q?: unknown; a?: unknown };
        const q = typeof f.q === "string" ? f.q.trim().slice(0, 200) : "";
        const a = typeof f.a === "string" ? f.a.trim().slice(0, 1500) : "";
        return q && a ? [{ q, a }] : [];
      }).slice(0, 30)
    : [];
  const due = typeof r.povDueAt === "string" && !Number.isNaN(Date.parse(r.povDueAt)) ? r.povDueAt : null;
  return {
    bank: bank.length >= 2 ? bank : baseBank(),
    target: Math.max(1, Math.round(Number(r.target) || DEFAULT_TARGET)),
    turnSeconds: Math.max(15, Math.min(600, Math.round(Number(r.turnSeconds) || DEFAULT_TURN_SECONDS))),
    rules: typeof r.rules === "string" ? r.rules.slice(0, 12000) : "",
    faq,
    discordUrl: httpsUrl(r.discordUrl),
    povGuideUrl: httpsUrl(r.povGuideUrl),
    povDueAt: due,
    lines: { competitive: lineOf(lines.competitive), creator: lineOf(lines.creator) },
  };
}

export interface SeriesTeamView {
  id: string;
  n: number;
  name: string;
  tag: string;
  color: string;
  /** Text color on the team color. */
  ink: string;
  look: string | null;
  players: PlayerCard[];
}

export interface DraftView {
  status: DraftStatus;
  bank: string[];
  target: number;
  turnSeconds: number;
  /** Round 1's order. */
  order: string[];
  /** Every turn's team. */
  turnTeams: string[];
  turns: { team: string; ban: string; protect: string | null; auto: boolean }[];
  onClock: string | null;
  /** When the turn on the clock runs out (ms since epoch). */
  deadline: number | null;
  pausedLeft: number | null;
  rolledAt: string | null;
}

export interface NightPlayerView { playerId: string | null; name: string; team: number | null; points: number }

export interface NightView {
  id: string;
  n: number;
  label: string;
  startsAt: string | null;
  counts: boolean;
  hostTeamId: string | null;
  tournamentId: string | null;
  state: NightState;
  racesDone: number;
  racesTotal: number;
  teams: TeamRow[];
  players: NightPlayerView[];
  draft: DraftView | null;
  /** The tracks races are on, once the draft is done. */
  pool: string[] | null;
}

export interface PredictionView {
  id: string;
  nightId: string;
  kind: PredictionKind;
  teamId: string | null;
  playerId: string | null;
  question: string;
  options: { key: string; label: string; pot: number }[];
  line: number | null;
  status: "open" | "locked" | "settled" | "cancelled";
  result: string[] | null;
  pot: number;
  picks: number;
}

export interface PlayView { id: string; title: string; url: string; playerId: string | null; nightId: string | null; votes: number }

export interface SeriesAwards {
  champion: string | null;
  /** Who the results point to before the organizers crown anyone (null on a tie or while a counted night is running). */
  leader: string | null;
  bestCreator: { playerId: string; points: number } | null;
  mostImproved: { teamId: string; climbed: number } | null;
  bestPlay: { playId: string; votes: number } | null;
}

export interface SeriesView {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  status: SeriesStatus;
  game: string;
  crownedAt: string | null;
  teams: SeriesTeamView[];
  nights: NightView[];
  /** The counted nights added up (only when more than one counts). */
  total: TeamRow[] | null;
  rules: string;
  faq: { q: string; a: string }[];
  discordUrl: string | null;
  predictions: PredictionView[];
  plays: PlayView[];
  awards: SeriesAwards;
  now: number;
}

/** The night that matters right now: one that's live, else one whose draft runs, else the next, else the last. */
export function currentNight(v: Pick<SeriesView, "nights">): NightView | null {
  return v.nights.find((n) => n.state === "live")
    ?? v.nights.find((n) => n.draft && (n.draft.status === "running" || n.draft.status === "paused"))
    ?? v.nights.find((n) => n.state === "upcoming")
    ?? v.nights[v.nights.length - 1]
    ?? null;
}

/** The public path of a series (the Summer Series has its own short address). */
export function seriesPath(slug: string): string {
  return slug === "summer-series" ? "/summer-series" : `/series/${slug}`;
}

/** What the GameShuffle overlay's series piece reads (/api/series/[slug]/overlay). */
export interface SeriesOverlayData {
  title: string;
  path: string;
  night: { label: string; state: "upcoming" | "live" | "done"; racesDone: number; racesTotal: number; startsAt: string | null } | null;
  teams: { id: string; tag: string; name: string; color: string; ink: string; points: number; place: number; last: number }[];
  draft: { status: string; onClock: string | null; deadline: number | null; pausedLeft: number | null; turn: number; total: number; last: string | null; open: number; pool: number } | null;
  champion: string | null;
  now: number;
}
