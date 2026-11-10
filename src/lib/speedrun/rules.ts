/**
 * Speedrun rules (phase 1): what the overlay reads off a RelayState. Deltas against the PB, golds, the sum of best
 * (live, with this run's golds in it), the previous segment, pace, which rows the Column shows, the Strip's ticks,
 * which moment a new state plays, the look's defaults and cleaning, and what the webhook does to an attempt.
 * Pure and client-safe; tests in scripts/test-speedrun.ts.
 */

import type { RelayEvent, RelaySegment, RelayState, SpeedrunLook, SpeedrunStats } from "./types";

export const DEFAULT_STATS: SpeedrunStats = { pb: true, sob: true, attempts: true, prevSegment: false, pace: false };
export const DEFAULT_LOOK: SpeedrunLook = { layout: "column", position: "bottom", stats: DEFAULT_STATS, theme: null, line: null };

export const CATEGORY_MAX = 80;
export const GAME_MAX = 80;
export const ATTEMPTS_MAX = 999_999;

/** A saved or sent look, cleaned: anything missing or odd falls back to the default. */
export function cleanLook(input: unknown): SpeedrunLook {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const s = o.stats && typeof o.stats === "object" ? (o.stats as Record<string, unknown>) : {};
  const flag = (k: keyof SpeedrunStats) => (typeof s[k] === "boolean" ? (s[k] as boolean) : DEFAULT_STATS[k]);
  return {
    layout: o.layout === "strip" ? "strip" : "column",
    position: o.position === "top" ? "top" : "bottom",
    stats: { pb: flag("pb"), sob: flag("sob"), attempts: flag("attempts"), prevSegment: flag("prevSegment"), pace: flag("pace") },
    theme: typeof o.theme === "string" && /^[a-z0-9-]{1,24}$/.test(o.theme) ? o.theme : null,
    line: typeof o.line === "string" && o.line.trim() ? o.line.trim().slice(0, 40) : null,
  };
}

/** A typed category: one line, trimmed, 80 characters at most. */
export function cleanCategory(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.replace(/\s+/g, " ").trim().slice(0, CATEGORY_MAX);
  return s || null;
}

// ── Reading a run ─────────────────────────────────────────────────────────

/** The index of the split the runner is on, or null before a run (segments.length once it has ended). */
export function currentIndex(st: RelayState): number | null {
  if (st.phase === "ended") return st.segments.length;
  if (st.phase === "idle") return null;
  return st.index ?? 0;
}

/** Each split's gap to the PB at that split (ms; negative = ahead), null where there's nothing to compare. */
export function deltas(st: RelayState): (number | null)[] {
  return st.segments.map((seg, i) => {
    const t = st.splits[i];
    return t != null && seg.pbMs != null ? t - seg.pbMs : null;
  });
}

/** The last split reached this run (index), or -1. */
export function lastReached(st: RelayState): number {
  for (let i = Math.min(st.splits.length, st.segments.length) - 1; i >= 0; i--) if (st.splits[i] != null) return i;
  return -1;
}

/** The time at the last split reached before `index` (0 at the start). */
export function timeBefore(st: RelayState, index: number): number {
  for (let i = Math.min(index, st.splits.length) - 1; i >= 0; i--) {
    const t = st.splits[i];
    if (t != null) return t;
  }
  return 0;
}

/** The gap at the last split with one: what the chip under the clock says. */
export function lastDelta(st: RelayState): { index: number; ms: number } | null {
  const d = deltas(st);
  for (let i = d.length - 1; i >= 0; i--) if (d[i] != null) return { index: i, ms: d[i] as number };
  return null;
}

/** Segment lengths from a cumulative comparison (null where a time is missing). */
export function segmentLengths(cum: (number | null)[]): (number | null)[] {
  return cum.map((t, i) => {
    if (t == null) return null;
    if (i === 0) return t;
    const prev = cum[i - 1];
    return prev == null ? null : t - prev;
  });
}

/** The sum of best: the Best Segments comparison's last time, lowered by this run's golds. Null when it's unknown. */
export function sumOfBest(st: RelayState): number | null {
  const best = segmentLengths(st.segments.map((s) => s.bestMs));
  if (!best.length || best.some((b) => b == null)) {
    const last = st.segments.at(-1)?.bestMs;
    return last ?? null;
  }
  let total = 0;
  for (let i = 0; i < best.length; i++) {
    let seg = best[i] as number;
    if (st.golds[i] && st.splits[i] != null) {
      const prev = i === 0 ? 0 : st.splits[i - 1];
      if (prev != null) seg = Math.min(seg, (st.splits[i] as number) - prev);
    }
    total += seg;
  }
  return total;
}

/** The PB's final time, or null when there isn't one yet. */
export const pbTime = (segments: RelaySegment[]): number | null => segments.at(-1)?.pbMs ?? null;

/** Time gained or lost on the last split reached, against the PB's segment (negative = gained). */
export function prevSegment(st: RelayState): { index: number; ms: number } | null {
  const i = lastReached(st);
  if (i < 0) return null;
  const d = deltas(st);
  if (d[i] == null) return null;
  if (i === 0) return { index: 0, ms: d[0] as number };
  if (st.splits[i - 1] == null || d[i - 1] == null) return null;
  return { index: i, ms: (d[i] as number) - (d[i - 1] as number) };
}

/** Where the run finishes if the rest matches the PB (the PB's time plus the gap at the last split). */
export function pace(st: RelayState): number | null {
  const pb = pbTime(st.segments);
  if (pb == null) return null;
  if (st.phase === "ended") {
    const end = st.splits.at(-1);
    return end ?? pb;
  }
  const d = lastDelta(st);
  return d ? pb + d.ms : pb;
}

