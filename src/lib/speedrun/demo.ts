/**
 * A made-up run for previews (the setup screen, the pitch) and the overlay checks: Mario Kart 8 Deluxe, 48 Tracks,
 * twelve cup splits, the same numbers as the approved mockups (picks 2026-11-09). Pure and client-safe.
 */

import type { RelayState } from "./types";

const NAMES = ["Mushroom", "Flower", "Star", "Special", "Shell", "Banana", "Leaf", "Lightning", "Egg", "Triforce", "Crossing", "Bell"];
// Seconds per cup: the PB, the best segments, and attempt 312 (this run).
const PB = [482.4, 501.7, 514.9, 527.3, 495.6, 508.1, 499.5, 521.2, 485.8, 492.9, 489.4, 505.3];
const BEST = [478.0, 497.2, 508.9, 522.4, 491.3, 503.0, 492.6, 515.8, 481.1, 487.7, 484.9, 499.6];
const RUN = [480.1, 505.0, 506.6, 530.1, 497.0, 512.4, 490.2, 519.0, 487.0, 490.1, 488.3, 499.5];

const cum = (a: number[]) => a.reduce<number[]>((o, v, i) => (o.push((o[i - 1] ?? 0) + v), o), []);
const ms = (s: number) => Math.round(s * 1000);

export type DemoMoment = "mid" | "gold" | "pb" | "reset";

/**
 * The run at a moment: "mid" = in Lightning Cup, 3:10.6 in; "gold" = just split Leaf, a gold; "pb" = finished, a new
 * PB; "reset" = the state just before a reset in Shell Cup (attempt 311, behind).
 */
export function demoState(moment: DemoMoment = "mid", game = "mario-kart-8-deluxe", category = "48 Tracks · 150cc, items"): RelayState {
  const pbCum = cum(PB);
  const bestCum = cum(BEST);
  const segments = NAMES.map((name, i) => ({ name, pbMs: ms(pbCum[i]), bestMs: ms(bestCum[i]) }));
  const run = moment === "reset" ? [484.0, 506.9, 518.0, 533.2] : RUN;
  const done = moment === "mid" || moment === "gold" ? 7 : moment === "pb" ? 12 : 4;
  const runCum = cum(run);
  const splits = NAMES.map((_, i) => (i < done ? ms(runCum[i]) : null));
  const golds = NAMES.map((_, i) => i < done && run[i] < BEST[i]);
  const into = moment === "mid" ? 190.6 : moment === "reset" ? 125.0 : 0;
  const elapsed = done >= 12 ? ms(runCum[11]) : ms((runCum[done - 1] ?? 0) + into);
  const last: RelayState["last"] =
    moment === "gold" ? { kind: "split", index: 6, gold: true }
      : moment === "pb" ? { kind: "finish", index: 11, pb: true }
        : { kind: "split", index: done - 1, gold: golds[done - 1] };
  return {
    v: 1, seq: 100, connected: true, phase: done >= 12 ? "ended" : "running", index: done >= 12 ? null : done,
    elapsedMs: elapsed, at: 0, game, category, attempt: moment === "reset" ? 311 : 312,
    segments, splits, golds, last,
  };
}

/** The state a reset sends (after the "reset" state above): not running, splits cleared. */
export function demoAfterReset(): RelayState {
  const before = demoState("reset");
  return {
    ...before, seq: before.seq + 1, phase: "idle", index: null, elapsedMs: 0,
    splits: before.segments.map(() => null), golds: before.segments.map(() => false), last: { kind: "reset", index: 4 },
  };
}

// ── Runs for the visitor page's demo (launch picks 2026-11-10: any game, not just Mario Kart) ─────────

/** A made-up run in some game: its splits, the PB and best segments, and this attempt's segments (seconds). */
export interface DemoRun {
  id: string;
  /** A catalog key (the overlay shows the catalog's name), or a typed name. */
  game: string;
  label: string;
  category: string;
  names: string[];
  pb: number[];
  best: number[];
  run: number[];
  attempt: number;
}

export const DEMO_RUNS: DemoRun[] = [
  {
    id: "odyssey", game: "super-mario-odyssey", label: "Super Mario Odyssey", category: "Any%",
    names: ["Cap", "Cascade", "Sand", "Lake", "Wooded", "Lost", "Metro", "Snow", "Seaside", "Luncheon", "Ruined", "Bowser's", "Moon"],
    pb: [180, 165, 400, 210, 330, 120, 420, 300, 280, 360, 150, 420, 300],
    best: [176, 161, 391, 206, 322, 117, 410, 293, 274, 352, 146, 412, 294],
    run: [178, 163, 389, 209, 326, 118, 414, 295, 276, 355, 147, 409, 298],
    attempt: 214,
  },
  {
    id: "minecraft", game: "minecraft", label: "Minecraft", category: "Any% Random Seed, Glitchless",
    names: ["Wood", "Iron", "Nether", "Bastion", "Fortress", "Blind", "Stronghold", "The End"],
    pb: [45, 120, 95, 150, 140, 90, 110, 120],
    best: [38, 102, 80, 128, 118, 76, 95, 104],
    run: [41, 99, 88, 140, 125, 83, 101, 113],
    attempt: 1042,
  },
  {
    id: "mk8dx", game: "mario-kart-8-deluxe", label: "Mario Kart 8 Deluxe", category: "48 Tracks · 150cc, items",
    names: NAMES, pb: PB, best: BEST, run: RUN, attempt: 312,
  },
];

/**
 * A demo run after `done` splits (`intoSec` into the next one), as the relay would send it. `done` = every split is
 * a finished run; the last split's gold or a new PB is marked the way the relay marks them, so moments play.
 */
export function demoRunState(r: DemoRun, done: number, intoSec = 0, seq = 1): RelayState {
  const n = r.names.length;
  const pbCum = cum(r.pb);
  const bestCum = cum(r.best);
  const runCum = cum(r.run);
  const k = Math.max(0, Math.min(n, done));
  const segments = r.names.map((name, i) => ({ name, pbMs: ms(pbCum[i]), bestMs: ms(bestCum[i]) }));
  const splits = r.names.map((_, i) => (i < k ? ms(runCum[i]) : null));
  const golds = r.names.map((_, i) => i < k && r.run[i] < r.best[i]);
  const ended = k >= n;
  const last: RelayState["last"] = k === 0 ? null
    : ended ? { kind: "finish", index: n - 1, pb: runCum[n - 1] < pbCum[n - 1] }
      : { kind: "split", index: k - 1, gold: golds[k - 1] };
  return {
    v: 1, seq, connected: true, phase: ended ? "ended" : k === 0 && intoSec === 0 ? "idle" : "running", index: ended || (k === 0 && intoSec === 0) ? null : k,
    elapsedMs: ended ? ms(runCum[n - 1]) : ms((runCum[k - 1] ?? 0) + intoSec), at: 0, game: r.game, category: r.category,
    attempt: r.attempt, segments, splits, golds, last,
  };
}
