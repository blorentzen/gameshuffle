// Head-to-head rooms (speedrun races picks 2026-11-10): codes, settings, whether a runner can start, standings and gaps
// at the same split, final places, the bet options and the race posts.
//   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-versus.ts
import {
  betLockAt, cleanCode, cleanVersusSettings, finalResults, fmtGap, fmtValue, laneAsOf, laneClockMs, matchBetOption, outLine, raceBetOptions, rankFor, roomCode,
  speedrunReadiness, standings, CODE_RE, teamStandings,
} from "../src/lib/versus/rules";
import { nameList, raceResultsEmbed, raceStartEmbed } from "../src/lib/versus/discord";
import type { Lane, LaneLive, RoomEntrant, RoomView } from "../src/lib/versus/types";

let pass = 0, fail = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) === JSON.stringify(b)) pass++;
  else { fail++; console.log(`✗ ${m}\n   got  ${JSON.stringify(a)}\n   want ${JSON.stringify(b)}`); }
};
const ok = (c: boolean, m: string) => eq(c, true, m);

const live = (over: Partial<LaneLive> = {}): LaneLive => ({
  seq: 1, connected: true, mode: "addon", canStart: true, remotes: 0, phase: "idle", index: null, elapsedMs: 0, at: 0, count: 4, splits: [], last: null, attempt: 1, ...over,
});
const lane = (over: Partial<Lane> = {}): Lane => ({ status: "running", attempt: 1, reached: 0, times: [], finalMs: null, outAt: null, outReason: null, endedAt: null, tieMs: null, current: null, live: null, ...over });
const ent = (key: string, l: Lane, delayMs = 0): RoomEntrant => ({ key, name: key[0].toUpperCase() + key.slice(1), color: null, source: "relay", relayId: "AAAAAAAAAAAAAAAA", delayMs, ready: true, lane: l });
const CPS = ["Cap", "Cascade", "Sand", "Lake"];

// ── Codes and settings ──
let r = 0;
const seq = () => (r = (r + 0.37) % 1);
eq(roomCode("Super Mario Odyssey", seq).slice(0, 4), "SMO-", "the game's initials");
eq(roomCode("Celeste", seq).slice(0, 4), "CEL-", "one word: its first three letters");
eq(roomCode(null, seq).slice(0, 3), "GS-", "no game: GS");
eq(roomCode("Mario Kart 8 Deluxe", seq).slice(0, 4), "MK8-", "digits count as initials");
for (let i = 0; i < 500; i++) {
  const c = roomCode(["Celeste", "Super Mario 64", "Portal", "x", ""][i % 5], Math.random);
  ok(CODE_RE.test(c) && !/[IO01]/.test(c.slice(-3)), `code ${c} is readable`);
}
eq(cleanCode(" smo-4kq "), "SMO-4KQ", "a typed code is tidied");
eq(cleanCode("SMO4KQ"), null, "the dash matters");
eq(cleanVersusSettings({ max: 12, join: "invite", bets: true }), { join: "invite", max: 8, bets: true }, "8 runners at most");
eq(cleanVersusSettings({ max: 1 }), { join: "link", max: 2, bets: false }, "2 at least; link and no bets by default");
eq(cleanVersusSettings(null), { join: "link", max: 4, bets: false }, "4 by default");

// ── Can this runner start? ──
eq(speedrunReadiness(null, 4).problem, "not_connected", "no relay state yet");
eq(speedrunReadiness(live({ connected: false, mode: "remote", remotes: 0 }), 4).problem, "not_connected", "no timer and no phone remote");
eq(speedrunReadiness(live({ connected: false, mode: "remote", remotes: 1 }), 4), { ok: true, line: "Phone remote · 4 splits", problem: null }, "the phone remote counts");
eq(speedrunReadiness(live({ canStart: false }), 4).problem, "no_control", "the add-on's remote switch off");
eq(speedrunReadiness(live({ count: 3 }), 4), { ok: false, line: "LiveSplit connected · 3 splits (needs 4)", problem: "splits" }, "split count must match");
eq(speedrunReadiness(live({ phase: "running" }), 4).problem, "not_at_zero", "a timer already going");
eq(speedrunReadiness(live({ mode: "lso" }), 4).line, "LiveSplit One connected · 4 splits", "LiveSplit One by name");
eq(speedrunReadiness(live({ count: 1 }), 4).line, "LiveSplit connected · 1 split (needs 4)", "one split");

