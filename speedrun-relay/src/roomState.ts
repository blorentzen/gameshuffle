// A head-to-head room (speedrun races picks 2026-11-10): who's in, the countdown, and each entrant's lane as it runs.
// Generic on purpose: a lane is fed either by a runner's relay object (a speedrun timer) or by the site (a game the
// site runs itself, such as a two-player duel later). Standings are worked out by whoever shows them (the site's
// src/lib/versus/rules.ts); the room only keeps what happened. Pure: the Room object keeps it in storage and calls
// these with the time.

import type { LastKind, Phase } from "./state";

export type RoomStatus = "open" | "countdown" | "running" | "finished" | "cancelled";
export type LaneStatus = "waiting" | "running" | "done" | "out";
/** Why a lane stopped before the end: a reset forfeits (pick 4A), the runner left, the host took them out, the race
 *  ran out of time or was ended, the timer couldn't be started at Go, or (a game the site runs) the player lost it. */
export type OutReason = "reset" | "left" | "removed" | "timeout" | "ended" | "nostart" | "lost";
/** What a lane's times count: milliseconds (a timer) or turns (a turn-based game). */
export type Unit = "ms" | "turns";

/** A runner's timer as its relay object last saw it (sent on every change while the relay is in a room). */
export interface LaneLive {
  seq: number;
  /** LiveSplit One or the desktop add-on is connected. */
  connected: boolean;
  /** Which timer keeps the time: LiveSplit One, the desktop add-on, or the relay's own clock (the phone remote). */
  mode: "lso" | "addon" | "remote";
  /** GameShuffle may start this timer (the add-on's phone remote switch, or splits for the relay's own clock). */
  canStart: boolean;
  /** Phone remotes open on this run (a runner with no timer connected races from the phone). */
  remotes: number;
  phase: Phase;
  index: number | null;
  elapsedMs: number;
  /** Epoch ms of this state. */
  at: number;
  /** Splits the timer has. */
  count: number;
  /** This attempt's split times (cumulative ms); null = not reached or skipped. */
  splits: (number | null)[];
  last: { kind: LastKind; index: number | null } | null;
  attempt: number;
}

export interface Entrant {
  /** Stable for the room (the site uses the account id). */
  key: string;
  name: string;
  /** A color for this entrant's lane (#rrggbb), or null for the default order. */
  color: string | null;
  /** Who feeds the lane: the runner's relay object, or the site. */
  source: "relay" | "site";
  relayId: string | null;
  /** The runner's stream delay: watchers show this lane that much later (pick 5A). */
  delayMs: number;
  ready: boolean;
}

export interface Lane {
  status: LaneStatus;
  /** The attempt the race started on (relay lanes): a later attempt, or the timer back at 0, is a reset. */
  attempt: number | null;
  /** Checkpoints done (splits for a timer). */
  reached: number;
  /** Cumulative time (or turns) at each checkpoint; null = not reached or skipped. */
  times: (number | null)[];
  finalMs: number | null;
  /** Checkpoints done when it went out. */
  outAt: number | null;
  outReason: OutReason | null;
  /** Epoch ms it finished or went out. */
  endedAt: number | null;
  /** Site lanes: what breaks a tie on the final value (a duel's time when turns are level), and where the player is now
   *  (a duel's turn). Null for timers. */
  tieMs: number | null;
  current: number | null;
  live: LaneLive | null;
}

export interface RoomCore {
  roomId: string | null;
  kind: string;
  title: string;
  /** Checkpoint names (a race's splits, from the host's run); every lane must have this many. */
  checkpoints: string[];
  unit: Unit;
  entrants: Entrant[];
  status: RoomStatus;
  /** When the countdown ends (epoch ms). */
  startAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  lanes: Record<string, Lane>;
  /** +1 on every change. */
  seq: number;
  /** The site's config version: an older setup never overwrites a newer one. */
  configVersion: number;
}

export const MAX_ENTRANTS = 8;
export const MAX_CHECKPOINTS = 500;
/** A race that runs this long is ended (anyone still going is out, "timeout"). */
export const MAX_RACE_MS = 12 * 60 * 60_000;
const KEY_RE = /^[A-Za-z0-9-]{1,40}$/;
const RELAY_RE = /^[A-Za-z0-9]{16}$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

export function emptyRoom(): RoomCore {
  return {
    roomId: null, kind: "speedrun", title: "", checkpoints: [], unit: "ms", entrants: [], status: "open",
    startAt: null, startedAt: null, finishedAt: null, lanes: {}, seq: 0, configVersion: 0,
  };
}

