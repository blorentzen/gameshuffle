/**
 * Speedrun rules (phase 1): what the overlay reads off a RelayState. Deltas against the PB, golds, the sum of best
 * (live, with this run's golds in it), the previous segment, pace, which rows the Column shows, the Strip's ticks,
 * which moment a new state plays, the look's defaults and cleaning, and what the webhook does to an attempt.
 * Pure and client-safe; tests in scripts/test-speedrun.ts.
 */

import type { RelayEvent, RelaySegment, RelayState, SpeedrunLook, SpeedrunSettings, SpeedrunStats, SpeedrunTimerSettings, TimerInfo } from "./types";
import { cleanStyle, DEFAULT_SPEEDRUN_STYLE } from "./look";

export const DEFAULT_STATS: SpeedrunStats = { pb: true, sob: true, attempts: true, prevSegment: false, pace: false };
export const DEFAULT_LOOK: SpeedrunLook = { layout: "column", position: "bottom", stats: DEFAULT_STATS, ...DEFAULT_SPEEDRUN_STYLE, line: null };

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
    ...cleanStyle(o),
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

// ── Step 2: settings, the phone remote's splits, the prediction ─────────

/** Reply waits on offer (seconds). 60 at most: the delayed lines run inside the webhook's own time. */
export const REPLY_DELAYS = [0, 2, 5, 10, 15, 20, 30, 45, 60] as const;
export const DEFAULT_TIMER: SpeedrunTimerSettings = { choice: "livesplit", auto: { game: false, category: false }, typedAttempts: false, from: null };

export const DEFAULT_SETTINGS: SpeedrunSettings = {
  prediction: { on: false, lockSplit: null },
  commands: { pb: true, pace: true, splits: true },
  replyDelay: 5,
  timer: DEFAULT_TIMER,
};
export const SPLITS_MAX = 500;
export const SPLIT_NAME_MAX = 120;

/** Saved or sent settings, cleaned: anything missing or odd falls back to the default. */
export function cleanSettings(input: unknown): SpeedrunSettings {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const p = o.prediction && typeof o.prediction === "object" ? (o.prediction as Record<string, unknown>) : {};
  const c = o.commands && typeof o.commands === "object" ? (o.commands as Record<string, unknown>) : {};
  const flag = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const lock = typeof p.lockSplit === "number" && Number.isInteger(p.lockSplit) && p.lockSplit >= 1 && p.lockSplit <= SPLITS_MAX ? p.lockSplit : null;
  const delay = typeof o.replyDelay === "number" && (REPLY_DELAYS as readonly number[]).includes(o.replyDelay) ? o.replyDelay : DEFAULT_SETTINGS.replyDelay;
  return {
    prediction: { on: flag(p.on, false), lockSplit: lock },
    commands: { pb: flag(c.pb, true), pace: flag(c.pace, true), splits: flag(c.splits, true) },
    replyDelay: delay,
    timer: cleanTimerSettings(o.timer),
  };
}

function cleanTimerSettings(input: unknown): SpeedrunTimerSettings {
  const t = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const a = t.auto && typeof t.auto === "object" ? (t.auto as Record<string, unknown>) : {};
  const f = t.from && typeof t.from === "object" ? (t.from as Record<string, unknown>) : null;
  const n = f?.attempts;
  return {
    choice: t.choice === "lso" ? "lso" : "livesplit",
    auto: { game: a.game === true, category: a.category === true },
    typedAttempts: t.typedAttempts === true,
    from: f
      ? {
          game: infoText(f.game, GAME_TEXT_MAX),
          category: cleanCategory(f.category),
          attempts: typeof n === "number" && Number.isInteger(n) && n >= 0 ? Math.min(n, ATTEMPTS_MAX) : null,
          at: typeof f.at === "string" ? f.at.slice(0, 40) : "",
        }
      : null,
  };
}

const GAME_TEXT_MAX = 120;
const infoText = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
};

/** The add-on's message as the relay passes it on, tidied; null when it isn't one. */
export function cleanTimerInfo(raw: unknown): TimerInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const addon = infoText(r.addon, 20);
  if (!addon) return null;
  const n = r.attempts;
  return {
    addon,
    game: infoText(r.game, GAME_TEXT_MAX),
    category: cleanCategory(r.category),
    attempts: typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= ATTEMPTS_MAX ? n : null,
    runKey: infoText(r.runKey, 40),
    remote: r.remote !== false,
  };
}

