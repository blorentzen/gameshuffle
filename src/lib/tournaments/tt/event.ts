/**
 * Time trial events: settings, saved state and what each person sees (picks 2026-11-05, all A). Client-safe.
 *
 * A tournament with format "time_trial" keeps its plan in `settings.tt` (the board everyone races, the tracks, the
 * scoring, the clip rule and the shape) and its running state in `tournaments.tt` (rounds with their windows,
 * groups, cut and run-offs), version-guarded like Swiss. Times are rows of their own (tt_event_times), so a full
 * field adding times at once never touches the tournament row. The rules are in rules.ts; storage in store.ts.
 *
 * Two shapes run now:
 *   - leaderboard: everyone, every track, one window; the standings are the result;
 *   - groups: rounds of groups of 2 to 12 with a cut, re-spread by seed every round, ending in a final of one
 *     group (groups of 2 with 1 moving on are 1v1 knockouts).
 */

import { matchClipRuleOf, type MatchClipRule } from "./matchProof";
import { ttCups, ttTrack, type TtClass, type TtGame } from "@/lib/timeTrials/tracks";
import type { TtItems, TtVehicle } from "@/lib/timeTrials/categories";
import { GROUP_MAX, GROUP_MIN, type ClipRule, type TtRoundPlan, type TtScoring } from "./rules";

export type TtShape = "leaderboard" | "groups";
export type TtTrackMode = "one" | "cup" | "list" | "rolled";

export interface TtEventSettings {
  game: TtGame;
  cc: TtClass;
  items: TtItems;
  vehicle: TtVehicle;
  trackMode: TtTrackMode;
  /** Track ids for the game (ttTrack). Rolled tracks are rolled when the event is made. */
  tracks: string[];
  /** Keep the tracks hidden from players until the event (or round 1) opens, so nobody practices ahead. */
  hideTracks: boolean;
  scoring: TtScoring;
  /** Who adds a clip before results are final: 0 nobody, N the top N on each track, -1 everyone. */
  clips: ClipRule;
  /**
   * Swiss and brackets decided by time trial: who adds a clip before a match counts (0 nobody, 1 the faster time on
   * each track, -1 both players). A decided match waits for those clips to be checked (matchProof.ts).
   */
  matchClips: MatchClipRule;
  shape: TtShape;
  /** Leaderboard: the window, in hours (0.5 to 672). Groups: each round's window, in hours. */
  hours: number;
  /** Groups: each round's size and how many move on (the last one is the final). */
  plan: TtRoundPlan[];
  /**
   * In person (the tournament's location is in person, shapes pick 7A): how many consoles. Groups are called to a
   * station and a runner there types the times in, with no screenshots.
   */
  stations: number;
}

export const WINDOW_PRESETS: { id: string; label: string; hours: number }[] = [
  { id: "hour", label: "Live hour", hours: 1 },
  { id: "weekend", label: "Weekend", hours: 48 },
  { id: "week", label: "One week", hours: 168 },
];
export const ROUND_PRESETS: { id: string; label: string; hours: number }[] = [
  { id: "hour", label: "1 hour", hours: 1 },
  { id: "evening", label: "3 hours", hours: 3 },
  { id: "day", label: "1 day", hours: 24 },
  { id: "two", label: "2 days", hours: 48 },
];
export const MIN_HOURS = 0.5;
export const MAX_HOURS = 24 * 28;
export const MAX_TRACKS = 16;
export const CLIP_CHOICES: { value: ClipRule; label: string }[] = [
  { value: 3, label: "Top three on each track" },
  { value: 1, label: "The fastest on each track" },
  { value: -1, label: "Everyone" },
  { value: 0, label: "Nobody (screenshots only)" },
];

export const TT_EVENT_MIN_PLAYERS = 2;
export const MAX_STATIONS = 32;
export const STATION_CHOICES = [1, 2, 3, 4, 6, 8];
/** An in-person round stays open this long; the organizer closes it once every group has run. */
export const VENUE_HOURS = 24;

export function defaultTtSettings(game: TtGame): TtEventSettings {
  return {
    game, cc: 150, items: "shrooms", vehicle: "any", trackMode: "cup", tracks: ttCups(game)[0]?.tracks.map((t) => t.id) ?? [], hideTracks: false,
    scoring: "total", clips: 3, matchClips: 0, shape: "leaderboard", hours: 168, plan: [{ size: 4, advance: 2 }, { size: 8, advance: 0 }], stations: 2,
  };
}