export function emptyLane(): Lane {
  return { status: "waiting", attempt: null, reached: 0, times: [], finalMs: null, outAt: null, outReason: null, endedAt: null, tieMs: null, current: null, live: null };
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
};
const int = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;

/** The site's entrant list, checked (null when any entry is bad, so a broken call changes nothing). */
export function cleanEntrants(raw: unknown): Entrant[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_ENTRANTS) return null;
  const out: Entrant[] = [];
  const seen = new Set<string>();
  for (const e of raw) {
    if (!e || typeof e !== "object") return null;
    const r = e as Record<string, unknown>;
    const key = typeof r.key === "string" && KEY_RE.test(r.key) ? r.key : null;
    const name = str(r.name, 40);
    const source = r.source === "site" ? "site" : r.source === "relay" ? "relay" : null;
    const relayId = typeof r.relayId === "string" && RELAY_RE.test(r.relayId) ? r.relayId : null;
    const delayMs = int(r.delayMs, 0, 120_000) ?? 0;
    if (!key || !name || !source || seen.has(key) || (source === "relay" && !relayId)) return null;
    seen.add(key);
    out.push({
      key, name, source, relayId: source === "relay" ? relayId : null, delayMs,
      color: typeof r.color === "string" && COLOR_RE.test(r.color) ? r.color.toLowerCase() : null,
      ready: r.ready === true,
    });
  }
  return out;
}

export function cleanCheckpoints(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_CHECKPOINTS) return null;
  const out: string[] = [];
  for (const n of raw) {
    const s = str(n, 80);
    if (!s) return null;
    out.push(s);
  }
  return out;
}

/** What a relay forwards, checked (null when it isn't one). */
export function cleanLive(raw: unknown): LaneLive | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const phase = r.phase;
  if (phase !== "idle" && phase !== "running" && phase !== "paused" && phase !== "ended") return null;
  const mode = r.mode === "lso" || r.mode === "addon" || r.mode === "remote" ? r.mode : null;
  const seq = int(r.seq, 0, 1e12);
  const count = int(r.count, 0, MAX_CHECKPOINTS);
  const attempt = int(r.attempt, 0, 1e9);
  const at = int(r.at, 0, 1e15);
  const elapsedMs = typeof r.elapsedMs === "number" && Number.isFinite(r.elapsedMs) && r.elapsedMs >= 0 ? Math.round(r.elapsedMs) : null;
  if (!mode || seq == null || count == null || attempt == null || at == null || elapsedMs == null || !Array.isArray(r.splits)) return null;
  const splits = (r.splits as unknown[]).slice(0, MAX_CHECKPOINTS).map((t) => (typeof t === "number" && Number.isFinite(t) && t >= 0 ? Math.round(t) : null));
  const index = r.index == null ? null : int(r.index, 0, MAX_CHECKPOINTS);
  const lastRaw = r.last as { kind?: unknown; index?: unknown } | null | undefined;
  const last = lastRaw && typeof lastRaw.kind === "string"
    ? { kind: lastRaw.kind as LastKind, index: typeof lastRaw.index === "number" ? lastRaw.index : null }
    : null;
  const remotes = int(r.remotes, 0, 1000) ?? 0;
  return { seq, connected: r.connected === true, mode, canStart: r.canStart === true, remotes, phase, index, elapsedMs, at, count, splits, last, attempt };
}

const resolved = (l: Lane) => l.status === "done" || l.status === "out";

/** True once every lane in a running room has finished or gone out. */
export function allResolved(room: RoomCore): boolean {
  if (!room.entrants.length) return true;
  return room.entrants.every((e) => resolved(room.lanes[e.key] ?? emptyLane()));
}

/** A lane that stops before the end. */
export function outLane(lane: Lane, reason: OutReason, now: number): Lane {
  if (resolved(lane)) return lane;
  return { ...lane, status: "out", outAt: lane.reached, outReason: reason, endedAt: now };
}

/**
 * A relay's new state applied to its lane. Before the race and after it only the live view moves. During the race:
 * the first state that shows a run going fixes the race's attempt; a later attempt, or the timer back at 0, is a reset
 * and forfeits; an ended run is done (an Undo after the last split takes it back to running, as LiveSplit does).
 */
