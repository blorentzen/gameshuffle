import { test } from "node:test";
import assert from "node:assert/strict";
import { adoptClock, cleanSegments, clockMs, remoteStep, replacesSegments, savedSegments, type RemoteClock } from "../src/remote";
import { emptyCore, rebased, started, type Core, type Segment } from "../src/state";

// The same 4-split file as the state tests (PB 33:41.8, sum of best 33:06.9).
const SEGS: Segment[] = [
  { name: "Mushroom", pbMs: 480_100, bestMs: 475_400 },
  { name: "Flower", pbMs: 985_100, bestMs: 967_400 },
  { name: "Star", pbMs: 1_491_700, bestMs: 1_466_700 },
  { name: "Special", pbMs: 2_021_800, bestMs: 1_986_900 },
];

function withRun(segs: Segment[] = SEGS): Core {
  const c = emptyCore();
  return { ...c, state: { ...c.state, segments: segs, splits: segs.map(() => null), golds: segs.map(() => false) } };
}

/** Runs commands at the given times and returns the last result, failing the test on an error. */
function play(start: Core, steps: [string, number][]): { core: Core; clock: RemoteClock | null; events: (string | null)[] } {
  let core = start;
  let clock: RemoteClock | null = null;
  const events: (string | null)[] = [];
  for (const [cmd, at] of steps) {
    const r = remoteStep(core, clock, cmd as never, at);
    assert.ok(r.ok, `${cmd} at ${at} failed: ${r.ok ? "" : r.error}`);
    if (!r.ok) throw new Error("unreachable");
    core = r.core;
    clock = r.clock;
    events.push(r.event);
  }
  return { core, clock, events };
}

const T0 = 1_700_000_000_000;

test("start, splits and a finish make the same events as LiveSplit One", () => {
  const { core, clock, events } = play(withRun(), [
    ["start", T0],
    ["split", T0 + 470_000],
    ["split", T0 + 980_000],
    ["split", T0 + 1_470_000],
    ["split", T0 + 2_000_000],
  ]);
  assert.deepEqual(events, ["start", "split", "split", "split", "finish"]);
  assert.equal(core.state.phase, "ended");
  assert.equal(core.state.attempt, 1);
  assert.deepEqual(core.state.splits, [470_000, 980_000, 1_470_000, 2_000_000]);
  assert.deepEqual(core.state.golds, [true, false, true, false], "Mushroom 7:50 and Star 8:10 beat their bests");
  assert.deepEqual(core.state.last, { kind: "finish", index: 3, gold: false, pb: true });
  assert.equal(core.state.elapsedMs, 2_000_000);
  assert.ok(clock && clock.since === T0, "the clock keeps running under a finish");
});

test("the first split's state says which split is next and its delta", () => {
  const { core } = play(withRun(), [["start", T0], ["split", T0 + 470_000]]);
  assert.equal(core.state.phase, "running");
  assert.equal(core.state.index, 1);
  assert.deepEqual(core.state.last, { kind: "split", index: 0, gold: true });
  assert.equal(core.state.splits[0], 470_000);
});

test("start only starts and split only splits", () => {
  const idle = withRun();
  assert.deepEqual(remoteStep(idle, null, "split", T0), { ok: false, error: "no_run" });
  assert.deepEqual(remoteStep(idle, null, "undo", T0), { ok: false, error: "no_run" });
  assert.deepEqual(remoteStep(idle, null, "skip", T0), { ok: false, error: "no_run" });
  assert.deepEqual(remoteStep(idle, null, "reset", T0), { ok: false, error: "no_run" });
  assert.deepEqual(remoteStep(idle, null, "pause", T0), { ok: false, error: "no_run" });
  assert.deepEqual(remoteStep(idle, null, "resume", T0), { ok: false, error: "no_run" });
  const running = play(withRun(), [["start", T0]]);
  assert.deepEqual(remoteStep(running.core, running.clock, "start", T0 + 5), { ok: false, error: "run_already_in_progress" });
  const done = play(withRun(), [["start", T0], ["split", T0 + 1], ["split", T0 + 2], ["split", T0 + 3], ["split", T0 + 4]]);
  assert.deepEqual(remoteStep(done.core, done.clock, "start", T0 + 5), { ok: false, error: "run_finished" });
  assert.deepEqual(remoteStep(done.core, done.clock, "split", T0 + 5), { ok: false, error: "run_finished" });
  assert.deepEqual(remoteStep(emptyCore(), null, "start", T0), { ok: false, error: "no_splits" });
});

