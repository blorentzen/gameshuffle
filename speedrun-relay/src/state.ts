// The run as overlays see it, and the pure rules that move it on each LiveSplit One event. No I/O here: the Durable
// Object reads LiveSplit One, then calls these with what it read. Shape matches specs/gs-speedrun/phase1-contract.md.

export type Phase = "idle" | "running" | "paused" | "ended";
export type LastKind = "start" | "split" | "skip" | "undo" | "reset" | "finish" | "pause" | "resume";
export type HookEvent = "start" | "split" | "skip" | "undo" | "reset" | "finish" | "connect" | "disconnect";

export interface Segment {
  name: string;
  pbMs: number | null; // Personal Best split (cumulative)
  bestMs: number | null; // Best Segments comparison (cumulative, so the last one is the sum of best)
}

export interface Last {
  kind: LastKind;
  index: number | null;
  gold?: boolean;
  pb?: boolean;
}

export interface RelayState {
  v: 1;
  seq: number;
  connected: boolean;
  phase: Phase;
  index: number | null;
  elapsedMs: number;
  at: number;
  game: string | null;
  category: string | null;
  attempt: number;
  segments: Segment[];
  splits: (number | null)[];
  golds: boolean[];
  last: Last | null;
}

/** What the object keeps besides the public state. */
export interface Core {
  state: RelayState;
  count: number; // attempts so far; state.attempt mirrors it
  rebase: number | null; // a new attemptBase that waits for the next start because a run is going
  bestAtStart: (number | null)[]; // Best Segments as read when this attempt started
}

/** LiveSplit One's getCurrentState + getCurrentTime. */
export interface Snap {
  phase: Phase;
  index: number | null;
  timeMs: number;
}

/** Everything read at once: on connect, after a lost reply, or when the timing method changes. */
export interface Observation {
  segments: Segment[];
  snap: Snap;
  times: (number | null)[]; // split times for the indexes already reached (0 .. reached-1)
}

export interface Step {
  core: Core;
  event: HookEvent | null;
}

/** Two split times closer than this are the same split (time strings are rounded to ms). */
const SAME_SPLIT_MS = 50;

export function emptyState(): RelayState {
  return {
    v: 1,
    seq: 0,
    connected: false,
    phase: "idle",
    index: null,
    elapsedMs: 0,
    at: Date.now(),
    game: null,
    category: null,
    attempt: 0,
    segments: [],
    splits: [],
    golds: [],
    last: null,
  };
}

export function emptyCore(): Core {
  return { state: emptyState(), count: 0, rebase: null, bestAtStart: [] };
}

/** How far the run has got: the current split while going, every split once ended, none while idle. */
export function reachedOf(snap: Snap, n: number): number {
  if (snap.phase === "ended") return n;
  if (snap.phase === "idle") return 0;
  return Math.min(Math.max(snap.index ?? 0, 0), n);
}

function fit<T>(arr: readonly T[], n: number, fill: T): T[] {
  const out = arr.slice(0, n);
  while (out.length < n) out.push(fill);
  return out;
}

/** A split is gold when its segment beats the best segment (both measured from the last split reached). */
export function goldAt(splits: readonly (number | null)[], best: readonly (number | null)[], i: number): boolean {
  const ms = splits[i];
  if (ms == null) return false;
  let j = i - 1;
  while (j >= 0 && splits[j] == null) j--;
  const prevMs = j < 0 ? 0 : (splits[j] as number);
  const bestHere = best[i] ?? null;
  const bestPrev = j < 0 ? 0 : (best[j] ?? null);
  // No best segment yet: LiveSplit counts the first one as gold too.
  if (bestHere == null || bestPrev == null) return true;
  return ms - prevMs < bestHere - bestPrev;
}

export function goldsOf(splits: readonly (number | null)[], best: readonly (number | null)[]): boolean[] {
  return splits.map((_, i) => goldAt(splits, best, i));
}

/** A finish is a PB when it beats the PB's final split, or when there was no PB. */
export function isPb(segments: readonly Segment[], finalMs: number | null): boolean {
  if (finalMs == null || segments.length === 0) return false;
  const pb = segments[segments.length - 1].pbMs;
  return pb == null || finalMs < pb;
}

export function sameSegments(a: readonly Segment[], b: readonly Segment[]): boolean {
  return a.length === b.length && a.every((s, i) => s.name === b[i].name && s.pbMs === b[i].pbMs && s.bestMs === b[i].bestMs);
}