export function laneFromLive(lane: Lane, live: LaneLive, status: RoomStatus): Lane {
  if (lane.live && live.seq < lane.live.seq && live.attempt <= lane.live.attempt) return lane; // an older state
  const next: Lane = { ...lane, live };
  if (status !== "running" || lane.status === "out" || lane.status === "waiting") return next;
  if (lane.attempt == null) {
    if (live.phase === "idle") return next;
    next.attempt = live.attempt;
  } else if (live.attempt > lane.attempt || live.phase === "idle") {
    return outLane(next, "reset", live.at);
  }
  const n = live.count;
  const times = Array.from({ length: n }, (_, i) => live.splits[i] ?? null);
  if (live.phase === "ended") {
    const finalMs = times[n - 1] ?? live.elapsedMs;
    return { ...next, status: "done", times, reached: n, finalMs, endedAt: lane.status === "done" ? lane.endedAt : live.at };
  }
  const reached = Math.min(n, Math.max(0, live.index ?? 0));
  return { ...next, status: "running", times, reached, finalMs: null, endedAt: null };
}

/** A lane the site feeds (a game the site runs): its checkpoints, and done or out. */
export function laneFromSite(lane: Lane, raw: unknown, status: RoomStatus, now: number): Lane | null {
  if (!raw || typeof raw !== "object") return null;
  if (status !== "running" || lane.status === "waiting" || resolved(lane)) return lane;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.times) || r.times.length > MAX_CHECKPOINTS) return null;
  const times = (r.times as unknown[]).map((t) => (typeof t === "number" && Number.isFinite(t) && t >= 0 ? Math.round(t) : null));
  const reached = int(r.reached, 0, MAX_CHECKPOINTS) ?? times.filter((t) => t != null).length;
  const tieMs = int(r.tieMs, 0, 1e10) ?? lane.tieMs;
  const current = int(r.current, 0, 1e6) ?? lane.current;
  if (r.status === "out") {
    const reason: OutReason = r.reason === "left" ? "left" : r.reason === "timeout" ? "timeout" : r.reason === "lost" ? "lost" : "reset";
    return outLane({ ...lane, times, reached, tieMs, current }, reason, now);
  }
  if (r.status === "done") {
    const finalMs = typeof r.finalMs === "number" && Number.isFinite(r.finalMs) ? Math.round(r.finalMs) : times[times.length - 1] ?? null;
    return { ...lane, status: "done", times, reached, finalMs, tieMs, current, endedAt: now };
  }
  return { ...lane, times, reached, tieMs, current };
}

/** The race starts: every lane runs (relay lanes fix their attempt from the start command's answer). */
export function startedRoom(room: RoomCore, now: number): RoomCore {
  const lanes: Record<string, Lane> = {};
  for (const e of room.entrants) {
    const l = room.lanes[e.key] ?? emptyLane();
    lanes[e.key] = { ...emptyLane(), live: l.live, status: "running" };
  }
  return { ...room, status: "running", startedAt: now, lanes };
}

/** The race is over: anyone still going is out for `reason`. */
export function finishedRoom(room: RoomCore, now: number, reason: OutReason = "timeout"): RoomCore {
  const lanes: Record<string, Lane> = {};
  for (const e of room.entrants) lanes[e.key] = outLane(room.lanes[e.key] ?? emptyLane(), reason, now);
  return { ...room, status: "finished", finishedAt: now, lanes };
}

/** The highest checkpoint any lane has reached (for the site's "a quarter of the way in"). */
export function leaderReached(room: RoomCore): number {
  let max = 0;
  for (const e of room.entrants) max = Math.max(max, room.lanes[e.key]?.reached ?? 0);
  return max;
}

export interface RoomView {
  v: 1;
  seq: number;
  roomId: string | null;
  kind: string;
  title: string;
  checkpoints: string[];
  unit: Unit;
  status: RoomStatus;
  startAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  /** The room's clock when this view was made (epoch ms), so a page can line its countdown up with it. */
  now: number;
  entrants: (Entrant & { lane: Lane })[];
}

/** What watchers, the site and the webhook see. */
export function viewOf(room: RoomCore, now: number): RoomView {
  return {
    v: 1, seq: room.seq, roomId: room.roomId, kind: room.kind, title: room.title, checkpoints: room.checkpoints, unit: room.unit,
    status: room.status, startAt: room.startAt, startedAt: room.startedAt, finishedAt: room.finishedAt, now,
    entrants: room.entrants.map((e) => ({ ...e, lane: room.lanes[e.key] ?? emptyLane() })),
  };
}