test("pause stops the clock and resume carries on from there", () => {
  const { core, clock } = play(withRun(), [["start", T0], ["pause", T0 + 10_000]]);
  assert.equal(core.state.phase, "paused");
  assert.deepEqual(clock, { base: 10_000, since: null });
  assert.equal(clockMs(clock!, T0 + 99_000), 10_000, "a paused clock stands still");
  assert.deepEqual(remoteStep(core, clock, "split", T0 + 20_000), { ok: false, error: "timer_paused" });
  assert.deepEqual(remoteStep(core, clock, "pause", T0 + 20_000), { ok: false, error: "already_paused" });
  const r = remoteStep(core, clock, "resume", T0 + 30_000);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.core.state.phase, "running");
  assert.equal(r.core.state.elapsedMs, 10_000);
  const s = remoteStep(r.core, r.clock, "split", T0 + 35_000);
  assert.ok(s.ok && s.core.state.splits[0] === 15_000, "five seconds after resuming at 10s");
  assert.deepEqual(remoteStep(withRun(), null, "resume", T0), { ok: false, error: "no_run" });
  const running = play(withRun(), [["start", T0]]);
  assert.deepEqual(remoteStep(running.core, running.clock, "resume", T0), { ok: false, error: "not_paused" });
});

test("skip leaves a gap and can't skip the last split", () => {
  const { core, clock } = play(withRun(), [["start", T0], ["split", T0 + 470_000], ["skip", T0 + 900_000]]);
  assert.equal(core.state.index, 2);
  assert.deepEqual(core.state.splits, [470_000, null, null, null]);
  assert.deepEqual(core.state.last, { kind: "skip", index: 1 });
  const at3 = remoteStep(core, clock, "split", T0 + 1_460_000);
  assert.ok(at3.ok && at3.core.state.golds[2] === true, "the stretch since the last split counts against the bests");
  if (!at3.ok) return;
  assert.deepEqual(remoteStep(at3.core, at3.clock, "skip", T0 + 1_500_000), { ok: false, error: "cant_skip_last_split" });
});

test("undo takes a split back, and after a finish goes back to running", () => {
  const a = play(withRun(), [["start", T0]]);
  assert.deepEqual(remoteStep(a.core, a.clock, "undo", T0 + 5), { ok: false, error: "cant_undo_first_split" });
  const b = play(withRun(), [["start", T0], ["split", T0 + 470_000], ["undo", T0 + 480_000]]);
  assert.equal(b.core.state.index, 0);
  assert.deepEqual(b.core.state.splits, [null, null, null, null]);
  assert.deepEqual(b.core.state.last, { kind: "undo", index: 0 });
  assert.deepEqual(b.events, ["start", "split", "undo"]);
  const c = play(withRun(), [["start", T0], ["split", T0 + 1], ["split", T0 + 2], ["split", T0 + 3], ["split", T0 + 4], ["undo", T0 + 10]]);
  assert.equal(c.core.state.phase, "running");
  assert.equal(c.core.state.index, 3);
  assert.deepEqual(c.core.state.splits, [1, 2, 3, null]);
  assert.equal(c.core.state.elapsedMs, 10, "the clock kept running under the finish");
});