function sameNames(a: readonly Segment[], b: readonly Segment[]): boolean {
  return a.length === b.length && a.every((s, i) => s.name === b[i].name);
}

function withSnap(s: RelayState, snap: Snap): RelayState {
  const going = snap.phase === "running" || snap.phase === "paused";
  return { ...s, phase: snap.phase, index: going ? snap.index : null, elapsedMs: snap.timeMs };
}

/** Puts split times into the attempt and works the golds out again. */
function withTimes(c: Core, times: ReadonlyMap<number, number | null> | readonly (number | null)[], replace: boolean): Core {
  const n = c.state.segments.length;
  const splits = replace ? fit<number | null>([], n, null) : fit(c.state.splits, n, null);
  if (Array.isArray(times)) times.forEach((t, i) => i < n && (splits[i] = t));
  else (times as ReadonlyMap<number, number | null>).forEach((t, i) => i >= 0 && i < n && (splits[i] = t));
  return { ...c, state: { ...c.state, splits, golds: goldsOf(splits, fit(c.bestAtStart, n, null)) } };
}

export function started(c: Core, snap: Snap, segments: Segment[] | null): Core {
  const segs = segments ?? c.state.segments;
  const n = segs.length;
  const count = (c.rebase ?? c.count) + 1;
  return {
    count,
    rebase: null,
    bestAtStart: segs.map((s) => s.bestMs),
    state: {
      ...withSnap(c.state, snap),
      segments: segs,
      attempt: count,
      splits: fit([], n, null),
      golds: fit([], n, false),
      last: { kind: "start", index: 0 },
    },
  };
}

/** The splits file changed between attempts: new names and times, same attempt. */
export function resegmented(c: Core, segments: Segment[]): Core {
  const n = segments.length;
  const going = c.state.phase !== "idle";
  const next: Core = {
    ...c,
    bestAtStart: going ? segments.map((s) => s.bestMs) : c.bestAtStart,
    state: { ...c.state, segments, splits: fit(c.state.splits, n, null), golds: fit(c.state.golds, n, false) },
  };
  return withTimes(next, [], false);
}

export function splitted(c: Core, snap: Snap, times: ReadonlyMap<number, number | null>): Core {
  const next = withTimes({ ...c, state: withSnap(c.state, snap) }, times, false);
  const n = next.state.segments.length;
  const k = Math.min(reachedOf(snap, n), n) - 1;
  return { ...next, state: { ...next.state, last: { kind: "split", index: k, gold: next.state.golds[k] ?? false } } };
}

export function finished(c: Core, snap: Snap, times: ReadonlyMap<number, number | null>): Core {
  const next = withTimes({ ...c, state: withSnap(c.state, snap) }, times, false);
  const k = next.state.segments.length - 1;
  const finalMs = next.state.splits[k] ?? null;
  const last: Last = { kind: "finish", index: k, gold: next.state.golds[k] ?? false, pb: isPb(c.state.segments, finalMs) };
  return { ...next, state: { ...next.state, last } };
}

/** Skips and undos: LiveSplit One's split times for every reached index replace ours. */
function mirrored(c: Core, snap: Snap, times: readonly (number | null)[], last: Last): Core {
  const next = withTimes({ ...c, state: withSnap(c.state, snap) }, times, true);
  return { ...next, state: { ...next.state, last } };
}

export function skipped(c: Core, snap: Snap, times: readonly (number | null)[]): Core {
  const n = c.state.segments.length;
  return mirrored(c, snap, times, { kind: "skip", index: reachedOf(snap, n) - 1 });
}

export function undone(c: Core, snap: Snap, times: readonly (number | null)[]): Core {
  const n = c.state.segments.length;
  return mirrored(c, snap, times, { kind: "undo", index: reachedOf(snap, n) });
}

/** The attempt's splits stay until the next start so the reset webhook can carry them. */
export function reset(c: Core, snap: Snap, segments: Segment[] | null): Core {
  const index = c.state.phase === "ended" ? null : c.state.index;
  const state = withSnap(c.state, snap);
  return { ...c, state: { ...state, segments: segments ?? state.segments, last: { kind: "reset", index } } };
}

export function paused(c: Core, snap: Snap): Core {
  return { ...c, state: { ...withSnap(c.state, snap), last: { kind: "pause", index: snap.index } } };
}