// ── Standings ──
const nova = lane({ reached: 3, times: [100, 250, 400, null] });
const sam = lane({ reached: 3, times: [110, 260, 427, null] });
const riley = lane({ reached: 2, times: [120, 290, null, null] });
const kit = lane({ status: "out", reached: 1, times: [130, null, null, null], outAt: 1, outReason: "reset" });
let rows = standings([ent("kit", kit), ent("riley", riley), ent("sam", sam), ent("nova", nova)], 4);
eq(rows.map((x) => x.key), ["nova", "sam", "riley", "kit"], "furthest first, then less time at the same split, anyone out last");
eq(rows.map((x) => x.place), [1, 2, 3, null], "nobody out is placed");
eq(rows[0].leader && rows[0].gapMs === null, true, "the leader has no gap");
eq(rows[1].gapMs, 27, "Sam: 27 behind Nova at the same split");
eq(rows[1].gapAt, null, "same split as the leader: no 'at'");
eq(rows[2].gapMs, 40, "Riley: measured at their last split");
eq(rows[2].gapAt, 1, "Riley's gap is at an earlier split");
eq(outLine(kit.outReason, kit.outAt, CPS), "Forfeited at Cascade", "where Kit reset");
// A skipped split: compared at the last one with a time.
const skip = lane({ reached: 3, times: [100, null, 410, null] });
rows = standings([ent("nova", nova), ent("skip", skip)], 4);
eq(rows[1].timeMs, 410, "a skipped split doesn't hide the time");
// Finishers first, by final time.
const done1 = lane({ status: "done", reached: 4, times: [100, 250, 400, 600], finalMs: 600 });
const done2 = lane({ status: "done", reached: 4, times: [90, 240, 390, 590], finalMs: 590 });
rows = standings([ent("a", nova), ent("b", done1), ent("c", done2)], 4);
eq(rows.map((x) => x.key), ["c", "b", "a"], "finishers first, fastest first");
eq(rows[1].gapMs, 10, "a finisher's gap is to the winner's final time");
eq(rows[2].place, 3, "someone still going is placed after the finishers");
eq(standings([], 4), [], "nobody: no rows");

// ── The finish ──
const view: RoomView = {
  v: 1, seq: 9, roomId: "AbCdEfGh12345678", kind: "speedrun", title: "Super Mario Odyssey · Any%", checkpoints: CPS, unit: "ms",
  status: "finished", startAt: 1, startedAt: 1, finishedAt: 2, now: 3,
  entrants: [ent("kit", kit), ent("b", done1), ent("c", done2), ent("timeout", lane({ status: "out", reached: 2, times: [1, 2, null, null], outAt: 2, outReason: "timeout" }))],
};
const final = finalResults(view);
eq(final.map((f) => [f.userId, f.place, f.finalMs]), [["c", 1, 590], ["b", 2, 600], ["timeout", null, null], ["kit", null, null]], "only finishers place; the rest by how far they got");
eq(final.find((f) => f.userId === "kit")?.outReason, "reset", "why they stopped is kept");

// ── Bets ──
eq(betLockAt(17), 5, "17 splits: a quarter in");
eq(betLockAt(4), 1, "4 splits: after the first");
eq(betLockAt(2), 1, "2 splits");
eq(betLockAt(1), 1, "1 split");
const opts = raceBetOptions([{ key: "u1", name: "Nova" }, { key: "u2", name: "Sam!!" }, { key: "u3", name: "nova" }, { key: "u4", name: "☆☆" }]);
eq(opts.map((o) => o.option_key), ["nova", "sam", "nova3", "r4"], "options chat can type, never twice");
eq(matchBetOption(opts, "@NOVA"), "nova", "a name, any case, with @");
eq(matchBetOption(opts, "2"), "sam", "a runner's number");
eq(matchBetOption(opts, "9"), null, "no runner 9");
eq(matchBetOption(opts, "pb"), null, "pb isn't a runner");
eq(matchBetOption(opts, undefined), null, "nothing typed");

