import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyCore,
  finished,
  goldAt,
  isPb,
  paused,
  rebased,
  reconcile,
  remeasured,
  reset,
  resegmented,
  resumed,
  sameView,
  skipped,
  splitted,
  started,
  undone,
  type Core,
  type Segment,
  type Snap,
} from "../src/state";

// The 4-split test file used against the real LiveSplit One (PB 33:41.8, sum of best 33:06.9).
const SEGS: Segment[] = [
  { name: "Mushroom", pbMs: 480_100, bestMs: 475_400 },
  { name: "Flower", pbMs: 985_100, bestMs: 967_400 },
  { name: "Star", pbMs: 1_491_700, bestMs: 1_466_700 },
  { name: "Special", pbMs: 2_021_800, bestMs: 1_986_900 },
];
const run = (index: number, timeMs: number): Snap => ({ phase: "running", index, timeMs });
const IDLE: Snap = { phase: "idle", index: null, timeMs: 0 };

function withRun(): Core {
  const c = emptyCore();
  return { ...c, state: { ...c.state, segments: SEGS, splits: [null, null, null, null], golds: [false, false, false, false] } };
}

test("a start counts an attempt and clears the splits", () => {
  const c = started(withRun(), run(0, 5), null);
  assert.equal(c.count, 1);
  assert.equal(c.state.attempt, 1);
  assert.equal(c.state.phase, "running");
  assert.equal(c.state.index, 0);
  assert.equal(c.state.elapsedMs, 5);
  assert.deepEqual(c.state.splits, [null, null, null, null]);
  assert.deepEqual(c.state.golds, [false, false, false, false]);
  assert.deepEqual(c.bestAtStart, [475_400, 967_400, 1_466_700, 1_986_900]);
  assert.deepEqual(c.state.last, { kind: "start", index: 0 });
  assert.equal(started(c, run(0, 0), null).state.attempt, 2);
});

test("attemptBase applies now when idle and at the next start during a run", () => {
  let c = rebased(withRun(), 311);
  assert.equal(c.state.attempt, 311);
  c = started(c, run(0, 0), null);
  assert.equal(c.state.attempt, 312);
  c = rebased(c, 500);
  assert.equal(c.state.attempt, 312, "a run is going: the number doesn't change under it");
  c = reset(c, IDLE, null);
  c = started(c, run(0, 0), null);
  assert.equal(c.state.attempt, 501);
  assert.equal(c.rebase, null);
});

test("golds compare each segment with the best segment read at the start", () => {
  const best = SEGS.map((s) => s.bestMs);
  assert.equal(goldAt([470_000, null, null, null], best, 0), true, "7:50 < 7:55.4");
  assert.equal(goldAt([475_400, null, null, null], best, 0), false, "a tie isn't gold");
  assert.equal(goldAt([470_000, 980_000, null, null], best, 1), false, "8:30 vs best 8:12");
  assert.equal(goldAt([470_000, 950_000, null, null], best, 1), true, "8:00 vs best 8:12");
  // After a skip the segment runs from the last split reached, against the best for that stretch.
  assert.equal(goldAt([470_000, null, 1_460_000, null], best, 2), true, "16:30 vs 16:31.3");
  assert.equal(goldAt([470_000, null, 1_462_000, null], best, 2), false, "16:32 vs 16:31.3");
  assert.equal(goldAt([470_000, null, null, null], [null, null, null, null], 0), true, "no best yet: gold, like LiveSplit");
  assert.equal(goldAt([null, null, null, null], best, 0), false);
});

test("splits, a finish and the PB flag", () => {
  let c = started(withRun(), run(0, 0), null);
  c = splitted(c, run(1, 470_100), new Map([[0, 470_000]]));
  assert.deepEqual(c.state.last, { kind: "split", index: 0, gold: true });
  assert.equal(c.state.index, 1);
  c = splitted(c, run(2, 980_100), new Map([[1, 980_000]]));
  assert.deepEqual(c.state.last, { kind: "split", index: 1, gold: false });
  assert.deepEqual(c.state.golds, [true, false, false, false]);
  c = splitted(c, run(3, 1_470_100), new Map([[2, 1_470_000]]));
  c = finished(c, { phase: "ended", index: null, timeMs: 2_000_000 }, new Map([[3, 2_000_000]]));
  assert.equal(c.state.phase, "ended");
  assert.equal(c.state.index, null);
  assert.deepEqual(c.state.splits, [470_000, 980_000, 1_470_000, 2_000_000]);
  assert.deepEqual(c.state.last, { kind: "finish", index: 3, gold: false, pb: true });
  assert.equal(isPb(SEGS, 2_021_800), false, "equal to the PB isn't a PB");
  assert.equal(isPb(SEGS, 2_021_801), false);
  assert.equal(isPb([{ name: "x", pbMs: null, bestMs: null }], 99), true, "no PB yet");
  assert.equal(isPb(SEGS, null), false);
});