/**
 * What LiveSplit's info changes on a setup (pick 2, 2026-11-10): game and category when the runner never typed them
 * (or LiveSplit filled them before), the attempt count when they never typed one and LiveSplit's is higher (the count
 * never goes down: saved attempts are numbered by it). `stored` turns a game name into what the setup keeps (a catalog
 * key or the name). Returns only what changed.
 */
export function applyTimerInfo(
  cur: { game: string | null; category: string | null; attempts: number; attemptBase: number; settings: SpeedrunSettings },
  info: TimerInfo,
  stored: (name: string) => string | null,
  now: string,
): { game?: string | null; category?: string | null; attempts?: number; attemptBase?: number; settings: SpeedrunSettings } {
  const t = cur.settings.timer;
  const shared = info.game != null || info.category != null || info.attempts != null;
  const timer: SpeedrunTimerSettings = { ...t, auto: { ...t.auto }, from: shared ? { game: info.game, category: info.category, attempts: info.attempts, at: now } : null };
  const out: ReturnType<typeof applyTimerInfo> = { settings: { ...cur.settings, timer } };
  if (info.game) {
    const g = stored(info.game);
    if (g && (cur.game == null || t.auto.game) && g !== cur.game) {
      out.game = g;
      timer.auto.game = true;
    }
  }
  if (info.category && (cur.category == null || t.auto.category) && info.category !== cur.category) {
    out.category = info.category;
    timer.auto.category = true;
  }
  if (info.attempts != null && !t.typedAttempts && info.attempts > cur.attempts) {
    out.attempts = info.attempts;
    out.attemptBase = baseForAttempts(info.attempts, { attempts: cur.attempts, base: cur.attemptBase });
  }
  return out;
}

/** A partial change on top of the saved settings (what the setup screen sends). */
export function mergeSettings(cur: SpeedrunSettings, patch: unknown): SpeedrunSettings {
  const o = patch && typeof patch === "object" ? (patch as Record<string, unknown>) : {};
  // Of the timer settings the page only picks which timer leads; where values came from is the server's to say.
  const t = o.timer && typeof o.timer === "object" ? (o.timer as Record<string, unknown>) : {};
  return cleanSettings({
    prediction: { ...cur.prediction, ...(o.prediction && typeof o.prediction === "object" ? o.prediction : {}) },
    commands: { ...cur.commands, ...(o.commands && typeof o.commands === "object" ? o.commands : {}) },
    replyDelay: o.replyDelay ?? cur.replyDelay,
    timer: { ...cur.timer, choice: t.choice === "lso" || t.choice === "livesplit" ? t.choice : cur.timer.choice },
  });
}

/** Typed split names, one per line, tidied: blank lines dropped, 120 characters each, 500 at most. */
export function cleanSplitNames(input: unknown): string[] | null {
  const lines = Array.isArray(input) ? input : typeof input === "string" ? input.split(/\r?\n/) : null;
  if (!lines) return null;
  const names = lines
    .map((l) => (typeof l === "string" ? l.replace(/\s+/g, " ").trim().slice(0, SPLIT_NAME_MAX) : ""))
    .filter(Boolean);
  return names.length && names.length <= SPLITS_MAX ? names : null;
}

/**
 * A runner's LiveSplit file as the browser read it (`readLss`), checked: names tidied, times whole ms from 0 to 100
 * hours (anything else is dropped to "no time"), 500 splits at most. Null when there are no splits.
 */
export function cleanImportedRun(input: unknown): { segments: RelaySegment[]; game: string | null; category: string | null; attempts: number } | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (!Array.isArray(o.segments) || !o.segments.length || o.segments.length > SPLITS_MAX) return null;
  const time = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 360_000_000 ? Math.floor(v) : null);
  const segments: RelaySegment[] = [];
  for (const raw of o.segments) {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.replace(/\s+/g, " ").trim().slice(0, SPLIT_NAME_MAX) : "";
    if (!name) return null;
    segments.push({ name, pbMs: time(r.pbMs), bestMs: time(r.bestMs) });
  }
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
  const n = typeof o.attempts === "number" && Number.isFinite(o.attempts) ? Math.floor(o.attempts) : 0;
  return { segments, game: text(o.game, GAME_MAX), category: text(o.category, CATEGORY_MAX), attempts: Math.min(ATTEMPTS_MAX, Math.max(0, n)) };
}