export function resumed(c: Core, snap: Snap): Core {
  return { ...c, state: { ...withSnap(c.state, snap), last: { kind: "resume", index: snap.index } } };
}

export function refreshed(c: Core, snap: Snap): Core {
  return { ...c, state: withSnap(c.state, snap) };
}

/** The timing method changed: every time is read again, the attempt stays the same. */
export function remeasured(c: Core, obs: Observation): Core {
  const going = obs.snap.phase !== "idle";
  const next: Core = {
    ...c,
    bestAtStart: going ? obs.segments.map((s) => s.bestMs) : c.bestAtStart,
    state: { ...withSnap(c.state, obs.snap), segments: obs.segments },
  };
  return going ? withTimes(next, obs.times, true) : next;
}

/** Where the relay's idea of the run and LiveSplit One's disagree after a gap (reconnect, lost reply). */
function sameAttempt(prev: RelayState, obs: Observation): boolean {
  if (!sameNames(prev.segments, obs.segments)) return false;
  let latest: number | null = null;
  for (let i = 0; i < prev.splits.length; i++) {
    const a = prev.splits[i];
    const b = obs.times[i] ?? null;
    if (a != null && b != null && Math.abs(a - b) > SAME_SPLIT_MS) return false;
    if (a != null) latest = latest == null ? a : Math.max(latest, a);
  }
  // The clock is behind a split we saw: it started again.
  return latest == null || obs.snap.timeMs >= latest - SAME_SPLIT_MS;
}

/**
 * Brings the relay in line with what LiveSplit One shows now. An attempt the relay was following that is gone is
 * closed with a reset; one it never saw start is counted with a start.
 */
export function reconcile(c: Core, obs: Observation): Step[] {
  const prev = c.state;
  const wasGoing = prev.phase !== "idle";
  const isGoing = obs.snap.phase !== "idle";
  const same = wasGoing && isGoing && sameAttempt(prev, obs);
  const steps: Step[] = [];
  let cur = c;
  if (wasGoing && !same) {
    cur = reset(cur, { phase: "idle", index: null, timeMs: isGoing ? 0 : obs.snap.timeMs }, isGoing ? null : obs.segments);
    steps.push({ core: cur, event: "reset" });
  }
  if (isGoing && !same) {
    cur = started(cur, obs.snap, obs.segments);
    cur = withTimes(cur, obs.times, true);
    steps.push({ core: cur, event: "start" });
    return steps;
  }
  cur = { ...cur, state: { ...withSnap(cur.state, obs.snap), segments: obs.segments } };
  if (!same) {
    steps.push({ core: cur, event: null });
    return steps;
  }
  // The same attempt went on while the relay wasn't looking: show the latest split (or the finish) it missed.
  cur = withTimes(cur, obs.times, true);
  const n = cur.state.segments.length;
  const fresh = cur.state.splits.map((t, i) => t != null && prev.splits[i] == null).lastIndexOf(true);
  if (obs.snap.phase === "ended" && prev.phase !== "ended" && n > 0) {
    const finalMs = cur.state.splits[n - 1] ?? null;
    const last: Last = { kind: "finish", index: n - 1, gold: cur.state.golds[n - 1] ?? false, pb: isPb(prev.segments, finalMs) };
    steps.push({ core: { ...cur, state: { ...cur.state, last } }, event: "finish" });
  } else if (fresh >= 0) {
    steps.push({ core: { ...cur, state: { ...cur.state, last: { kind: "split", index: fresh, gold: cur.state.golds[fresh] ?? false } } }, event: "split" });
  } else {
    steps.push({ core: cur, event: null });
  }
  return steps;
}

/** /admin's attemptBase: the attempt number already reached. Applies now when idle, else at the next start. */
export function rebased(c: Core, base: number): Core {
  if (c.state.phase !== "idle") return { ...c, rebase: base };
  return { ...c, count: base, rebase: null, state: { ...c.state, attempt: base } };
}

/** Where a running clock should be by now, for spotting drift. */
export function predictedMs(s: RelayState, now: number): number {
  return s.phase === "running" ? s.elapsedMs + (now - s.at) : s.elapsedMs;
}

/** True when nothing an overlay shows has changed (seq and at aside). */
export function sameView(a: RelayState, b: RelayState): boolean {
  const strip = (s: RelayState) => JSON.stringify({ ...s, seq: 0, at: 0 });
  return strip(a) === strip(b);
}