test("two quick splits read together", () => {
  let c = started(withRun(), run(0, 0), null);
  c = splitted(c, run(2, 990_000), new Map([[0, 470_000], [1, 985_000]]));
  assert.deepEqual(c.state.splits, [470_000, 985_000, null, null]);
  assert.deepEqual(c.state.last, { kind: "split", index: 1, gold: false });
});

test("skip and undo mirror LiveSplit One's split times", () => {
  let c = started(withRun(), run(0, 0), null);
  c = splitted(c, run(1, 470_100), new Map([[0, 470_000]]));
  c = skipped(c, run(2, 900_000), [470_000, null]);
  assert.deepEqual(c.state.last, { kind: "skip", index: 1 });
  assert.deepEqual(c.state.splits, [470_000, null, null, null]);
  c = undone(c, run(1, 910_000), [470_000]);
  assert.deepEqual(c.state.last, { kind: "undo", index: 1 });
  c = undone(c, run(0, 920_000), []);
  assert.deepEqual(c.state.splits, [null, null, null, null]);
  assert.deepEqual(c.state.golds, [false, false, false, false]);
  assert.deepEqual(c.state.last, { kind: "undo", index: 0 });
});

test("undo after a finish goes back to running", () => {
  let c = started(withRun(), run(0, 0), null);
  c = finished(c, { phase: "ended", index: null, timeMs: 10 }, new Map([[0, 1], [1, 2], [2, 3], [3, 10]]));
  c = undone(c, run(3, 12), [1, 2, 3]);
  assert.equal(c.state.phase, "running");
  assert.equal(c.state.index, 3);
  assert.deepEqual(c.state.splits, [1, 2, 3, null]);
});

test("reset keeps the attempt's splits and where it ended", () => {
  let c = started(withRun(), run(0, 0), null);
  c = splitted(c, run(1, 470_100), new Map([[0, 470_000]]));
  const newPb = SEGS.map((s, i) => (i === 0 ? { ...s, bestMs: 470_000 } : s));
  c = reset(c, IDLE, newPb);
  assert.equal(c.state.phase, "idle");
  assert.equal(c.state.index, null);
  assert.equal(c.state.attempt, 1);
  assert.deepEqual(c.state.splits, [470_000, null, null, null]);
  assert.deepEqual(c.state.last, { kind: "reset", index: 1 });
  assert.equal(c.state.segments[0].bestMs, 470_000);
  const ended = finished(started(withRun(), run(0, 0), null), { phase: "ended", index: null, timeMs: 9 }, new Map([[3, 9]]));
  assert.deepEqual(reset(ended, IDLE, null).state.last, { kind: "reset", index: null });
});

test("pause and resume", () => {
  let c = started(withRun(), run(0, 0), null);
  c = paused(c, { phase: "paused", index: 0, timeMs: 1000 });
  assert.equal(c.state.phase, "paused");
  assert.deepEqual(c.state.last, { kind: "pause", index: 0 });
  c = resumed(c, run(0, 1000));
  assert.deepEqual(c.state.last, { kind: "resume", index: 0 });
});

test("a new splits file mid-attempt resizes everything", () => {
  let c = started(withRun(), run(0, 0), null);
  const two = SEGS.slice(0, 2);
  c = resegmented(c, two);
  assert.equal(c.state.splits.length, 2);
  assert.equal(c.state.golds.length, 2);
  assert.deepEqual(c.bestAtStart, [475_400, 967_400]);
});

test("reconcile: idle on both sides changes nothing but the run", () => {
  const steps = reconcile(emptyCore(), { segments: SEGS, snap: IDLE, times: [] });
  assert.equal(steps.length, 1);
  assert.equal(steps[0].event, null);
  assert.deepEqual(steps[0].core.state.segments, SEGS);
  assert.equal(steps[0].core.count, 0);
});

test("reconcile: a run that began while away is counted", () => {
  const steps = reconcile(withRun(), { segments: SEGS, snap: run(2, 990_000), times: [470_000, 985_000] });
  assert.deepEqual(steps.map((s) => s.event), ["start"]);
  const c = steps[0].core;
  assert.equal(c.count, 1);
  assert.equal(c.state.index, 2);
  assert.deepEqual(c.state.splits, [470_000, 985_000, null, null]);
  assert.deepEqual(c.state.golds, [true, false, false, false]);
});