const num = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};

/** Settings read from `settings.tt`, every field checked; anything missing takes the default. */
export function ttSettingsOf(raw: unknown, game: TtGame): TtEventSettings {
  const d = defaultTtSettings(game);
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const plan = Array.isArray(r.plan)
    ? (r.plan as unknown[]).slice(0, 8).map((p) => {
        const o = (p ?? {}) as Record<string, unknown>;
        const size = Math.round(num(o.size, GROUP_MIN, GROUP_MAX, 4));
        return { size, advance: Math.round(num(o.advance, 0, size - 1, 0)) };
      })
    : d.plan;
  return {
    game,
    cc: game === "mk8dx" && Number(r.cc) === 200 ? 200 : 150,
    items: r.items === "none" ? "none" : "shrooms",
    vehicle: typeof r.vehicle === "string" ? (r.vehicle as TtVehicle) : "any",
    trackMode: r.trackMode === "one" || r.trackMode === "list" || r.trackMode === "rolled" ? r.trackMode : "cup",
    tracks: Array.isArray(r.tracks) ? [...new Set((r.tracks as unknown[]).filter((t): t is string => typeof t === "string" && !!ttTrack(game, t)))].slice(0, MAX_TRACKS) : [],
    hideTracks: r.hideTracks === true,
    scoring: r.scoring === "points" ? "points" : "total",
    clips: [0, 1, 3, -1].includes(Number(r.clips)) ? Number(r.clips) : d.clips,
    matchClips: matchClipRuleOf(r.matchClips),
    shape: r.shape === "groups" ? "groups" : "leaderboard",
    hours: num(r.hours, MIN_HOURS, MAX_HOURS, d.hours),
    plan: plan.length ? plan : d.plan,
    stations: Math.round(num(r.stations, 1, MAX_STATIONS, d.stations)),
  };
}

/** In person: the tournament's location is in person. Stations, runners and the TV board run the event then. */
export const isVenue = (tournamentSettings: unknown): boolean =>
  (tournamentSettings as { locationType?: unknown } | null)?.locationType === "in_person";

// ── Saved state (tournaments.tt) ─────────────────────────────────────────────────────────────────────

export interface TtRunoff {
  /** Group index in its round. */
  group: number;
  players: string[];
  spots: number;
  track: string;
  opensAt: string;
  closesAt: string;
  /** Who it sent through, once settled (by run-off times or the organizer's pick). */
  settled: string[] | null;
}

export interface TtRound {
  /** 0 = the leaderboard window; 1.. = group rounds. */
  n: number;
  tracks: string[];
  opensAt: string;
  closesAt: string;
  /** Closed early (or once the window passed and the organizer moved on). */
  closedAt: string | null;
  size: number;
  advance: number;
  final: boolean;
  /** Participant ids by group. The leaderboard keeps one empty list: everyone seated plays. */
  groups: string[][];
  /** A later close for one group (index → ISO time). */
  extended: Record<string, string>;
  runoffs: TtRunoff[];
  /** Who moves on, in seed order, once the cut is made. */
  through: string[] | null;
  /** In person: each group called to a station, and when its runner finished it. */
  calls?: TtCall[];
}

/** In person: a group called to a station. */
export interface TtCall { group: number; station: number; calledAt: string; doneAt: string | null }

export interface TtEventState {
  version: number;
  rounds: TtRound[];
  finishedAt: string | null;
  /** Final order of every player who ran (participant ids), written at Finish. */
  order: string[] | null;
  /** In person: the consoles, and the salt their runner links are signed with (new links = a new salt). */
  venue?: { stations: number; salt: string } | null;
}

// ── In person: calling groups to stations ────────────────────────────────────────────────────────────

/** The group running at a station now (called, not done), or null when it's free. */
export const atStation = (r: Pick<TtRound, "calls">, station: number): TtCall | null =>
  (r.calls ?? []).find((c) => c.station === station && !c.doneAt) ?? null;

/** Groups not called yet, in order. */
export const queuedGroups = (r: Pick<TtRound, "calls" | "groups">): number[] =>
  r.groups.map((_, i) => i).filter((i) => !(r.calls ?? []).some((c) => c.group === i));