/** The run for typed names: a split keeps its times when the name is unchanged in the same place, else starts fresh. */
export function segmentsForNames(names: string[], current: RelaySegment[]): RelaySegment[] {
  const same = names.length === current.length && names.every((n, i) => n === current[i].name);
  return same ? current.map((s) => ({ ...s })) : names.map((name) => ({ name, pbMs: null, bestMs: null }));
}

/**
 * After which split bets lock: the streamer's choice, else a quarter of the way in. Never before split 2 (the
 * prediction opens after split 1) and never on the last split (that's the finish). Null for runs under 3 splits.
 */
export function lockAfter(n: number, chosen: number | null): number | null {
  if (n < 3) return null;
  const want = chosen ?? Math.round(n / 4);
  return Math.min(Math.max(want, 2), n - 1);
}

/** How long a finished or reset run stays on the card. */
export const RUN_SHOWN_AFTER_MS = 2 * 60_000;

/** Whether a run is worth the run card now: going, or finished or reset in the last two minutes. */
export function runShown(st: RelayState, now: number): boolean {
  if (st.phase === "running" || st.phase === "paused") return true;
  const ended = st.phase === "ended" || (st.phase === "idle" && st.last?.kind === "reset");
  return ended && now - st.at < RUN_SHOWN_AFTER_MS;
}

/** The run card's five rows (live page, Twitch extension): two splits before the one being run, it, and two after. */
export function runCardRows(count: number, current: number, size = 5): number[] {
  if (count <= size) return Array.from({ length: count }, (_, i) => i);
  const start = Math.max(0, Math.min(current - 2, count - size));
  return Array.from({ length: size }, (_, i) => start + i);
}

/** "On PB pace" on the run card: ahead of PB with a quarter of the run left, in a run of four splits or more. */
export function onPbPace(st: RelayState): boolean {
  const n = st.segments.length;
  if (st.phase !== "running" || n < 4) return false;
  const d = lastDelta(st);
  return !!d && d.ms < 0 && splitsDone(st) >= Math.ceil(n * 0.75);
}

/** Splits done so far in this attempt (the index of the split being run, or every split once it ended). */
export function splitsDone(st: RelayState): number {
  if (st.phase === "ended") return st.segments.length;
  if (st.phase === "idle") return 0;
  return Math.max(0, st.index ?? 0);
}

export type PredictionMarketState = { status: "open" | "locked" | "settled" | "cancelled"; lockPending: boolean } | null;
export type PredictionAction =
  | { kind: "open" }
  | { kind: "lock" }
  | { kind: "settle"; winner: "pb" | "no" }
  | { kind: "refund" }
  | { kind: "none" };

/**
 * What a relay event does to the attempt's "PB this run" prediction (picks 2026-11-09): it opens after split 1, locks
 * after the lock split, settles at the finish (PB or not), gives the tokens back on a reset before the lock and
 * settles a reset after the lock as no PB. `market` is this attempt's market, if any; `lockPending` = the lock split
 * is done but the stream delay hasn't passed yet, so it counts as locked.
 */
export function predictionAction(event: RelayEvent, st: RelayState, lockAt: number | null, market: PredictionMarketState): PredictionAction {
  const live = market && (market.status === "open" || market.status === "locked");
  const locked = !!market && (market.status === "locked" || market.lockPending);
  switch (event) {
    case "split":
    case "skip": {
      if (lockAt == null) return { kind: "none" };
      const done = splitsDone(st);
      if (!market) return done >= 1 && done < lockAt && st.phase !== "ended" ? { kind: "open" } : { kind: "none" };
      if (market.status === "open" && !market.lockPending && done >= lockAt) return { kind: "lock" };
      return { kind: "none" };
    }
    case "finish":
      return live ? { kind: "settle", winner: isNewPb({ ...st, phase: "ended" }) ? "pb" : "no" } : { kind: "none" };
    case "reset":
      if (!live) return { kind: "none" };
      return locked ? { kind: "settle", winner: "no" } : { kind: "refund" };
    default:
      return { kind: "none" };
  }
}
