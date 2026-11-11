/**
 * The speedrun posts on the GameShuffle Competitive bot (speedrun Discord picks 2026-11-10): new PB and pace alert
 * wording, the one split a pace alert fires on, the recap's "Speedrun tonight" line and the server settings.
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-speedrun-discord.ts
 */
import { pacePostEmbed, paceMoment, pbPostEmbed, speedrunTonightLine } from "../src/lib/speedrun/discordPosts";
import { EMPTY_COMP_SPEEDRUN, readCompSpeedrun } from "../src/lib/speedrun/compDiscord";
import type { RelayState } from "../src/lib/speedrun/types";

let pass = 0, fail = 0;
const eq = (got: unknown, want: unknown, label: string) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.log(`✗ ${label}\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`); }
};

// Eight splits, a minute each at PB, best segments 55 seconds (both comparisons are cumulative, as LiveSplit keeps them).
const segments = Array.from({ length: 8 }, (_, i) => ({ name: `S${i + 1}`, pbMs: (i + 1) * 60_000, bestMs: (i + 1) * 55_000 }));
const run = (reached: number, gap: number, extra: Partial<RelayState> = {}): RelayState => ({
  v: 1, seq: 1, connected: true, phase: "running", index: reached, elapsedMs: reached * 60_000, at: 0, game: null, category: null, attempt: 313,
  segments, splits: segments.map((s, i) => (i < reached ? s.pbMs! + gap : null)), golds: segments.map(() => false),
  last: reached ? { kind: "split", index: reached - 1 } : null, ...extra,
});

// Pace: the split that leaves a quarter (6 of 8 done), only while ahead, only on a split.
eq(paceMoment(run(6, -12_400)), true, "pace: ahead at 6 of 8");
eq(paceMoment(run(5, -12_400)), false, "pace: not before a quarter is left");
eq(paceMoment(run(7, -12_400)), false, "pace: once per run, not on later splits");
eq(paceMoment(run(6, 3_000)), false, "pace: behind posts nothing");
eq(paceMoment(run(6, -12_400, { last: { kind: "undo", index: 5 } })), false, "pace: an undo isn't the moment");
const pace = pacePostEmbed({ name: "Nova", game: "Super Mario Odyssey", category: "Any%", st: run(6, -12_400), cover: null });
eq([pace.title, pace.description], ["Nova is on PB pace", "Super Mario Odyssey · Any%: 12.4 ahead with 2 splits left."], "pace post wording");

// A new PB: 6:56.6 against an 8:00.0 PB, the first three segments gold (50 seconds against a best of 55).
const done: RelayState = {
  ...run(8, 0), phase: "ended", index: null, last: { kind: "finish", index: 7, pb: true },
  splits: [50_000, 100_000, 150_000, 205_000, 260_000, 315_000, 370_000, 416_600],
  golds: segments.map((_, i) => i < 3),
};
const pb = pbPostEmbed({ name: "Nova", game: "Super Mario Odyssey", category: "Any%", st: done, cover: "https://x/y.webp" });
eq(pb.title, "Nova got a new PB", "PB post title");
eq(pb.description, "Super Mario Odyssey · Any% in **6:56.6**, 1:03.4 faster. Attempt 313, 3 gold splits.", "PB post line");
eq(pb.fields?.map((f) => `${f.name}=${f.value}`), ["New PB=6:56.6", "Was=8:00.0", "Sum of best=7:05.0"], "PB post fields");
eq(pb.thumbnail?.url, "https://x/y.webp", "PB post shows the box art");
const first = pbPostEmbed({ name: "Nova", game: "", category: "", st: { ...done, segments: segments.map((s) => ({ ...s, pbMs: null })), golds: segments.map(() => false) }, cover: null });
eq([first.description, first.fields?.map((f) => f.name)], ["Speedrun in **6:56.6**. Attempt 313.", ["New PB", "Sum of best"]], "a first finished run has no Was");

// The recap's line.
const best = segments.map((s, i) => ({ ...s, bestMs: (i + 1) * 50_000 }));
eq(speedrunTonightLine([], best), null, "no attempts: no field");
eq(speedrunTonightLine([
  { result: "reset", final_ms: 120_000, pb: false, splits: [60_000, 120_000] },
  { result: "finished", final_ms: 470_000, pb: false, splits: [50_000, 110_000, null, 230_000] },
  { result: "finished", final_ms: 459_000, pb: true, splits: [55_000, 105_000, 165_000] },
], best), "3 attempts · best run 7:39.0, a new PB · 2 gold splits", "recap: attempts, the best run, a PB and golds");
eq(speedrunTonightLine([{ result: "reset", final_ms: 5_000, pb: false, splits: [] }], best), "1 attempt · no finished runs", "recap: resets only");

// Settings.
eq(readCompSpeedrun(undefined), EMPTY_COMP_SPEEDRUN, "settings: none is everything off");
eq(readCompSpeedrun({ speedrun: { pbs: true, pace: "yes", paceRole: "12345678" } }), { pbs: true, pace: false, paceRole: "12345678" }, "settings: only real values count");
eq(readCompSpeedrun({ speedrun: { paceRole: "@everyone" } }).paceRole, null, "settings: a role must be an id");

console.log(`speedrun discord: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