/** Fills every free station with the next groups in the queue. Returns the calls added. */
export function fillStations(r: Pick<TtRound, "calls" | "groups" | "n">, stations: number, at: string): TtCall[] {
  if (r.n === 0) return [];
  const queue = queuedGroups(r);
  const added: TtCall[] = [];
  for (let s = 1; s <= stations && queue.length; s++) {
    if (atStation({ calls: [...(r.calls ?? []), ...added] }, s)) continue;
    added.push({ group: queue.shift()!, station: s, calledAt: at, doneAt: null });
  }
  return added;
}

/** One planned round's shape: its group size and cut, and whether it's the final (one group). */
export interface TtPlannedRound { round: number; players: number; groups: number; size: number; advance: number; through: number; final: boolean }

/**
 * Round `n` (1-based) of a plan for `players`: the plan's size and cut, unless one group is left or it's the plan's
 * last round, which is the final with everyone still in. The server opens rounds with this, and the settings and the
 * event page preview the same thing.
 */
export function planRound(plan: TtRoundPlan[], n: number, players: number): Omit<TtPlannedRound, "round" | "players" | "through"> {
  const p = plan[Math.min(n - 1, plan.length - 1)] ?? { size: players, advance: 0 };
  const size = Math.max(GROUP_MIN, Math.min(GROUP_MAX, p.size));
  const final = Math.ceil(players / size) <= 1 || n >= plan.length;
  if (final) return { groups: 1, size: Math.max(players, GROUP_MIN), advance: 0, final: true };
  return { groups: Math.ceil(players / size), size, advance: Math.max(1, Math.min(size - 1, p.advance)), final: false };
}

/** Every round a plan makes from a field, ending in the final. */
export function planRounds(field: number, plan: TtRoundPlan[]): TtPlannedRound[] {
  const out: TtPlannedRound[] = [];
  let players = field;
  for (let n = 1; n <= Math.max(1, plan.length) && players > 0; n++) {
    const r = planRound(plan, n, players);
    const through = r.final ? 1 : r.groups * r.advance;
    out.push({ round: n, players, ...r, through });
    if (r.final) break;
    players = through;
  }
  return out;
}

export function isTtState(v: unknown): v is TtEventState {
  return !!v && typeof v === "object" && Array.isArray((v as TtEventState).rounds) && typeof (v as TtEventState).version === "number";
}

export type TtPhase = "setup" | "open" | "closed" | "cut" | "finished";

/** Where the event is: before the start, a round open, a round closed (waiting for its cut), cut (waiting for the next round), finished. */
export function ttPhase(state: TtEventState | null, now = Date.now()): TtPhase {
  if (!state || !state.rounds.length) return "setup";
  if (state.finishedAt) return "finished";
  const r = state.rounds[state.rounds.length - 1];
  if (r.through) return "cut";
  return roundOpen(r, now) ? "open" : "closed";
}

/** The latest close time in a round (its own, or a group's extension). */
export function lastClose(r: TtRound): string {
  return Object.values(r.extended).reduce((a, b) => (b > a ? b : a), r.closesAt);
}
/** When a group's window closes. */
export function groupCloses(r: TtRound, group: number): string {
  return r.closedAt ?? r.extended[String(group)] ?? r.closesAt;
}
export function roundOpen(r: TtRound, now = Date.now()): boolean {
  if (r.closedAt || r.through) return false;
  return now >= Date.parse(r.opensAt) && now < Date.parse(lastClose(r));
}

