// Remote mode: the relay's own timer, for runners with no LiveSplit One (a console runner with a phone, a Mac without
// a timer). When no LiveSplit One is connected, /cmd runs here instead of being forwarded, over the run's segments
// (seeded by the site through /admin). The result is the same RelayState and the same webhooks LiveSplit One would
// give, so the overlay, chat and predictions can't tell the difference. Pure: the Durable Object keeps the clock in
// storage and calls `remoteStep` with the time.
//
// The clock is the run's own timer: time = base + (now - since) while it runs. A finish freezes what overlays see but
// leaves the clock running underneath, so an Undo after a finish carries on as LiveSplit does. A reset saves the
// attempt the way LiveSplit One does with saveAttempt: best segments from this run's golds, and the PB when it finished
// faster.

import {
  finished,
  isPb,
  paused,
  reset,
  resumed,
  skipped,
  splitted,
  started,
  undone,
  type Core,
  type HookEvent,
  type Segment,
  type Snap,
} from "./state";

export type RemoteCommand = "start" | "split" | "undo" | "skip" | "reset" | "pause" | "resume";

export interface RemoteClock {
  /** Run time banked before `since`. */
  base: number;
  /** When the clock last started counting (epoch ms); null while paused. */
  since: number | null;
}

export type RemoteResult =
  | { ok: true; core: Core; clock: RemoteClock | null; event: HookEvent | null }
  | { ok: false; error: string };

export const REMOTE_COMMANDS: readonly RemoteCommand[] = ["start", "split", "undo", "skip", "reset", "pause", "resume"];

export function clockMs(clock: RemoteClock, now: number): number {
  return Math.max(0, Math.round(clock.base + (clock.since == null ? 0 : now - clock.since)));
}

/** A run LiveSplit One was keeping when it went away: the phone takes over from where the overlay thinks it is. */
export function adoptClock(core: Core, now: number): RemoteClock | null {
  const s = core.state;
  if (s.phase === "idle") return null;
  if (s.phase === "paused") return { base: s.elapsedMs, since: null };
  if (s.phase === "ended") return { base: s.elapsedMs, since: now };
  return { base: s.elapsedMs + Math.max(0, now - s.at), since: now };
}

/** Segment lengths from a cumulative comparison (null where an end is missing). */
function lengths(cum: readonly (number | null)[]): (number | null)[] {
  return cum.map((t, i) => {
    if (t == null) return null;
    if (i === 0) return t;
    const prev = cum[i - 1];
    return prev == null ? null : t - prev;
  });
}

/** Cumulative times from segment lengths; null from the first missing length on. */
function cumulative(lens: readonly (number | null)[]): (number | null)[] {
  let total: number | null = 0;
  return lens.map((l) => {
    total = total == null || l == null ? null : total + l;
    return total;
  });
}

/**
 * The run's segments after an attempt is saved: each segment this run timed (both ends reached) that beat the best
 * becomes the best; a finish faster than the PB (or the first finish) becomes the PB.
 */
export function savedSegments(segments: readonly Segment[], splits: readonly (number | null)[], finishedRun: boolean): Segment[] {
  const n = segments.length;
  const bestLens = lengths(segments.map((s) => s.bestMs));
  const runLens = lengths(Array.from({ length: n }, (_, i) => splits[i] ?? null));
  const nextBest = bestLens.map((b, i) => {
    const r = runLens[i];
    if (r == null || r < 0) return b;
    return b == null || r < b ? r : b;
  });
  const bestCum = cumulative(nextBest);
  const finalMs = n ? splits[n - 1] ?? null : null;
  const newPb = finishedRun && finalMs != null && isPb(segments, finalMs);
  return segments.map((s, i) => ({
    name: s.name,
    pbMs: newPb ? splits[i] ?? null : s.pbMs,
    bestMs: bestCum[i] ?? null,
  }));
}

/** Split times for the indexes reached so far (0 .. reached-1). */
function reachedTimes(splits: readonly (number | null)[], reached: number): (number | null)[] {
  return Array.from({ length: Math.max(0, reached) }, (_, i) => splits[i] ?? null);
}