// ── Watching after the stream delay ──
const h = [{ at: 1000, entrant: ent("nova", lane({ reached: 1 })) }, { at: 2000, entrant: ent("nova", lane({ reached: 2 })) }, { at: 3000, entrant: ent("nova", lane({ reached: 3 })) }];
eq(laneAsOf(h, 3500, 1000)?.lane.reached, 2, "a 1s delay shows the state from a second ago");
eq(laneAsOf(h, 3500, 0)?.lane.reached, 3, "no delay: the latest");
eq(laneAsOf(h, 1200, 5000)?.lane.reached, 1, "nothing that old yet: the oldest known");
eq(laneClockMs(lane({ live: live({ phase: "running", elapsedMs: 1000, at: 5000 }) }), 6500), 2500, "a running lane's clock ticks on the room's clock");
eq(laneClockMs(lane({ status: "done", finalMs: 777 }), 9e9), 777, "a finished lane stops");
eq(laneClockMs(lane({ status: "waiting", live: live({ phase: "idle" }) }), 1), 0, "before the start: 0:00");

// ── Race posts ──
eq(nameList(["Nova", "Riley", "Sam", "Kit"]), "Nova, Riley, Sam and Kit", "names in a sentence");
eq(nameList(["Nova"]), "Nova", "one name");
const start = raceStartEmbed({ title: "Super Mario Odyssey · Any%", names: ["Nova", "Sam"], startedAt: 1_700_000_000_000, cover: null });
eq(start.title, "Race starting: Super Mario Odyssey · Any%", "start title");
ok(/^Nova and Sam\. Started <t:1700000000:t>\.$/.test(start.description ?? ""), "start line with a Discord time");
const res = raceResultsEmbed({ title: view.title, view, pbs: new Map([["c", 595]]), cover: null });
eq(res.title, "C won the race", "the winner");
eq(res.description, "Super Mario Odyssey · Any% in **0:00.5**, a new PB.", "their time and a new PB");
eq(res.fields?.map((f) => f.name), ["1st", "2nd", "Didn't finish"], "places, then who didn't finish");
ok((res.fields?.[2].value ?? "").includes("Kit: Forfeited at Cascade"), "who didn't finish, and why");
const none = raceResultsEmbed({ title: "X", view: { ...view, entrants: [ent("kit", kit)] }, pbs: new Map(), cover: null });
eq(none.title, "Race over: nobody finished", "nobody finished");