/** A finished run beat the PB (or there was none). */
export function isNewPb(st: RelayState): boolean {
  if (st.last?.kind === "finish" && typeof st.last.pb === "boolean") return st.last.pb;
  const end = st.splits.at(-1);
  if (st.phase !== "ended" || end == null) return false;
  const pb = pbTime(st.segments);
  return pb == null || end < pb;
}

// ── The Column's rows ─────────────────────────────────────────────────────

export const COLUMN_ROWS = 16;

/**
 * Which split rows the Column shows: all of them up to `max`; past that, a window that keeps the current split in
 * view with a few coming up, and the final split pinned as the last row (as LiveSplit does).
 */
export function visibleRows(count: number, current: number | null, max = COLUMN_ROWS): number[] {
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const w = max - 1; // the last row is the final split
  const body = count - 1; // rows before the final split
  const ahead = 3;
  const cur = current == null ? 0 : Math.min(current, count - 1);
  const start = Math.max(0, Math.min(cur - (w - 1 - ahead), body - w));
  const rows = Array.from({ length: w }, (_, i) => start + i);
  rows.push(count - 1);
  return rows;
}

export type TickKind = "ahead" | "behind" | "gold" | "skip" | "now" | "next";

/** The Strip's bar: one tick per split. */
export function ticks(st: RelayState): TickKind[] {
  const d = deltas(st);
  const cur = currentIndex(st);
  return st.segments.map((_, i) => {
    if (cur != null && i < cur) {
      if (st.splits[i] == null) return "skip";
      if (st.golds[i]) return "gold";
      return d[i] != null && (d[i] as number) > 0 ? "behind" : "ahead";
    }
    if (cur === i && st.phase !== "idle") return "now";
    return "next";
  });
}

// ── Moments ───────────────────────────────────────────────────────────────

export type MomentKind = "gold" | "pb" | "reset";

/**
 * The moment a new state plays, if any: a gold split, a new PB at the finish, or a reset. Only for a change seen
 * live (the same connection, a newer seq); the first state after connecting never plays one.
 */
export function momentFor(prev: RelayState | null, next: RelayState): MomentKind | null {
  if (!prev || next.seq <= prev.seq || !next.last) return null;
  const l = next.last;
  if (l.kind === "split" && l.gold) return "gold";
  if (l.kind === "finish" && isNewPb(next)) return "pb";
  if (l.kind === "reset" && prev.phase !== "idle") return "reset";
  return null;
}

// ── The webhook ───────────────────────────────────────────────────────────

export type AttemptPlan =
  | { kind: "open"; attempt: number }
  | { kind: "progress"; attempt: number; splits: (number | null)[] }
  | { kind: "close"; attempt: number; result: "finished" | "reset"; splits: (number | null)[] | null; finalMs: number | null; pb: boolean }
  | { kind: "none" };

const anySplit = (splits: (number | null)[]) => splits.some((t) => t != null);

/** What a relay event does to the attempt it belongs to (idempotent per attempt and event: the store guards rows). */
export function attemptPlan(event: RelayEvent, st: RelayState): AttemptPlan {
  const attempt = Math.max(0, Math.floor(st.attempt));
  switch (event) {
    case "start":
      return { kind: "open", attempt };
    case "split":
    case "skip":
    case "undo":
      return { kind: "progress", attempt, splits: st.splits.slice(0, st.segments.length || st.splits.length) };
    case "finish": {
      const end = st.splits.at(-1);
      return { kind: "close", attempt, result: "finished", splits: st.splits, finalMs: end ?? (st.elapsedMs > 0 ? Math.round(st.elapsedMs) : null), pb: isNewPb({ ...st, phase: "ended" }) };
    }
    case "reset":
      // The state after a reset may have its splits cleared: keep the ones the split events saved.
      return { kind: "close", attempt, result: "reset", splits: anySplit(st.splits) ? st.splits : null, finalMs: st.elapsedMs > 0 ? Math.round(st.elapsedMs) : null, pb: false };
    default:
      return { kind: "none" };
  }
}

/** A state from the webhook, checked enough to store (the signature already proved who sent it). */
export function isRelayState(x: unknown): x is RelayState {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  return typeof s.seq === "number" && typeof s.phase === "string" && typeof s.attempt === "number"
    && Array.isArray(s.segments) && Array.isArray(s.splits) && typeof s.elapsedMs === "number";
}

/** The last segments as they're kept on the setup (names and times only, 500 at most). */
export function keepSegments(segments: RelaySegment[]): RelaySegment[] {
  return segments.slice(0, 500).map((s) => ({
    name: String(s?.name ?? "").slice(0, 120),
    pbMs: typeof s?.pbMs === "number" && Number.isFinite(s.pbMs) ? Math.round(s.pbMs) : null,
    bestMs: typeof s?.bestMs === "number" && Number.isFinite(s.bestMs) ? Math.round(s.bestMs) : null,
  }));
}

/** The overlay's first paint before the relay answers: the saved run, not started. */
export function idleState(segments: RelaySegment[], opts: { game: string | null; category: string | null; attempt: number }): RelayState {
  return {
    v: 1, seq: 0, connected: false, phase: "idle", index: null, elapsedMs: 0, at: 0,
    game: opts.game, category: opts.category, attempt: opts.attempt,
    segments, splits: segments.map(() => null), golds: segments.map(() => false), last: null,
  };
}

/**
 * The relay's attempt base for "attempts so far" = n: the relay counts attempt = base + starts it has seen, so the
 * base is n minus the starts already counted (never below 0).
 */
export function baseForAttempts(n: number, current: { attempts: number; base: number }): number {
  const seen = Math.max(0, current.attempts - current.base);
  return Math.max(0, Math.min(ATTEMPTS_MAX, Math.floor(n)) - seen);
}