export const groupLabel = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`);

export function roundLabel(r: Pick<TtRound, "n" | "final">, total: number): string {
  if (r.n === 0) return "Leaderboard";
  if (r.final) return "Final";
  if (total > 1 && r.n === total - 1) return "Semifinal round";
  return `Round ${r.n}`;
}

// ── The view (what the API sends) ────────────────────────────────────────────────────────────────────

export type TtProof = "none" | "waiting" | "checked" | "rejected";

export interface TtViewTime {
  id: string;
  track: string;
  ms: number;
  place: number | null;
  proof: TtProof;
  screenshot: string | null;
  video: string | null;
  needsClip: boolean;
  at: string;
  runoff: boolean;
}

export interface TtViewRow {
  participantId: string;
  name: string;
  you: boolean;
  place: number;
  tied: boolean;
  total: number | null;
  points: number;
  done: number;
  times: Record<string, number | null>;
  places: Record<string, number | null>;
}

export interface TtViewGroup {
  index: number;
  label: string;
  closesAt: string;
  rows: TtViewRow[];
  /** How many have a time on every track (or any time, on points). */
  inCount: number;
  /** Rows above this index move on (null for the final and the leaderboard). */
  cutAfter: number | null;
  yours: boolean;
}

export interface TtViewRound {
  n: number;
  label: string;
  tracks: string[];
  opensAt: string;
  closesAt: string;
  closedAt: string | null;
  open: boolean;
  size: number;
  advance: number;
  final: boolean;
  groups: TtViewGroup[];
  runoffs: (TtRunoff & { names: string[]; times: Record<string, number | null> })[];
  through: string[] | null;
}

export interface TtCheckItem {
  id: string;
  name: string;
  track: string;
  round: number;
  ms: number;
  place: number | null;
  proof: TtProof;
  screenshot: string | null;
  video: string | null;
  needsClip: boolean;
  at: string;
  source: "player" | "runner" | "staff";
  /** Matches (Swiss and brackets): the match it's in, e.g. "Semifinals, Sam vs Ana". */
  label?: string;
  /** Matches: the times have decided it, and it waits on this check. */
  held?: boolean;
}

/** The times to check in a Swiss event or bracket decided by time trial (organizers and verifiers). */
export interface TtMatchChecksView {
  game: TtGame;
  rule: MatchClipRule;
  checks: TtCheckItem[];
  /** Times holding a decided match (the ones to check first). */
  holding: number;
  staff: TtStaffRow[] | null;
  canManage: boolean;
}

export interface TtStaffRow { userId: string; name: string; username: string | null; role: "verifier" | "runner" }

/** In person: one console as the event page, the run screen and the TV board see it. */
export interface TtViewStation {
  n: number;
  /** The group running there now. */
  group: number | null;
  label: string | null;
  players: string[];
  calledAt: string | null;
  /** Organizers only: the runner link (anyone with it types times in at this station). */
  link?: string;
}

/** What a station's runner sees (/tournament/[id]/station/[n]): the group up there and its times, or anyone on a leaderboard. */
export interface TtStationView {
  title: string;
  n: number;
  stations: number;
  settings: TtEventSettings;
  round: { n: number; label: string; open: boolean } | null;
  tracks: string[];
  /** The group running at this station (groups), with each player's time per track. */
  group: { index: number; label: string; players: { id: string; name: string; times: Record<string, number | null> }[] } | null;
  /** The leaderboard: every checked-in player, so the runner picks who's at the console. */
  everyone: { id: string; name: string; times: Record<string, number | null> }[] | null;
  /** The next group in the queue, if any. */
  next: string | null;
  finished: boolean;
}

/** A time just added, for the TV board. */
export interface TtLatestTime { name: string; track: string; ms: number; at: string; place: number | null }

export interface TtEventView {
  settings: TtEventSettings;
  phase: TtPhase;
  /** Tracks, or null while they're hidden from this viewer. */
  tracks: string[] | null;
  players: number;
  rounds: TtViewRound[];
  current: number | null;
  /** The planned rounds for the whole event, from the field size (groups only). */
  planned: TtPlannedRound[];
  you: {
    participantId: string;
    canAdd: boolean;
    /** Why not, when they can't. */
    why: string | null;
    group: number | null;
    times: TtViewTime[];
    out: boolean;
    /** In person: the station your group is called to (up), or how many groups are ahead of yours. */
    station: { n: number | null; ahead: number; done: boolean } | null;
  } | null;
  /** Only for organizers and verifiers. */
  checks: TtCheckItem[] | null;
  waitingChecks: number;
  staff: TtStaffRow[] | null;
  canManage: boolean;
  canCheck: boolean;
  final: { participantId: string; name: string; place: number }[] | null;
  now: string;
  /** In person: the stations, the groups waiting, and the latest times (for the TV board). */
  venue: { stations: TtViewStation[]; queue: { index: number; label: string }[]; done: string[] } | null;
  latest: TtLatestTime[];
}