test("reconcile: the same attempt carries on, and a split made meanwhile is shown", () => {
  let c = started(withRun(), run(0, 0), null);
  c = splitted(c, run(1, 470_100), new Map([[0, 470_000]]));
  const quiet = reconcile(c, { segments: SEGS, snap: run(1, 600_000), times: [470_010] });
  assert.deepEqual(quiet.map((s) => s.event), [null]);
  assert.deepEqual(quiet[0].core.state.last, { kind: "split", index: 0, gold: true }, "last left as it was");
  const steps = reconcile(c, { segments: SEGS, snap: run(2, 990_000), times: [470_010, 985_000] });
  assert.deepEqual(steps.map((s) => s.event), ["split"]);
  assert.equal(steps[0].core.count, 1);
  assert.deepEqual(steps[0].core.state.splits, [470_010, 985_000, null, null]);
  assert.deepEqual(steps[0].core.state.last, { kind: "split", index: 1, gold: false });
  const done = reconcile(c, { segments: SEGS, snap: { phase: "ended", index: null, timeMs: 2_000_000 }, times: [470_000, 980_000, 1_470_000, 2_000_000] });
  assert.deepEqual(done.map((s) => s.event), ["finish"]);
  assert.deepEqual(done[0].core.state.last, { kind: "finish", index: 3, gold: false, pb: true });
});

test("reconcile: a different attempt closes the old one and starts the new", () => {
  let c = started(withRun(), run(0, 0), null);
  c = splitted(c, run(1, 470_100), new Map([[0, 470_000]]));
  const conflict = reconcile(c, { segments: SEGS, snap: run(1, 600_000), times: [500_000] });
  assert.deepEqual(conflict.map((s) => s.event), ["reset", "start"]);
  assert.equal(conflict[0].core.state.attempt, 1);
  assert.equal(conflict[1].core.state.attempt, 2);
  const behind = reconcile(c, { segments: SEGS, snap: run(0, 10_000), times: [] });
  assert.deepEqual(behind.map((s) => s.event), ["reset", "start"], "the clock is behind a split we saw");
  const otherFile = reconcile(c, { segments: SEGS.slice(0, 3), snap: run(1, 600_000), times: [470_000] });
  assert.deepEqual(otherFile.map((s) => s.event), ["reset", "start"]);
});

test("reconcile: a run that ended while away is closed with a reset", () => {
  let c = started(withRun(), run(0, 0), null);
  c = splitted(c, run(1, 470_100), new Map([[0, 470_000]]));
  const steps = reconcile(c, { segments: SEGS, snap: IDLE, times: [] });
  assert.deepEqual(steps.map((s) => s.event), ["reset", null]);
  assert.equal(steps[1].core.state.phase, "idle");
  assert.deepEqual(steps[1].core.state.last, { kind: "reset", index: 1 });
});

test("a timing method change reads every time again without a new attempt", () => {
  let c = started(withRun(), run(0, 0), null);
  c = splitted(c, run(1, 470_100), new Map([[0, 470_000]]));
  const gt = SEGS.map((s) => ({ ...s, pbMs: (s.pbMs as number) - 1000, bestMs: (s.bestMs as number) - 1000 }));
  const next = remeasured(c, { segments: gt, snap: run(1, 460_000), times: [460_000] });
  assert.equal(next.count, 1);
  assert.deepEqual(next.state.splits, [460_000, null, null, null]);
  assert.equal(next.bestAtStart[0], 474_400);
});

test("sameView ignores seq and at only", () => {
  const a = withRun().state;
  assert.equal(sameView(a, { ...a, seq: 9, at: 1 }), true);
  assert.equal(sameView(a, { ...a, elapsedMs: 1 }), false);
});

test("cleanInfo tidies the add-on's message", async () => {
  const { cleanInfo } = await import("../src/state");
  assert.equal(cleanInfo({ game: "x" }), null);
  const i = cleanInfo({ addon: "1.0.0", game: "  Super   Mario Odyssey ", category: "", attempts: 42, runKey: "4-abc", remote: false });
  assert.deepEqual(i, { addon: "1.0.0", game: "Super Mario Odyssey", category: null, attempts: 42, runKey: "4-abc", remote: false });
  assert.equal(cleanInfo({ addon: "1", attempts: -3 })?.attempts, null);
  assert.equal(cleanInfo({ addon: "1", attempts: 4.5 })?.attempts, null);
  assert.equal(cleanInfo({ addon: "1" })?.remote, true);
});
