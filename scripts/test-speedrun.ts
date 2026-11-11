/**
 * Speedrunning, phase 1 (specs/gs-speedrun/phase1-contract.md): the contract's token and webhook vectors, LiveSplit's
 * time strings, formatting, and the overlay's rules (deltas, sum of best, previous segment, pace, rows, ticks, moments,
 * the webhook's attempt plan, looks from untrusted input). Step 2: settings, typed splits, the prediction's plan and
 * lock split, the chat lines (!pb, !pace, !splits and the prediction's), the tally words, and the parimutuel payout.
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-speedrun.ts
 */
import { newRelayId, parseToken, sameString, signBody, signToken, verifyBody, verifyToken } from "../src/lib/speedrun/tokens";
import { clockParts, fmtClock, fmtDelta, parseLsTime } from "../src/lib/speedrun/time";
import {
  DEFAULT_LOOK, attemptPlan, baseForAttempts, cleanCategory, cleanLook, currentIndex, deltas, idleState, isNewPb, isRelayState,
  keepSegments, lastDelta, momentFor, onPbPace, pace, prevSegment, runCardRows, runShown, RUN_SHOWN_AFTER_MS, segmentLengths, sumOfBest, ticks, timeBefore, visibleRows,
} from "../src/lib/speedrun/rules";
import { demoAfterReset, demoState } from "../src/lib/speedrun/demo";
import { DEFAULT_SPEEDRUN_STYLE, freeSpeedrunLook, speedrunPaidUsed, speedrunVars } from "../src/lib/speedrun/look";
import {
  DEFAULT_SETTINGS, applyTimerInfo, cleanSettings, cleanSplitNames, cleanTimerInfo, lockAfter, mergeSettings, predictionAction, segmentsForNames,
  splitsDone,
} from "../src/lib/speedrun/rules";
import {
  CHAT_MAX, PREDICTION_REFUND_LINE, chatCalledIt, paceLine, payoutIfWon, pbLine, predictionLockLine, predictionOpenLine,
  predictionSettleLine, predictionView, predictionWords, sobOf, splitsLine,
} from "../src/lib/speedrun/chat";
import { parimutuel } from "../src/lib/economy/markets/parimutuel";
import type { RelayState } from "../src/lib/speedrun/types";
import { groupedNames, groupsOf, namesToGroups, readSplitName, shownName, shownState } from "../src/lib/speedrun/splitGroups";
import { lssFileName, lssTime, readLss, writeLss } from "../src/lib/speedrun/lss";
import { FRLG_GYMS, buildTemplate, numberedSplits, templatesFor } from "../src/lib/speedrun/templates";
import { cleanImportedRun } from "../src/lib/speedrun/rules";
import frlgRun from "../src/data/pokemon/frlg-run.json";

let pass = 0, fail = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) === JSON.stringify(b)) pass++;
  else { fail++; console.log("FAIL", m, "got", JSON.stringify(a), "want", JSON.stringify(b)); }
};
const ok = (c: boolean, m: string) => eq(c, true, m);