/** One phone-remote command against the relay's own timer. */
export function remoteStep(core: Core, clockIn: RemoteClock | null, cmd: RemoteCommand, now: number): RemoteResult {
  const s = core.state;
  const n = s.segments.length;
  const clock = clockIn ?? adoptClock(core, now);
  const t = clock ? clockMs(clock, now) : 0;

  switch (cmd) {
    case "start": {
      if (s.phase !== "idle") return { ok: false, error: s.phase === "ended" ? "run_finished" : "run_already_in_progress" };
      if (!n) return { ok: false, error: "no_splits" };
      const snap: Snap = { phase: "running", index: 0, timeMs: 0 };
      return { ok: true, core: started(core, snap, null), clock: { base: 0, since: now }, event: "start" };
    }
    case "split": {
      if (s.phase === "idle") return { ok: false, error: "no_run" };
      if (s.phase === "ended") return { ok: false, error: "run_finished" };
      if (s.phase === "paused") return { ok: false, error: "timer_paused" };
      const i = Math.min(Math.max(s.index ?? 0, 0), n - 1);
      if (i >= n - 1) {
        const snap: Snap = { phase: "ended", index: null, timeMs: t };
        return { ok: true, core: finished(core, snap, new Map([[i, t]])), clock, event: "finish" };
      }
      const snap: Snap = { phase: "running", index: i + 1, timeMs: t };
      return { ok: true, core: splitted(core, snap, new Map([[i, t]])), clock, event: "split" };
    }
    case "skip": {
      if (s.phase === "idle") return { ok: false, error: "no_run" };
      if (s.phase === "ended") return { ok: false, error: "run_finished" };
      const i = Math.min(Math.max(s.index ?? 0, 0), n - 1);
      if (i >= n - 1) return { ok: false, error: "cant_skip_last_split" };
      const times = reachedTimes(s.splits, i);
      times.push(null);
      const snap: Snap = { phase: s.phase, index: i + 1, timeMs: t };
      return { ok: true, core: skipped(core, snap, times), clock, event: "skip" };
    }
    case "undo": {
      if (s.phase === "idle") return { ok: false, error: "no_run" };
      const reached = s.phase === "ended" ? n : Math.min(Math.max(s.index ?? 0, 0), n);
      if (reached <= 0) return { ok: false, error: "cant_undo_first_split" };
      const back = reached - 1;
      // After a finish the clock never stopped, so the run carries on from now, as in LiveSplit.
      const phase = s.phase === "ended" ? "running" : s.phase;
      const snap: Snap = { phase, index: back, timeMs: t };
      return { ok: true, core: undone(core, snap, reachedTimes(s.splits, back)), clock, event: "undo" };
    }
    case "reset": {
      if (s.phase === "idle") return { ok: false, error: "no_run" };
      const saved = savedSegments(s.segments, s.splits, s.phase === "ended");
      const idle: Snap = { phase: "idle", index: null, timeMs: 0 };
      return { ok: true, core: reset(core, idle, saved), clock: null, event: "reset" };
    }
    case "pause": {
      if (s.phase === "idle") return { ok: false, error: "no_run" };
      if (s.phase === "ended") return { ok: false, error: "run_finished" };
      if (s.phase === "paused") return { ok: false, error: "already_paused" };
      const snap: Snap = { phase: "paused", index: s.index, timeMs: t };
      return { ok: true, core: paused(core, snap), clock: { base: t, since: null }, event: null };
    }
    case "resume": {
      if (s.phase === "idle") return { ok: false, error: "no_run" };
      if (s.phase !== "paused") return { ok: false, error: "not_paused" };
      const snap: Snap = { phase: "running", index: s.index, timeMs: t };
      return { ok: true, core: resumed(core, snap), clock: { base: t, since: now }, event: null };
    }
  }
}

/** Segments sent by the site, cleaned (names only are required; 500 at most). */
export function cleanSegments(input: unknown): Segment[] | null {
  if (!Array.isArray(input) || input.length > 500) return null;
  const out: Segment[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.replace(/\s+/g, " ").trim().slice(0, 120) : "";
    if (!name) return null;
    const time = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
    out.push({ name, pbMs: time(r.pbMs), bestMs: time(r.bestMs) });
  }
  return out;
}

export function sameNames(a: readonly Segment[], b: readonly Segment[]): boolean {
  return a.length === b.length && a.every((s, i) => s.name === b[i].name);
}
