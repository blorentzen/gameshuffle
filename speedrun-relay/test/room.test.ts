import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allResolved, cleanEntrants, cleanLive, emptyLane, emptyRoom, finishedRoom, laneFromLive, laneFromSite, leaderReached,
  outLane, startedRoom, viewOf, type LaneLive, type RoomCore,
} from "../src/roomState";

const live = (over: Partial<LaneLive> = {}): LaneLive => ({
  seq: 1, connected: true, mode: "lso", canStart: true, remotes: 0, phase: "idle", index: null, elapsedMs: 0, at: 1000,
  count: 3, splits: [null, null, null], last: null, attempt: 10, ...over,
});

const room = (): RoomCore => ({
  ...emptyRoom(), roomId: "AbCdEfGh12345678", title: "Race", checkpoints: ["A", "B", "C"], configVersion: 1,
  entrants: cleanEntrants([
    { key: "nova", name: "Nova", source: "relay", relayId: "AAAAAAAAAAAAAAA1", delayMs: 5000 },
    { key: "sam", name: "Sam", source: "relay", relayId: "AAAAAAAAAAAAAAA2" },
  ])!,
  lanes: { nova: emptyLane(), sam: emptyLane() },
});

test("entrants are checked whole", () => {
  assert.equal(cleanEntrants([{ key: "a", name: "A", source: "relay" }]), null, "a relay lane needs its relay");
  assert.equal(cleanEntrants([{ key: "a", name: "A", source: "site" }, { key: "a", name: "B", source: "site" }]), null, "keys are unique");
  assert.equal(cleanEntrants(Array.from({ length: 9 }, (_, i) => ({ key: `k${i}`, name: "N", source: "site" }))), null, "8 at most");
  const ok = cleanEntrants([{ key: "a", name: "  Ann   B ", source: "site", color: "#ABCDEF", delayMs: 999_999 }])!;
  assert.deepEqual(ok[0], { key: "a", name: "Ann B", source: "site", relayId: null, delayMs: 0, color: "#abcdef", ready: false });
});

test("a relay's state is checked", () => {
  assert.equal(cleanLive({ ...live(), phase: "flying" }), null);
  assert.equal(cleanLive({ ...live(), mode: "x" }), null);
  const l = cleanLive({ ...live(), splits: [1.4, "x", -1], remotes: 2 })!;
  assert.deepEqual(l.splits, [1, null, null]);
  assert.equal(l.remotes, 2);
});

test("before the start only the live view moves", () => {
  const lane = laneFromLive(emptyLane(), live({ phase: "running", index: 1, splits: [100, null, null] }), "open");
  assert.equal(lane.status, "waiting");
  assert.equal(lane.reached, 0);
  assert.equal(lane.live?.phase, "running");
});

test("a race lane follows its timer", () => {
  let r = startedRoom(room(), 5000);
  assert.equal(r.status, "running");
  let lane = r.lanes.nova;
  assert.equal(lane.status, "running");
  // Still at 0 before the start command lands: nothing yet.
  lane = laneFromLive(lane, live({ seq: 2 }), "running");
  assert.equal(lane.attempt, null);
  lane = laneFromLive(lane, live({ seq: 3, phase: "running", index: 0, attempt: 11 }), "running");
  assert.equal(lane.attempt, 11, "the first running state fixes the race's attempt");
  lane = laneFromLive(lane, live({ seq: 4, phase: "running", index: 2, attempt: 11, splits: [1000, 2000, null] }), "running");
  assert.equal(lane.reached, 2);
  assert.deepEqual(lane.times, [1000, 2000, null]);
  assert.equal(laneFromLive(lane, live({ seq: 3, phase: "running", index: 0, attempt: 11 }), "running"), lane, "an older state changes nothing");
  lane = laneFromLive(lane, live({ seq: 5, phase: "ended", attempt: 11, splits: [1000, 2000, 3100], elapsedMs: 3100, at: 9000 }), "running");
  assert.equal(lane.status, "done");
  assert.equal(lane.finalMs, 3100);
  assert.equal(lane.endedAt, 9000);
  lane = laneFromLive(lane, live({ seq: 6, phase: "running", index: 2, attempt: 11, splits: [1000, 2000, null] }), "running");
  assert.equal(lane.status, "running", "an Undo after the last split takes it back");
  assert.equal(lane.finalMs, null);
  r = { ...r, lanes: { ...r.lanes, nova: lane } };
  assert.equal(leaderReached(r), 2);
});