async function main() {
  // ── Tokens: the contract's shared vectors ──
  const SECRET = "test-secret-0123456789abcdef0123456789";
  const ID = "AbCdEfGh12345678";
  const timer = await signToken(SECRET, "timer", ID, 1);
  const overlay = await signToken(SECRET, "overlay", ID, 1);
  eq(timer, "t1.AbCdEfGh12345678.1.4Wg53LFG6THcL-65ru8oQI", "timer vector");
  eq(overlay, "o1.AbCdEfGh12345678.1.Owqqi3mshHyOYbuNt0Z_Zk", "overlay vector");
  eq(await signBody(SECRET, JSON.stringify({ relayId: ID, event: "start" })), "83b9b2aecc2ac281c8a93bd563a3b04d7a2aa8f16f1e52dfae81c177a6a139f0", "webhook vector");
  eq(await signBody(SECRET, '{"relayId":"AbCdEfGh12345678","event":"start"}'), "83b9b2aecc2ac281c8a93bd563a3b04d7a2aa8f16f1e52dfae81c177a6a139f0", "webhook vector, raw body");

  eq(await verifyToken(SECRET, timer), { kind: "timer", relayId: ID, version: 1 }, "timer verifies");
  eq(await verifyToken(SECRET, overlay, "overlay"), { kind: "overlay", relayId: ID, version: 1 }, "overlay verifies as overlay");
  eq(await verifyToken(SECRET, timer, "overlay"), null, "a timer token isn't an overlay token");
  eq(await verifyToken(SECRET, overlay, "timer"), null, "an overlay token isn't a timer token");
  eq(await verifyToken("another-secret-0123456789abcdef", timer), null, "wrong secret");
  // The signature covers the kind, id and version: changing any of them fails.
  const [, , , sig] = timer.split(".");
  eq(await verifyToken(SECRET, `o1.${ID}.1.${sig}`), null, "kind swapped");
  eq(await verifyToken(SECRET, `t1.${ID}.2.${sig}`), null, "version bumped by hand");
  eq(await verifyToken(SECRET, `t1.AbCdEfGh12345679.1.${sig}`), null, "relay id changed");
  eq(await verifyToken(SECRET, `${timer.slice(0, -1)}${timer.endsWith("I") ? "J" : "I"}`), null, "signature changed");
  const v2 = await signToken(SECRET, "timer", ID, 2);
  eq(await verifyToken(SECRET, v2), { kind: "timer", relayId: ID, version: 2 }, "version 2 verifies");
  ok(v2 !== timer, "version 2 differs");
  for (const bad of ["", "t1", "t1.x.1.y", `x1.${ID}.1.${sig}`, `t1.${ID}.0.${sig}`, `t1.${ID}.-1.${sig}`, `t1.${ID}.1.${sig}.extra`, `t1.${ID}.01.${sig}`, 42, null, `t1.${ID}.1.${sig.slice(1)}`]) {
    eq(parseToken(bad), null, `not a token: ${JSON.stringify(bad)}`);
  }
  ok(/^[A-Za-z0-9_.-]+$/.test(timer) && /^[A-Za-z0-9_.-]+$/.test(overlay), "tokens use only [A-Za-z0-9_.-]");
  let threw = false;
  try { await signToken(SECRET, "timer", "short", 1); } catch { threw = true; }
  ok(threw, "a bad relay id can't be signed");
  threw = false;
  try { await signToken(SECRET, "timer", ID, 0); } catch { threw = true; }
  ok(threw, "version 0 can't be signed");

  // Relay ids: 16 characters, [A-Za-z0-9], all different.
  const ids = new Set<string>();
  for (let i = 0; i < 2000; i++) { const r = newRelayId(); ok(/^[A-Za-z0-9]{16}$/.test(r), "relay id shape"); ids.add(r); }
  eq(ids.size, 2000, "relay ids don't repeat");

  // The webhook signature.
  const body = JSON.stringify({ relayId: ID, event: "split", state: demoState("mid") });
  const good = await signBody(SECRET, body);
  ok(await verifyBody(SECRET, body, good), "webhook signature verifies");
  ok(await verifyBody(SECRET, body, good.toUpperCase()), "webhook signature in capitals verifies");
  ok(!(await verifyBody(SECRET, body + " ", good)), "a changed body fails");
  ok(!(await verifyBody(SECRET, body, null)), "no signature fails");
  ok(!(await verifyBody(SECRET, body, "abc")), "a short signature fails");
  ok(!(await verifyBody("wrong-secret-0123456789abcdef", body, good)), "the wrong secret fails");
  ok(sameString("abc", "abc") && !sameString("abc", "abd") && !sameString("abc", "abcd"), "sameString");

  // ── LiveSplit's time strings ──
  eq(parseLsTime("00:08:00.100000000"), 480100, "h:m:s with nanoseconds");
  eq(parseLsTime("-00:00:01.5"), -1500, "negative");
  eq(parseLsTime("1:07:30.70"), 4050700, "1:07:30.70");
  eq(parseLsTime("8:00.1"), 480100, "m:s.d");
  eq(parseLsTime("59.999"), 59999, "seconds only");
  eq(parseLsTime("0"), 0, "zero");
  eq(parseLsTime("12:00:00"), 43200000, "no fraction");
  eq(parseLsTime("+00:00:02.25"), 2250, "plus sign");
  eq(parseLsTime("100:00:00.0"), 360000000, "100 hours");
  for (const bad of ["", "abc", "1:2:3:4", "00:61:00", "1:75.0", "--1", null, 5, "1.2.3"]) eq(parseLsTime(bad), null, `not a time: ${JSON.stringify(bad)}`);

  // ── Formatting (cut to the tenth, never rounded up) ──
  eq(fmtClock(0), "0:00.0", "zero clock");
  eq(fmtClock(480100), "8:00.1", "8:00.1");
  eq(fmtClock(4050700), "1:07:30.7", "hours");
  eq(fmtClock(59999), "0:59.9", "cut, not rounded");
  eq(fmtClock(null), "-", "no time");
  eq(clockParts(3712345), { main: "1:01:52", frac: ".3", negative: false }, "clock parts");
  eq(clockParts(-1500).main, "-0:01", "negative clock");
  eq(fmtDelta(2300), "2.3", "short delta");
  eq(fmtDelta(-8100), "8.1", "delta has no sign");
  eq(fmtDelta(65400), "1:05.4", "delta with minutes");
  eq(fmtDelta(3723000), "1:02:03.0", "delta with hours");
  eq(fmtDelta(0), "0.0", "zero delta");

  // ── Reading the made-up run (the mockups' numbers) ──
  const mid = demoState("mid");
  eq(currentIndex(mid), 7, "on Lightning");
  eq(fmtClock(mid.segments.at(-1)!.pbMs), "1:40:24.1", "PB 1:40:24.1");
  eq(fmtClock(sumOfBest(mid)), "1:39:17.8", "sum of best with this run's golds (mockup)");
  eq(deltas(mid).slice(0, 7).map((d) => fmtDelta(d!)), ["2.3", "1.0", "7.3", "4.5", "3.1", "1.2", "8.1"], "deltas (mockup)");
  eq(deltas(mid).slice(0, 7).map((d) => d! < 0), [true, false, true, true, true, false, true], "ahead or behind (mockup)");
  eq(mid.golds.slice(0, 7), [false, false, true, false, false, false, true], "Star and Leaf are golds");
  eq(lastDelta(mid), { index: 6, ms: deltas(mid)[6] }, "last delta at Leaf");
  eq(fmtClock(timeBefore(mid, 7)), "58:41.4", "time at the last split (mockup)");
  eq(fmtClock(mid.elapsedMs - timeBefore(mid, 7)), "3:10.6", "Lightning so far (mockup)");
  eq(fmtClock(mid.elapsedMs), "1:01:52.0", "the clock (mockup)");
  const prev = prevSegment(mid)!;
  eq([prev.index, fmtDelta(prev.ms), prev.ms < 0], [6, "9.3", true], "previous segment: Leaf gained 9.3 on the PB's Leaf (1.2 behind to 8.1 ahead)");
  eq(fmtClock(pace(mid)), "1:40:16.0", "pace = PB + the gap at Leaf");
  eq(segmentLengths([1000, null, 3000]), [1000, null, null], "segment lengths stop at a gap");
  eq(segmentLengths([1000, 2500, 4000]), [1000, 1500, 1500], "segment lengths");

  // Sum of best without golds is the Best Segments comparison's last time.
  const fresh = idleState(mid.segments, { game: null, category: null, attempt: 0 });
  eq(sumOfBest(fresh), mid.segments.at(-1)!.bestMs, "sum of best before a run");
  eq(currentIndex(fresh), null, "no current split before a run");
  eq(pace(fresh), mid.segments.at(-1)!.pbMs, "pace before a run = the PB");
  eq(prevSegment(fresh), null, "no previous segment before a run");
  eq(ticks(fresh).every((t) => t === "next"), true, "ticks before a run");
  // A run with no PB yet.
  const noPb: RelayState = { ...fresh, segments: fresh.segments.map((s) => ({ ...s, pbMs: null, bestMs: null })) };
  eq(pace(noPb), null, "no PB, no pace");
  eq(sumOfBest(noPb), null, "no bests, no sum of best");

  // The finish: a new PB.
  const pb = demoState("pb");
  eq(currentIndex(pb), 12, "finished");
  ok(isNewPb(pb), "a new PB");
  eq(fmtClock(pb.splits.at(-1)), "1:40:05.3", "the new PB time (mockup)");
  eq(fmtClock(pace(pb)), "1:40:05.3", "pace at the end = the final time");
  const slow: RelayState = { ...pb, last: { kind: "finish", index: 11 }, splits: pb.splits.map((t, i) => (i === 11 ? pb.segments[11].pbMs! + 5000 : t)) };
  ok(!isNewPb(slow), "slower than the PB isn't a PB");
  ok(isNewPb({ ...slow, segments: slow.segments.map((s) => ({ ...s, pbMs: null })) }), "a first finish is a PB");
  ok(isNewPb({ ...slow, last: { kind: "finish", index: 11, pb: true } }), "the relay's pb flag wins");

  // Ticks: done splits colored, the current one lit, skips.
  eq(ticks(mid), ["ahead", "behind", "gold", "ahead", "ahead", "behind", "gold", "now", "next", "next", "next", "next"], "ticks mid-run");
  const skipped: RelayState = { ...mid, splits: mid.splits.map((t, i) => (i === 4 ? null : t)) };
  eq(ticks(skipped)[4], "skip", "a skipped split");
  eq(timeBefore(skipped, 5), mid.splits[3], "time before a skip goes back to the last real split");

  // ── Rows: all of them up to the limit, then a window with the final split pinned ──
  eq(visibleRows(12, 7, 15), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], "12 splits all show");
  const r48 = visibleRows(48, 0, 15);
  eq(r48.length, 15, "48 splits: 15 rows");
  eq(r48.at(-1), 47, "the final split is pinned");
  eq(r48[0], 0, "starts at the top before a run");
  const r48m = visibleRows(48, 30, 15);
  ok(r48m.includes(30) && r48m.includes(31) && r48m.includes(32) && r48m.includes(33), "the current split and three coming up show");
  eq(r48m.at(-1), 47, "still pinned");
  const r48e = visibleRows(48, 48, 15);
  eq(r48e, [...Array.from({ length: 14 }, (_, i) => 33 + i), 47], "at the end: the last rows");
  for (let n = 1; n <= 80; n++) for (let c = 0; c <= n; c++) {
    const rows = visibleRows(n, c, 13);
    if (rows.length !== Math.min(n, 13) || new Set(rows).size !== rows.length || rows.some((r, i) => i > 0 && r <= rows[i - 1]) || rows.at(-1) !== n - 1 || (c < n && !rows.includes(c))) {
      fail++; console.log("FAIL rows", n, c, rows); break;
    } else pass++;
  }

  // ── Moments ──
  const gold = demoState("gold");
  eq(momentFor({ ...gold, seq: 99, last: { kind: "split", index: 5 } }, gold), "gold", "a gold split plays");
  eq(momentFor(null, gold), null, "the first state never plays one");
  eq(momentFor(gold, gold), null, "the same state again doesn't");
  const plain: RelayState = { ...mid, last: { kind: "split", index: 6, gold: false } };
  eq(momentFor({ ...plain, seq: 99 }, plain), null, "a plain split doesn't");
  eq(momentFor({ ...pb, seq: 99, phase: "running", last: { kind: "split", index: 10 } }, pb), "pb", "a new PB plays");
  eq(momentFor({ ...slow, seq: 99, phase: "running" }, { ...slow, seq: 100, phase: "ended" }), null, "a slower finish doesn't");
  eq(momentFor(demoState("reset"), demoAfterReset()), "reset", "a reset mid-run plays");
  eq(momentFor({ ...demoAfterReset(), seq: 50 }, demoAfterReset()), null, "a reset with nothing running doesn't");

  // ── The webhook's attempt plan ──
  eq(attemptPlan("start", { ...mid, attempt: 313 }), { kind: "open", attempt: 313 }, "start opens");
  eq(attemptPlan("split", mid), { kind: "progress", attempt: 312, splits: mid.splits }, "split keeps the times");
  eq(attemptPlan("undo", mid).kind, "progress", "undo keeps the times");
  eq(attemptPlan("skip", mid).kind, "progress", "skip keeps the times");
  const fin = attemptPlan("finish", pb);
  eq(fin, { kind: "close", attempt: 312, result: "finished", splits: pb.splits, finalMs: pb.splits.at(-1), pb: true }, "finish closes with the final time and PB");
  const finSlow = attemptPlan("finish", slow);
  ok(finSlow.kind === "close" && !finSlow.pb, "a slow finish isn't a PB");
  const rs = attemptPlan("reset", demoAfterReset());
  eq(rs, { kind: "close", attempt: 311, result: "reset", splits: null, finalMs: null, pb: false }, "a reset after cleared splits keeps the saved ones");
  const rs2 = attemptPlan("reset", { ...demoState("reset"), last: { kind: "reset", index: 4 } });
  ok(rs2.kind === "close" && Array.isArray(rs2.splits) && rs2.finalMs != null, "a reset with splits keeps them");
  eq(attemptPlan("connect", mid), { kind: "none" }, "connect touches no attempt");
  eq(attemptPlan("disconnect", mid), { kind: "none" }, "disconnect touches no attempt");

  ok(isRelayState(mid), "a state");
  ok(!isRelayState({ seq: 1 }), "not a state");
  ok(!isRelayState(null), "null isn't a state");

  // ── Looks and fields from untrusted input ──
  eq(cleanLook(null), DEFAULT_LOOK, "nothing = the default look");
  eq(DEFAULT_LOOK.stats, { pb: true, sob: true, attempts: true, prevSegment: false, pace: false }, "PB, sum of best and attempts by default (picks)");
  eq(DEFAULT_LOOK.layout, "column", "the Column by default");
  eq(DEFAULT_LOOK.position, "bottom", "the Strip sits at the bottom by default");
  eq(cleanLook({ layout: "strip", position: "top", stats: { pace: true, pb: "yes" } }), { layout: "strip", position: "top", stats: { pb: true, sob: true, attempts: true, prevSegment: false, pace: true }, ...DEFAULT_SPEEDRUN_STYLE, line: null }, "partial look");
  eq(cleanLook({ layout: "sideways", position: "left" }).layout, "column", "an unknown layout");
  {
    const paid = cleanLook({ colors: "custom", custom: ["#112233", "#445566"], fill: "dots", font: "bebas", border: "two", brand: "off", surface: "light" });
    eq(speedrunPaidUsed(paid), ["your two colors", "dots behind it", "Bebas Neue", "a two-color border", "no GameShuffle line"], "paid choices named");
    const free = freeSpeedrunLook(paid);
    eq([free.colors, free.fill, free.font, free.border, free.brand, free.surface], ["gs", "glyphs", "rubik", "none", "inside", "light"], "the free version keeps the free choices");
    eq(speedrunPaidUsed(free), [], "and has nothing paid");
    eq(speedrunPaidUsed(cleanLook({ colors: "accent", accent: "#FF8800", fill: "solid", font: "gabarito", brand: "mark", surface: "glass" })), [], "your color, solid, GameShuffle's font, the mark: free");
    eq(cleanLook({ accent: "#FF8800" }).accent, "#ff8800", "colors are kept lowercase");
    eq(cleanLook({ line: "  Road   to sub 1:40  " }).line, "Road to sub 1:40", "a line of your own, tidied");
    eq(speedrunPaidUsed(cleanLook({ line: "Road to sub 1:40" })), ["your own line"], "a line of your own is paid");
    eq(freeSpeedrunLook(cleanLook({ line: "x", brand: "mark" })).brand, "mark", "the mark stays on the free version");
    eq(cleanLook({ font: "comic", fill: "picture", surface: "neon", border: "three" }), cleanLook({}), "odd values fall back");
    const v = speedrunVars(cleanLook({ colors: "accent", accent: "#ff8800" }));
    eq(v["--sr-hl"], "#ff8800", "your color lights the current row");
    eq(/^rgba\(\d+, \d+, \d+, [\d.]+\)$/.test(v["--sr-now-1"]), true, "colors are plain rgba for OBS's older Chromium");
    eq(speedrunVars(cleanLook({ surface: "light" }))["--sr-bg"], "#f5f6fb", "the light surface");
  }
  eq(cleanLook({ theme: "Neon!" }).colors, "gs", "an odd theme id falls back to GameShuffle blue");
  eq(cleanLook({ theme: "neon" }).colors, "neon", "a theme saved before the launch becomes the colors");
  eq(cleanLook({ line: "  x".padEnd(80, "y") }).line?.length, 40, "a line is 40 characters at most");
  eq(cleanCategory("  48 Tracks\n 150cc  "), "48 Tracks 150cc", "category tidied");
  eq(cleanCategory("x".repeat(200))?.length, 80, "category cut to 80");
  eq(cleanCategory("   "), null, "blank category");
  eq(cleanCategory(5), null, "a number isn't a category");
  eq(keepSegments([{ name: "A", pbMs: 1.4, bestMs: Infinity } as never]), [{ name: "A", pbMs: 1, bestMs: null }], "segments kept tidy");
  eq(baseForAttempts(300, { attempts: 0, base: 0 }), 300, "attempts so far before any run");
  eq(baseForAttempts(300, { attempts: 5, base: 0 }), 295, "five starts already counted");
  eq(baseForAttempts(2, { attempts: 10, base: 0 }), 0, "never below zero");
  eq(baseForAttempts(500, { attempts: 312, base: 300 }), 488, "a base set before");

  // ── Step 2: settings ──
  eq(cleanSettings(null), DEFAULT_SETTINGS, "nothing = the default settings");
  eq(DEFAULT_SETTINGS, { prediction: { on: false, lockSplit: null }, commands: { pb: true, pace: true, splits: true }, replyDelay: 5, timer: { choice: "livesplit", auto: { game: false, category: false }, typedAttempts: false, from: null } }, "defaults: prediction off, commands on, 5 seconds (mockup)");
  eq(cleanSettings({ prediction: { on: "yes", lockSplit: 2.5 }, replyDelay: 7, commands: { pace: false } }), { prediction: { on: false, lockSplit: null }, commands: { pb: true, pace: false, splits: true }, replyDelay: 5, timer: { choice: "livesplit", auto: { game: false, category: false }, typedAttempts: false, from: null } }, "odd values fall back");
  eq(cleanSettings({ replyDelay: 60, prediction: { on: true, lockSplit: 3 } }).replyDelay, 60, "60 seconds is on offer");
  eq(cleanSettings({ replyDelay: 61 }).replyDelay, 5, "61 isn't");
  eq(mergeSettings(DEFAULT_SETTINGS, { prediction: { on: true } }), { ...DEFAULT_SETTINGS, prediction: { on: true, lockSplit: null } }, "a partial change keeps the rest");
  eq(mergeSettings({ ...DEFAULT_SETTINGS, prediction: { on: true, lockSplit: 4 } }, { commands: { splits: false } }).prediction.lockSplit, 4, "a commands change keeps the lock split");

  // Typed splits for the phone remote.
  eq(cleanSplitNames("Luigi Raceway\n\n  Moo Moo   Farm \r\nKoopa Troopa Beach"), ["Luigi Raceway", "Moo Moo Farm", "Koopa Troopa Beach"], "one per line, tidied");
  eq(cleanSplitNames("   \n  "), null, "nothing typed");
  eq(cleanSplitNames(Array.from({ length: 501 }, (_, i) => `S${i}`)), null, "501 is too many");
  eq(cleanSplitNames(["x".repeat(200)])?.[0].length, 120, "a name is 120 characters at most");
  const segs4 = mid.segments.slice(0, 4);
  eq(segmentsForNames(segs4.map((x) => x.name), segs4), segs4, "the same names keep their times");
  eq(segmentsForNames(["A", "B"], segs4), [{ name: "A", pbMs: null, bestMs: null }, { name: "B", pbMs: null, bestMs: null }], "new names start fresh");

  // The lock split: a quarter of the way in, never before split 2, never the last.
  eq(lockAfter(12, null), 3, "12 splits lock after split 3 (picks)");
  eq(lockAfter(16, null), 4, "16 splits: 4");
  eq(lockAfter(4, null), 2, "4 splits: 2, never 1 (it opens after split 1)");
  eq(lockAfter(3, null), 2, "3 splits: 2");
  eq(lockAfter(2, null), null, "2 splits: no prediction");
  eq(lockAfter(12, 9), 9, "the streamer's choice");
  eq(lockAfter(12, 12), 11, "never the last split");
  eq(lockAfter(12, 1), 2, "never split 1");
  eq(splitsDone(mid), 7, "seven done on Lightning");
  eq(splitsDone(pb), 12, "all done at the end");
  eq(splitsDone(fresh), 0, "none before a run");

  // The prediction's plan (picks: opens after split 1, locks after the lock split, settles at the finish, refunds a
  // reset before the lock, settles a reset after it as no PB).
  const at = (i: number): RelayState => ({ ...mid, phase: "running", index: i });
  const OPEN = { status: "open" as const, lockPending: false };
  eq(predictionAction("split", at(1), 3, null), { kind: "open" }, "split 1 opens it");
  eq(predictionAction("split", at(2), 3, null), { kind: "open" }, "a missed open still opens before the lock");
  eq(predictionAction("split", at(3), 3, null), { kind: "none" }, "too late once the lock split is done");
  eq(predictionAction("split", at(2), 3, OPEN), { kind: "none" }, "open until the lock split");
  eq(predictionAction("split", at(3), 3, OPEN), { kind: "lock" }, "the lock split locks it");
  eq(predictionAction("skip", at(3), 3, OPEN), { kind: "lock" }, "a skip past it locks it too");
  eq(predictionAction("split", at(4), 3, { status: "open", lockPending: true }), { kind: "none" }, "already locking");
  eq(predictionAction("split", at(1), null, null), { kind: "none" }, "a short run has no prediction");
  eq(predictionAction("finish", pb, 3, { status: "locked", lockPending: false }), { kind: "settle", winner: "pb" }, "a PB finish settles as PB");
  eq(predictionAction("finish", slow, 3, { status: "locked", lockPending: false }), { kind: "settle", winner: "no" }, "a slow finish settles as no PB");
  eq(predictionAction("reset", at(2), 3, OPEN), { kind: "refund" }, "a reset before the lock gives tokens back");
  eq(predictionAction("reset", at(4), 3, { status: "open", lockPending: true }), { kind: "settle", winner: "no" }, "a reset inside the delay after the lock counts as locked");
  eq(predictionAction("reset", at(5), 3, { status: "locked", lockPending: false }), { kind: "settle", winner: "no" }, "a reset after the lock is no PB");
  eq(predictionAction("reset", at(5), 3, { status: "settled", lockPending: false }), { kind: "none" }, "already settled");
  eq(predictionAction("undo", at(2), 3, OPEN), { kind: "none" }, "undo changes nothing");
  eq(predictionAction("start", at(0), 3, null), { kind: "none" }, "start opens nothing");

  // ── Chat lines (mockup screen 6) ──
  eq(pbLine({ name: "Nova", game: "Mario Kart 8 Deluxe", category: "48 Tracks", segments: mid.segments, sobMs: sumOfBest(mid), setOn: "Nov 2" }),
    "🏆 Nova's PB in Mario Kart 8 Deluxe, 48 Tracks: 1:40:24.1, set Nov 2. Sum of best: 1:39:17.8.", "!pb (mockup)");
  eq(pbLine({ name: "Nova", game: "", category: "", segments: noPb.segments, sobMs: null, setOn: null }), "🏆 Nova hasn't finished a run yet.", "!pb with no PB");
  eq(pbLine({ name: "Nova", game: "X", category: "", segments: [], sobMs: null, setOn: null }), "🏆 No splits from Nova yet.", "!pb with no splits");
  eq(fmtClock(sobOf(mid.segments)), fmtClock(mid.segments.at(-1)!.bestMs), "sum of best from the run alone");
  eq(paceLine(mid), "⏱️ Leaf done, 8.1 ahead of PB. On pace for 1:40:16.0 if the rest matches the PB.", "!pace (mockup)");
  eq(paceLine(fresh), "⏱️ No run going right now. PB: 1:40:24.1.", "!pace before a run");
  eq(paceLine(pb), "⏱️ Finished in 1:40:05.3, a new PB by 18.8.", "!pace after a PB");
  ok(paceLine(slow).includes("behind the PB"), "!pace after a slow finish");
  eq(splitsLine(mid), "📋 Mushroom ▼2.3 · Flower ▲1.0 · Star ▼7.3 ⭐ · Special ▼4.5 · Shell ▼3.1 · Banana ▲1.2 · Leaf ▼8.1 ⭐ · now Lightning", "!splits (mockup)");
  eq(splitsLine(skipped).includes("Shell skipped"), true, "a skipped split says so");
  eq(splitsLine(fresh), "📋 No run going right now.", "!splits before a run");
  const long: RelayState = { ...mid, segments: Array.from({ length: 60 }, (_, i) => ({ name: `Segment number ${i + 1}`, pbMs: (i + 1) * 60_000, bestMs: (i + 1) * 59_000 })), splits: Array.from({ length: 60 }, (_, i) => (i < 55 ? (i + 1) * 60_500 : null)), golds: Array(60).fill(false), index: 55 };
  const longLine = splitsLine(long);
  ok(longLine.length <= CHAT_MAX, `a long run fits a chat message (${longLine.length})`);
  ok(longLine.startsWith("📋 … · ") && longLine.endsWith("now Segment number 56"), "a long run keeps the latest splits");

  // ── The prediction's words ──
  const tally = (pbT: number, pbN: number, noT: number, noN: number) => [{ optionKey: "pb", total: pbT, bettorCount: pbN }, { optionKey: "no", total: noT, bettorCount: noN }];
  const base = { id: "m1", attempt: 312, lockAfter: 3, lockName: "Star", endedAt: null };
  const openV = predictionView({ ...base, status: "open", resolvedValue: null, pools: tally(3806, 34, 2434, 24) });
  eq([openV.pbPct, openV.total, openV.people], [61, 6240, 58], "the live page's numbers (mockup)");
  eq(predictionWords(openV), { kind: "tally", title: "Chat: 61% say PB", status: "Open", line: "6,240 tokens in · locks after Star", pct: 61 }, "the overlay while open");
  const lockedV = predictionView({ ...base, status: "locked", resolvedValue: null, pools: tally(11789, 170, 6631, 98) });
  eq(predictionWords(lockedV).line, "18,420 tokens in · settles at the finish", "the overlay once locked (mockup)");
  eq(predictionWords(lockedV, { short: true }).line, "18,420 tokens · locked", "the Strip's shorter line (mockup)");
  eq(predictionLockLine(lockedV), "🔒 Bets are locked: 64% say PB, 18,420 tokens in. It settles when the run ends.", "the lock line (mockup)");
  eq(predictionWords(predictionView({ ...base, status: "open", resolvedValue: null, pools: tally(0, 0, 0, 0) })).line, "!bet pb 100 or !bet no 100 · locks after Star", "no bets yet: how to bet");
  const wonV = predictionView({ ...base, status: "settled", resolvedValue: "pb", endedAt: 1, pools: tally(11789, 268, 6631, 98) });
  ok(chatCalledIt(wonV), "most tokens on PB and it was a PB: chat called it");
  eq(predictionWords(wonV), { kind: "won", title: "Chat called it", line: "268 people split 18,420 tokens", pct: null }, "the overlay after a PB (mockup)");
  eq(predictionSettleLine(wonV, { finalMs: 6_005_300, oldPbMs: 6_024_100 }), "🎉 New PB! 1:40:05.3, 18.8 faster. 268 people who said PB split 18,420 tokens.", "the PB line (mockup)");
  const noV = predictionView({ ...base, status: "settled", resolvedValue: "no", endedAt: 1, pools: tally(6000, 90, 9860, 151) });
  ok(chatCalledIt(noV), "most tokens on no and no PB: chat called it");
  const missV = predictionView({ ...base, status: "settled", resolvedValue: "no", endedAt: 1, pools: tally(11789, 268, 9860, 151) });
  ok(!chatCalledIt(missV), "most on PB, no PB: chat missed it");
  eq(predictionWords(missV), { kind: "settled", title: "No PB this run", line: "151 people who said no split 21,649 tokens", pct: null }, "the overlay after a reset (mockup)");
  eq(predictionSettleLine(missV, { resetAt: "Shell" }), "🔁 Run reset at Shell. No PB this time. 151 people who said no split 21,649 tokens.", "the reset line (mockup)");
  ok(predictionSettleLine(missV, { finalMs: 6_100_000, oldPbMs: 6_024_100 }).startsWith("🏁 Finished in 1:41:40.0, no PB this time."), "a slow finish line");
  const oneSided = predictionView({ ...base, status: "settled", resolvedValue: "pb", endedAt: 1, pools: tally(500, 3, 0, 0) });
  eq(oneSided.result?.refunded, true, "one side only: everyone got their own back");
  ok(predictionSettleLine(oneSided, { finalMs: 1, oldPbMs: 2 }).includes("everyone has their tokens back"), "and the line says so");
  eq(predictionWords(predictionView({ ...base, status: "cancelled", resolvedValue: "claim:refund", endedAt: 1, pools: tally(10, 1, 0, 0) })).title, "Bets returned", "a refund before the lock");
  eq(PREDICTION_REFUND_LINE, "↩️ Reset before the bets locked. Everyone has their tokens back.", "the refund line (mockup)");
  eq(predictionOpenLine("Nova", "gameshuffle.co/live/novastreams"), "🔮 Prediction: will Nova PB this run? Type !bet pb 100 or !bet no 100 · or pick on gameshuffle.co/live/novastreams", "the open line (mockup)");

  // What a stake would come back as (the live page's "about 162").
  eq(payoutIfWon(100, "pb", 3806, 2434), 162, "100 on PB now comes back as about 162 (mockup)");
  eq(payoutIfWon(100, "no", 3806, 2434), 250, "100 on no: 6,340 × 100 / 2,534");
  eq(payoutIfWon(100, "pb", 500, 0), 100, "nobody on the other side: your own back");

  // ── The parimutuel payout (markets engine fix: binary markets split the whole pot) ──
  const W = new Set(["o-pb"]);
  const plan = parimutuel([
    { identity_id: "a", outcome_id: "o-pb", amount: 100 },
    { identity_id: "b", outcome_id: "o-pb", amount: 300 },
    { identity_id: "c", outcome_id: "o-no", amount: 600 },
  ], W);
  eq(plan.kind, "payout", "a two-sided market pays out");
  eq([...plan.credits.entries()].sort(), [["a", 250], ["b", 750]], "winners split all 1,000 by stake");
  eq(plan.pot, 1000, "the pot");
  eq(plan.winners, 2, "two winners");
  const dust = parimutuel([
    { identity_id: "a", outcome_id: "o-pb", amount: 1 },
    { identity_id: "b", outcome_id: "o-pb", amount: 1 },
    { identity_id: "c", outcome_id: "o-pb", amount: 1 },
    { identity_id: "d", outcome_id: "o-no", amount: 1 },
  ], W);
  eq([...dust.credits.values()].reduce((x, y) => x + y, 0), 4, "every token is paid, dust included");
  eq(dust.credits.get("a"), 2, "dust goes to the largest stake (ties: the lowest id)");
  const same = parimutuel([{ identity_id: "a", outcome_id: "o-pb", amount: 50 }, { identity_id: "b", outcome_id: "o-pb", amount: 70 }], W);
  eq([same.kind, [...same.credits.entries()].sort()], ["refund", [["a", 50], ["b", 70]]], "everyone right: stakes back");
  const wrong = parimutuel([{ identity_id: "a", outcome_id: "o-no", amount: 50 }, { identity_id: "a", outcome_id: "o-no", amount: 25 }], W);
  eq([wrong.kind, wrong.credits.get("a")], ["refund", 75], "everyone wrong: stakes back, summed per person");
  eq(parimutuel([], W).kind, "refund", "nobody bet");
  const multi = parimutuel([
    { identity_id: "a", outcome_id: "o-pb", amount: 100 },
    { identity_id: "a", outcome_id: "o-pb", amount: 100 },
    { identity_id: "b", outcome_id: "o-no", amount: 200 },
    { identity_id: "a", outcome_id: "o-no", amount: 100 },
  ], W);
  eq(multi.credits.get("a"), 500, "a hedger's winning stake takes the whole pot");
  for (let k = 0; k < 200; k++) {
    const bets = Array.from({ length: 1 + (k % 9) }, (_, i) => ({ identity_id: `p${(i * 7 + k) % 5}`, outcome_id: i % 2 ? "o-pb" : "o-no", amount: 1 + ((i * 37 + k * 13) % 997) }));
    const r = parimutuel(bets, W);
    const paid = [...r.credits.values()].reduce((x, y) => x + y, 0);
    if (paid !== bets.reduce((x, b) => x + b.amount, 0)) { fail++; console.log("FAIL parimutuel sum", k, paid); break; } else pass++;
  }

  // ── GameShuffle for LiveSplit: the add-on's info fills game, category and attempts (picks 2026-11-10) ──
  eq(cleanSettings({}).timer, { choice: "livesplit", auto: { game: false, category: false }, typedAttempts: false, from: null }, "timer settings default to LiveSplit first");
  eq(cleanSettings({ timer: { choice: "lso" } }).timer.choice, "lso", "LiveSplit One can lead");
  const typed = cleanSettings({ timer: { choice: "livesplit", auto: { game: true }, typedAttempts: true, from: { game: "X", attempts: 3, at: "t" } } });
  eq(mergeSettings(typed, { timer: { choice: "lso", auto: { game: false }, typedAttempts: false, from: null } }).timer,
    { ...typed.timer, choice: "lso" }, "the page can only change which timer leads");
  eq(cleanTimerInfo({ game: "x" }), null, "info without the add-on's version isn't info");
  eq(cleanTimerInfo({ addon: "1.0.0", game: " Super  Mario Odyssey ", category: "Any%", attempts: 312, runKey: "17-abc", remote: false }),
    { addon: "1.0.0", game: "Super Mario Odyssey", category: "Any%", attempts: 312, runKey: "17-abc", remote: false }, "info tidied");
  eq(cleanTimerInfo({ addon: "1", attempts: -1 })?.attempts, null, "a negative attempt count is dropped");
  const info = { addon: "1.0.0", game: "Super Mario Odyssey", category: "Any%", attempts: 312, runKey: "17-abc", remote: true };
  const stored = (n: string) => (n === "Super Mario Odyssey" ? "super-mario-odyssey" : n);
  const blank = { game: null, category: null, attempts: 0, attemptBase: 0, settings: DEFAULT_SETTINGS };
  const f1 = applyTimerInfo(blank, info, stored, "now");
  eq([f1.game, f1.category, f1.attempts, f1.attemptBase], ["super-mario-odyssey", "Any%", 312, 312], "a blank setup takes LiveSplit's game, category and attempts");
  eq(f1.settings.timer.auto, { game: true, category: true }, "and remembers they came from LiveSplit");
  eq(f1.settings.timer.from, { game: "Super Mario Odyssey", category: "Any%", attempts: 312, at: "now" }, "and what LiveSplit said");
  const afterFill = { game: "super-mario-odyssey", category: "Any%", attempts: 312, attemptBase: 312, settings: f1.settings };
  const f2 = applyTimerInfo(afterFill, { ...info, game: "Celeste", category: "Any% (No Bubs)" }, stored, "later");
  eq([f2.game, f2.category], ["Celeste", "Any% (No Bubs)"], "another splits file moves LiveSplit-filled game and category");
  const typedSetup = { game: "Mario Kart 8 Deluxe", category: "48 Tracks", attempts: 40, attemptBase: 40, settings: DEFAULT_SETTINGS };
  const f3 = applyTimerInfo(typedSetup, info, stored, "now");
  eq([f3.game, f3.category], [undefined, undefined], "what the runner typed stays");
  eq(f3.attempts, 312, "attempts never typed: LiveSplit's higher count is taken");
  eq(applyTimerInfo({ ...typedSetup, attempts: 500 }, info, stored, "now").attempts, undefined, "the count never goes down");
  const typedCount = { ...typedSetup, settings: { ...DEFAULT_SETTINGS, timer: { ...DEFAULT_SETTINGS.timer, typedAttempts: true } } };
  eq(applyTimerInfo(typedCount, info, stored, "now").attempts, undefined, "a typed count wins over LiveSplit's");
  const quiet = applyTimerInfo(blank, { ...info, game: null, category: null, attempts: null }, stored, "now");
  eq([quiet.game, quiet.category, quiet.attempts, quiet.settings.timer.from], [undefined, undefined, undefined, null], "sharing off changes nothing and forgets what LiveSplit said");
  eq(applyTimerInfo({ ...blank, attempts: 10, attemptBase: 4 }, info, stored, "now").attemptBase, 306, "the base keeps the attempts GameShuffle saw itself");

  // The run card (live page + Twitch extension).
  eq(runCardRows(3, 1), [0, 1, 2], "run card: a short run shows every split");
  eq(runCardRows(16, 0), [0, 1, 2, 3, 4], "run card: the start shows the first five");
  eq(runCardRows(16, 7), [5, 6, 7, 8, 9], "run card: two before and two after the split being run");
  eq(runCardRows(16, 15), [11, 12, 13, 14, 15], "run card: the end keeps five rows");
  for (let n = 1; n <= 40; n++) for (let c = 0; c < n; c++) {
    const rows = runCardRows(n, c);
    if (rows.length !== Math.min(5, n) || !rows.includes(c) || rows.some((r, i) => r < 0 || r >= n || (i && r !== rows[i - 1] + 1))) { eq(rows, "five in a row with the current", `run card rows ${n}/${c}`); break; }
  }
  const pace4 = (index: number, ahead: boolean, phase: RelayState["phase"] = "running"): RelayState => {
    const segments = Array.from({ length: 8 }, (_, i) => ({ name: `S${i}`, pbMs: (i + 1) * 60_000, bestMs: (i + 1) * 55_000 }));
    return { v: 1, seq: 1, connected: true, phase, index, elapsedMs: index * 60_000, at: 0, game: null, category: null, attempt: 1, segments,
      splits: segments.map((s, i) => (i < index ? s.pbMs! + (ahead ? -2000 : 2000) : null)), golds: segments.map(() => false), last: null };
  };
  eq(onPbPace(pace4(6, true)), true, "on PB pace: ahead with a quarter left");
  eq(onPbPace(pace4(5, true)), false, "not yet: more than a quarter left");
  eq(onPbPace(pace4(6, false)), false, "behind is never on pace");
  eq(onPbPace(pace4(6, true, "paused")), false, "a paused run shows no badge");
  const going = pace4(3, true);
  eq(runShown(going, 10 * RUN_SHOWN_AFTER_MS), true, "the card shows while a run is going, however long");
  const done = { ...pace4(8, true, "ended"), at: 1_000 };
  eq([runShown(done, 1_000 + RUN_SHOWN_AFTER_MS - 1), runShown(done, 1_000 + RUN_SHOWN_AFTER_MS)], [true, false], "a finished run stays two minutes");
  const reset = { ...pace4(0, false, "idle"), at: 1_000, last: { kind: "reset" as const, index: 3 } };
  eq([runShown(reset, 2_000), runShown({ ...reset, last: null }, 2_000)], [true, false], "a reset shows two minutes; a timer sitting idle never does");

  // LiveSplit's groups (templates picks 7A): plain names on stream, each split keeping its cup.
  eq(readSplitName("-Water Park"), { name: "Water Park", sub: true, closes: null }, "a subsplit");
  eq(readSplitName("{Mushroom Cup} Thwomp Ruins"), { name: "Thwomp Ruins", sub: false, closes: "Mushroom Cup" }, "a group's last split");
  eq(readSplitName("{Mushroom Cup}"), { name: "Mushroom Cup", sub: false, closes: "Mushroom Cup" }, "a group mark with no name keeps the group's");
  eq([shownName("-"), shownName("Kingdom 1"), shownName("  -Cap ")], ["-", "Kingdom 1", "Cap"], "plain names stay, a lone dash stays");
  const lsNames = ["-Mario Kart Stadium", "-Water Park", "-Sweet Sweet Canyon", "{Mushroom Cup} Thwomp Ruins", "Intermission", "-Mario Circuit", "{Flower Cup}Toad Harbor"];
  eq(groupsOf(lsNames), ["Mushroom Cup", "Mushroom Cup", "Mushroom Cup", "Mushroom Cup", null, "Flower Cup", "Flower Cup"], "groups per split");
  const shown = shownState({ ...demoState("mid"), segments: lsNames.map((name) => ({ name, pbMs: null, bestMs: null })), splits: lsNames.map(() => null), golds: lsNames.map(() => false) });
  eq(shown.segments.map((x) => x.name), ["Mario Kart Stadium", "Water Park", "Sweet Sweet Canyon", "Thwomp Ruins", "Intermission", "Mario Circuit", "Toad Harbor"], "a state shows plain names");
  eq(shownState(shown).segments.map((x) => x.group), shown.segments.map((x) => x.group), "showing twice changes nothing");
  eq(groupedNames([{ group: "Mushroom Cup", names: ["A", "B"] }, { group: null, names: ["C"] }, { group: "Solo", names: ["D"] }]), ["-A", "{Mushroom Cup} B", "C", "D"], "writing groups (a group of one stays plain)");
  eq(namesToGroups(groupedNames([{ group: "Shell Cup", names: ["X", "Y"] }, { group: null, names: ["Z"] }])), [{ group: "Shell Cup", names: ["X", "Y"] }, { group: null, names: ["Z"] }], "and back");

  // Templates (picks 1-3): from our own game data.
  const mk8 = templatesFor("Mario Kart 8 Deluxe")!;
  eq(mk8.templates.map((t) => t.id), ["48-tracks", "nitro", "retro", "bonus", "booster", "96-tracks", "cup"], "MK8DX templates");
  const t48 = buildTemplate(mk8.templates[0], { speed: "150cc", items: false });
  eq([t48.count, t48.category, t48.names[0], t48.names[3]], [48, "48 Tracks · 150cc · No Items", "-Mario Kart Stadium", "{Mushroom Cup} Thwomp Ruins"], "48 Tracks: every track, cups as groups");
  eq(new Set(buildTemplate(mk8.templates[5]).names.map(shownName)).size, 96, "96 Tracks: every name different (repeated tracks get their console)");
  eq(buildTemplate(mk8.templates[5]).names.map(shownName).filter((n) => n.endsWith("Rainbow Road")), ["Rainbow Road", "N64 Rainbow Road", "SNES Rainbow Road", "3DS Rainbow Road", "Wii Rainbow Road"], "Rainbow Roads by console");
  eq(buildTemplate(mk8.templates[0], { byCup: true }).names.slice(0, 3), ["Mushroom Cup", "Flower Cup", "Star Cup"], "one split a cup");
  const oneCup = buildTemplate(mk8.templates[6], { cup: 13, items: true });
  eq([oneCup.category, oneCup.names.map(shownName)], ["Lucky Cat Cup · Items", ["Tokyo Blur", "Shroom Ridge", "Sky Garden", "Ninja Hideaway"]], "one cup, picked");
  eq([templatesFor("mkworld")?.templates[0].name, buildTemplate(templatesFor("mkworld")!.templates[0]).count], ["32 Tracks", 32], "Mario Kart World 32 Tracks");
  eq(buildTemplate(templatesFor("mk64")!.templates[0]).count, 16, "Mario Kart 64 16 Tracks");
  eq(buildTemplate(templatesFor("kar")!.templates[0]).count, 18, "Kirby Air Riders 18 courses");
  const frlg = buildTemplate(templatesFor("Pokémon FireRed & LeafGreen")!.templates[0]);
  eq([frlg.count, frlg.category, frlg.names.map(shownName).at(-1)], [13, "Any%", "Champion"], "Fire Red Any%");
  const leaders = (frlgRun as { segments: { milestone?: { type?: string; leader?: string } }[] }).segments.filter((x) => x.milestone?.type === "gym").map((x) => x.milestone!.leader);
  eq(FRLG_GYMS, leaders, "the Gym Leaders match the Fire Red run's data");
  eq(templatesFor("Super Mario Odyssey"), null, "no list for other games");
  eq(numberedSplits({ name: "Kingdom", from: 1, to: 3, last: "Bowser's Kingdom" }), ["Kingdom 1", "Kingdom 2", "Kingdom 3", "Bowser's Kingdom"], "the number builder");
  eq([numberedSplits({ name: "", from: 1, to: 3 }), numberedSplits({ name: "W", from: 5, to: 2 }), numberedSplits({ name: "W", from: 1, to: 600 })], [null, null, null], "the builder refuses what can't be made");

  // LiveSplit files (picks 4A, 5A).
  eq([lssTime("00:08:00.1000000"), lssTime("1.02:03:04.5"), lssTime("nope")], [480_100, 93_784_500, null], "LiveSplit times");
  const file = writeLss({ game: "Mario Kart 8 Deluxe", category: "48 Tracks · 150cc", names: t48.names.slice(0, 4).concat(["Fish & Chips <3"]) });
  const back = readLss(file)!;
  eq([back.game, back.category, back.attempts, back.segments.map((x) => x.name)], ["Mario Kart 8 Deluxe", "48 Tracks · 150cc", 0, [...t48.names.slice(0, 4), "Fish & Chips <3"]], "a written file reads back (names escaped)");
  eq(back.segments.every((x) => x.pbMs === null && x.bestMs === null), true, "a template file has no times");
  const timed = `<?xml version="1.0"?><Run version="1.7.0"><GameName>Super Mario Odyssey</GameName><CategoryName>Any%</CategoryName><AttemptCount>312</AttemptCount><Segments>
    <Segment><Name>Cap</Name><SplitTimes><SplitTime name="Personal Best"><RealTime>00:03:10.5000000</RealTime></SplitTime></SplitTimes><BestSegmentTime><RealTime>00:03:05.0000000</RealTime></BestSegmentTime><SegmentHistory><Time id="1"><RealTime>00:09:00</RealTime></Time></SegmentHistory></Segment>
    <Segment><Name>Cascade</Name><SplitTimes><SplitTime name="Personal Best"><GameTime>00:07:00.2500000</GameTime></SplitTime></SplitTimes><BestSegmentTime><RealTime>00:03:50.0000000</RealTime></BestSegmentTime></Segment>
    <Segment><Name>Sand</Name><SplitTimes><SplitTime name="Personal Best" /></SplitTimes><BestSegmentTime /></Segment>
  </Segments></Run>`;
  const r = readLss(timed)!;
  eq([r.game, r.category, r.attempts], ["Super Mario Odyssey", "Any%", 312], "a runner's file: game, category, attempts");
  eq(r.segments, [{ name: "Cap", pbMs: 190_500, bestMs: 185_000 }, { name: "Cascade", pbMs: 420_250, bestMs: 415_000 }, { name: "Sand", pbMs: null, bestMs: null }], "PB splits, best segments added up, a split with none");
  eq([readLss("<html></html>"), readLss("<Run><Segments></Segments></Run>")], [null, null], "not a splits file");
  eq(lssFileName("Mario Kart 8 Deluxe", "48 Tracks: 150cc"), "Mario Kart 8 Deluxe - 48 Tracks 150cc.lss", "file name");
  eq(cleanImportedRun({ segments: r.segments, game: r.game, category: r.category, attempts: r.attempts })?.segments.length, 3, "an imported run is taken");
  eq([cleanImportedRun({ segments: [] }), cleanImportedRun({ segments: [{ name: "" }] }), cleanImportedRun(null)], [null, null, null], "an empty or nameless run is refused");
  eq(cleanImportedRun({ segments: [{ name: "A", pbMs: -5, bestMs: "x" }], attempts: -2 }), { segments: [{ name: "A", pbMs: null, bestMs: null }], game: null, category: null, attempts: 0 }, "bad times become no time");

  console.log(`speedrun: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