// ── Duels (duels picks 2026-11-11): a win first, then fewer turns, then less time; losers placed by cards knocked out ──
const TEAM = ["Spiritomb", "Roserade", "Gastrodon", "Lucario", "Milotic", "Garchomp"];
const won = (turns: number, ms: number) => lane({ status: "done", reached: 6, times: [1, 2, 4, 5, 6, turns], finalMs: turns, tieMs: ms });
const lost = (reached: number, ms: number) => lane({ status: "out", reached, outAt: reached, outReason: "lost", times: [1, 3, null, null, null, null].slice(0, 6), tieMs: ms });
const duelRows = standings([ent("slow", won(9, 100_000)), ent("lose2", lost(2, 50_000)), ent("tie", won(8, 160_000)), ent("fast", won(8, 150_000)), ent("lose1", lost(1, 10_000)), ent("left", lane({ status: "out", reached: 4, outAt: 4, outReason: "left" }))], 6, rankFor("duel"));
eq(duelRows.map((x) => x.key), ["fast", "tie", "slow", "lose2", "lose1", "left"], "duel: wins by turns, then time; losses by cards down; leaving last");
eq(duelRows.map((x) => x.place), [1, 2, 3, 4, 5, null], "duel: a loss still places; leaving doesn't");
eq(standings([ent("a", lost(2, 1))], 6).map((x) => x.place), [null], "a speedrun gives anyone out no place");
const duelView: RoomView = { ...view, kind: "duel", unit: "turns", checkpoints: TEAM, title: "Duel: Cynthia", entrants: [ent("fast", won(8, 150_000)), ent("lose2", lost(2, 50_000))] };
eq(finalResults(duelView).map((f) => [f.userId, f.place, f.finalMs]), [["fast", 1, 8], ["lose2", 2, null]], "duel results place the loser");
eq(outLine("lost", 2, TEAM), "Lost at Gastrodon", "where a duel was lost");
eq(fmtValue(8, "turns"), "8 turns", "turns");
eq(fmtValue(1, "turns"), "1 turn", "one turn");
eq(fmtGap(2, "turns"), "2 turns", "a gap in turns");
eq(fmtValue(61_500, "ms"), "1:01.5", "a time");
eq(cleanVersusSettings({ duel: { trainerId: "cynthia-platinum", level: "hard", month: "2026-11-01" } }).duel, { trainerId: "cynthia-platinum", month: "2026-11-01", level: "hard" }, "a duel's settings");
eq(cleanVersusSettings({ duel: { trainerId: "Cynthia!", month: "2026-11-01" } }).duel, undefined, "a bad team id is dropped");
eq(cleanVersusSettings({ duel: { trainerId: "cynthia-platinum", month: "2026-11" } }).duel, undefined, "a month is stored as its first day");
const duelStart = raceStartEmbed({ title: "Duel: Cynthia", names: ["Nova", "Sam"], startedAt: null, cover: null, duel: true });
eq(duelStart.title, "Duel starting: Cynthia", "a duel's start post");
const duelRes = raceResultsEmbed({ title: "Duel: Cynthia", view: duelView, pbs: new Map(), cover: null });
eq([duelRes.title, duelRes.description], ["Fast won the duel", "Duel: Cynthia in **8 turns**."], "a duel's result post counts turns");
eq(duelRes.footer?.text, "Duel · GameShuffle", "and says duel");
eq(duelRes.fields?.map((f) => [f.name, f.value]), [["1st", "Fast 8 turns"], ["2nd", "Lose2, lost (2 of 6 down)"]], "a duel's loser is placed in the post");

// ---- Team races (co-op pick 6) ----
{
  const n = 3;
  const rows = standings([
    { key: "a1", lane: lane({ status: "done", reached: 3, times: [10, 20, 30], finalMs: 30 }) },
    { key: "a2", lane: lane({ status: "done", reached: 3, times: [12, 24, 36], finalMs: 36 }) },
    { key: "b1", lane: lane({ status: "done", reached: 3, times: [9, 18, 25], finalMs: 25 }) },
    { key: "b2", lane: lane({ status: "out", reached: 1, times: [11], outReason: "reset", outAt: 1 }) },
    { key: "c1", lane: lane({ status: "running", reached: 2, times: [10, 21] }) },
  ], n);
  const teamOf = (k: string) => ({ a: 1, b: 2, c: 3 })[k[0] as "a" | "b" | "c"];
  const total = teamStandings(rows, teamOf, "total");
  eq(total.map((t) => [t.team, t.place, t.value]), [[1, 1, 66], [3, null, null], [2, null, null]], "total: only a team where everyone finished has a total; still running before a team with someone out");
  const best = teamStandings(rows, teamOf, "best");
  eq(best.map((t) => [t.team, t.place, t.value]), [[2, 1, 25], [1, 2, 30], [3, null, null]], "best: the team's fastest finisher");
  eq(teamStandings(rows, () => null, "total"), [], "no teams without team picks");
  eq(cleanVersusSettings({ max: 6, teams: { count: 3, score: "best" } }).teams, { count: 3, score: "best" }, "team settings");
  eq(cleanVersusSettings({ max: 2, teams: { count: 4 } }).teams, { count: 2, score: "total" }, "never more teams than runners");
  eq(cleanVersusSettings({ teams: { count: 5 } }).teams, undefined, "2 to 4 teams");
  eq(cleanVersusSettings({ battle: { group: "gym" }, teams: { count: 2 } }).teams, undefined, "no teams in a trainer battle");
}

console.log(`versus: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