test("a reset forfeits, and so does a new attempt", () => {
  const r = startedRoom(room(), 5000);
  let lane = laneFromLive(r.lanes.sam, live({ seq: 2, phase: "running", index: 1, attempt: 4, splits: [900, null, null] }), "running");
  const reset = laneFromLive(lane, live({ seq: 3, phase: "idle", attempt: 4, last: { kind: "reset", index: 1 }, at: 7000 }), "running");
  assert.equal(reset.status, "out");
  assert.equal(reset.outReason, "reset");
  assert.equal(reset.outAt, 1);
  lane = laneFromLive(lane, live({ seq: 4, phase: "running", index: 0, attempt: 5 }), "running");
  assert.equal(lane.status, "out", "a reset and a quick start still forfeit");
  assert.equal(laneFromLive(lane, live({ seq: 9, phase: "ended", attempt: 5, splits: [1, 2, 3] }), "running").status, "out", "out stays out");
});

test("the room finishes when every lane has", () => {
  let r = startedRoom(room(), 5000);
  assert.equal(allResolved(r), false);
  r = { ...r, lanes: { ...r.lanes, nova: { ...r.lanes.nova, status: "done", finalMs: 10 } } };
  assert.equal(allResolved(r), false);
  r = { ...r, lanes: { ...r.lanes, sam: outLane(r.lanes.sam, "left", 6000) } };
  assert.equal(allResolved(r), true);
  const f = finishedRoom(startedRoom(room(), 1), 99, "timeout");
  assert.equal(f.status, "finished");
  assert.equal(f.lanes.nova.outReason, "timeout");
  assert.equal(outLane({ ...emptyLane(), status: "done" }, "left", 5).status, "done", "a finished lane stays finished");
});

test("the site can feed a lane (a game it runs)", () => {
  const r = startedRoom(room(), 1);
  const a = laneFromSite(r.lanes.nova, { times: [3, 5], reached: 2 }, "running", 10)!;
  assert.equal(a.reached, 2);
  const b = laneFromSite(a, { times: [3, 5, 9], status: "done" }, "running", 20)!;
  assert.equal(b.status, "done");
  assert.equal(b.finalMs, 9);
  assert.equal(laneFromSite(b, { times: [1] }, "running", 30), b, "a finished lane doesn't move");
  assert.equal(laneFromSite(r.lanes.sam, { times: "x" }, "running", 1), null);
  assert.equal(laneFromSite(r.lanes.sam, { times: [] , status: "out", reason: "left" }, "running", 1)!.outReason, "left");
  const lost = laneFromSite(r.lanes.sam, { times: [4, null], reached: 1, status: "out", reason: "lost", tieMs: 90_000, current: 7 }, "running", 2)!;
  assert.deepEqual([lost.status, lost.outReason, lost.outAt, lost.tieMs, lost.current], ["out", "lost", 1, 90_000, 7], "a duel lost: how far, the time and the turn");
  const won = laneFromSite(r.lanes.nova, { times: [2, 5], reached: 2, status: "done", finalMs: 6, tieMs: 120_000 }, "running", 3)!;
  assert.deepEqual([won.finalMs, won.tieMs], [6, 120_000], "a duel won: turns, then the time for ties");
});

test("the view carries each entrant's lane", () => {
  const v = viewOf(room(), 123);
  assert.equal(v.now, 123);
  assert.equal(v.entrants.length, 2);
  assert.equal(v.entrants[0].lane.status, "waiting");
  assert.equal(v.entrants[0].delayMs, 5000);
});