test("a reset saves golds as best segments and a faster finish as the PB", () => {
  // A mid-run reset: Mushroom 7:50 beats the best 7:55.4.
  const mid = play(withRun(), [["start", T0], ["split", T0 + 470_000], ["reset", T0 + 500_000]]);
  assert.deepEqual(mid.events, ["start", "split", "reset"]);
  assert.equal(mid.core.state.phase, "idle");
  assert.equal(mid.clock, null);
  assert.deepEqual(mid.core.state.splits, [470_000, null, null, null], "the reset webhook carries the splits");
  assert.equal(mid.core.state.segments[0].bestMs, 470_000);
  assert.equal(mid.core.state.segments[3].bestMs, 1_986_900 - 5_400, "later cumulative bests move with it");
  assert.equal(mid.core.state.segments[3].pbMs, 2_021_800, "no finish, no new PB");
  // A finish faster than the PB, then reset: the PB is this run.
  const fast = play(withRun(), [["start", T0], ["split", T0 + 470_000], ["split", T0 + 980_000], ["split", T0 + 1_470_000], ["split", T0 + 2_000_000], ["reset", T0 + 2_010_000]]);
  assert.deepEqual(fast.core.state.segments.map((s) => s.pbMs), [470_000, 980_000, 1_470_000, 2_000_000]);
  // A slow finish keeps the old PB.
  const slow = play(withRun(), [["start", T0], ["split", T0 + 500_000], ["split", T0 + 1_000_000], ["split", T0 + 1_500_000], ["split", T0 + 2_100_000], ["reset", T0 + 2_200_000]]);
  assert.deepEqual(slow.core.state.segments.map((s) => s.pbMs), SEGS.map((s) => s.pbMs));
  // The next start counts the next attempt and reads the new bests.
  const next = remoteStep(mid.core, mid.clock, "start", T0 + 600_000);
  assert.ok(next.ok && next.core.state.attempt === 2 && next.core.bestAtStart[0] === 470_000);
});

test("savedSegments: a first finish with no PB becomes the PB; skipped stretches don't make bests", () => {
  const blank = SEGS.map((s) => ({ name: s.name, pbMs: null, bestMs: null }));
  const first = savedSegments(blank, [100, 200, 300, 400], true);
  assert.deepEqual(first.map((s) => s.pbMs), [100, 200, 300, 400]);
  assert.deepEqual(first.map((s) => s.bestMs), [100, 200, 300, 400]);
  const gap = savedSegments(SEGS, [470_000, null, 1_460_000, null], false);
  assert.equal(gap[1].bestMs, 967_400 - 5_400, "Flower's own best stays; its cumulative moves with Mushroom");
  assert.equal(gap[2].bestMs, 1_466_700 - 5_400, "Star's stretch crossed a skip, so its best stays too");
});

test("attempts continue from the site's number", () => {
  const base = rebased(withRun(), 311);
  const { core } = play(base, [["start", T0]]);
  assert.equal(core.state.attempt, 312);
});

test("the phone takes over a run LiveSplit One was keeping", () => {
  let c = started(withRun(), { phase: "running", index: 0, timeMs: 0 }, null);
  c = { ...c, state: { ...c.state, elapsedMs: 60_000, at: T0 } };
  assert.deepEqual(adoptClock(c, T0 + 5_000), { base: 65_000, since: T0 + 5_000 });
  const r = remoteStep(c, null, "split", T0 + 5_000);
  assert.ok(r.ok && r.core.state.splits[0] === 65_000);
  assert.equal(adoptClock(withRun(), T0), null);
});

test("splits from the site are cleaned", () => {
  assert.deepEqual(cleanSegments([{ name: "  Luigi   Raceway " }, { name: "Moo Moo Farm", pbMs: 61_000.4, bestMs: -3 }]), [
    { name: "Luigi Raceway", pbMs: null, bestMs: null },
    { name: "Moo Moo Farm", pbMs: 61_000, bestMs: null },
  ]);
  assert.equal(cleanSegments([{ name: "" }]), null);
  assert.equal(cleanSegments("x"), null);
  assert.equal(cleanSegments(Array.from({ length: 501 }, (_, i) => ({ name: `S${i}` }))), null);
  assert.equal(cleanSegments([{ name: "x".repeat(200) }])?.[0].name.length, 120);
});

test("the site's splits replace the relay's only when they should, and always on a run switch", () => {
  const timed = [{ name: "A", pbMs: 1000, bestMs: 900 }, { name: "B", pbMs: 2000, bestMs: 1800 }];
  const bare = timed.map((s) => ({ ...s, pbMs: null, bestMs: null }));
  assert.equal(replacesSegments(timed, bare), false, "same names: the relay's times stay");
  assert.equal(replacesSegments(bare, timed), true, "same names, times where the relay has none");
  assert.equal(replacesSegments(timed, [{ name: "C", pbMs: null, bestMs: null }]), true, "a different list");
  assert.equal(replacesSegments(timed, bare, true), true, "a run switch replaces even with the same names");
  assert.equal(replacesSegments(timed, [], true), true, "and can clear them");
});
