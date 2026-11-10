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
