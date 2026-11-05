/**
 * Team series rules: the ban and protect draft, a night's standings, predictions and pot splits.
 * Run: npx tsx scripts/test-series.ts
 */

import assert from "node:assert/strict";
import {
  applyPick, checkPick, emptyDraft, onClock, openTracks, orderFromStandings, pauseDraft, draftPool, protectNeeded,
  randomPick, readDraft, resumeDraft, secondsLeft, startDraft, teamForTurn, timedOut, totalTurns, turnTeams, undoTurn, orderValid,
} from "../src/lib/series/draft";
import {
  bestCreator, championFromResults, defaultLine, finishOptions, inkOn, mostImproved, nightResult, placesWithTies,
  predictionWinners, seriesTotal, splitPot, winnerOptions, type NightResult,
} from "../src/lib/series/rules";
import { baseBank, bankCups, cleanBank, seriesTracks, trackName } from "../src/lib/series/tracks";
import { readSettings } from "../src/lib/series/view";

let checks = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); checks++; };
const eq = <T>(a: T, b: T, msg: string) => { assert.deepEqual(a, b, msg); checks++; };

// ── Tracks ──
const bank = baseBank();
eq(bank.length, 48, "base bank is 48");
eq(seriesTracks().length, 96, "96 tracks in all");
eq(new Set(seriesTracks().map((t) => trackName(t.id))).size, 96, "every track name is unique (console prefixes)");
eq(bankCups(bank).length, 12, "base bank is 12 cups");
ok(bankCups(bank).every((c) => c.tracks.length === 4), "four tracks a cup");
eq(cleanBank(["nope", bank[3], bank[1], bank[1]]), [bank[1], bank[3]], "cleanBank keeps known ids once, in game order");
eq(readSettings({}).bank.length, 48, "settings default to the base bank");
eq(readSettings({ lines: { competitive: "110.3", creator: -4 } }).lines, { competitive: 110.5, creator: null }, "lines round to halves, bad ones drop");

// ── Snake order ──
const teams = ["A", "B", "C", "D", "E", "F"];
eq([0, 1, 5, 6, 7, 11, 12].map((i) => teamForTurn(teams, i)), ["A", "B", "F", "F", "E", "A", "A"], "snake order");
const d0 = { ...emptyDraft(bank), order: teams };
eq(totalTurns(d0), 24, "48 to 24 is 24 turns");
const tt = turnTeams(d0);
for (const t of teams) eq(tt.filter((x) => x === t).length, 4, `four turns for ${t}`);
ok(orderValid(teams, [...teams].reverse()), "order valid");
ok(!orderValid(["A", "A", "B", "C", "D", "E"], teams), "order with a repeat is invalid");
eq(orderFromStandings(["A", "B", "C"]), ["C", "B", "A"], "last place first");

// ── A full draft, every turn timed out ──
let d = startDraft(d0, new Date("2027-07-12T00:00:00Z"));
eq(d.status, "running", "running after start");
eq(onClock(d), "A", "A first");
eq(checkPick(d, "B", bank[0], bank[1]), "not_your_turn", "B can't pick on A's turn");
eq(checkPick(d, "A", bank[0], bank[0]), "same_track", "ban and protect differ");
eq(checkPick(d, "A", "nope", bank[1]), "bad_ban", "unknown ban");
eq(checkPick(d, "A", bank[0], null), "protect_needed", "protect needed while two or more are open");
d = applyPick(d, "A", bank[0], bank[1], "u1", false);
eq(checkPick(d, "B", bank[1], bank[2]), "bad_ban", "a protected track can't be banned");
eq(checkPick(d, "B", bank[2], bank[0]), "bad_protect", "a banned track can't be protected");
for (let i = 1; i < 24; i++) {
  const team = onClock(d)!;
  const pick = randomPick(d, `t:${i}`)!;
  eq(checkPick(d, team, pick.ban, pick.protect), null, `random pick ${i} is legal`);
  d = applyPick(d, team, pick.ban, pick.protect, null, true);
}
eq(d.status, "done", "done after 24 turns");
eq(onClock(d), null, "nobody on the clock when done");
eq(draftPool(d).length, 24, "24 tracks in the pool");
eq(openTracks(d).length, 0, "nothing open at the end (every track banned or protected)");
eq(new Set(d.turns.map((t) => t.ban)).size, 24, "24 different bans");
ok(draftPool(d).every((id) => d.turns.some((t) => t.protect === id)), "every pool track was protected");
eq(randomPick(d, "x"), null, "no random pick when nothing is open");
eq(randomPick({ ...d0, turns: [] }, "s1"), randomPick({ ...d0, turns: [] }, "s1"), "random pick is seeded");

// ── Undo, pause, timeout ──
const u = undoTurn(d, new Date());
eq(u.turns.length, 23, "undo takes one turn back");
eq(u.status, "running", "undo reopens a finished draft");
ok(protectNeeded(u), "two open tracks on the last turn: protect still needed");
const t0 = Date.parse("2027-07-12T00:00:00Z");
let p = startDraft({ ...d0 }, new Date(t0));
eq(secondsLeft(p, t0 + 15_000), 45, "45 seconds left after 15");
ok(!timedOut(p, t0 + 61_000), "not timed out inside the grace");
ok(timedOut(p, t0 + 63_000), "timed out after the grace");
p = pauseDraft(p, t0 + 20_000);
eq(p.status, "paused", "paused");
eq(p.pausedLeft, 40, "40 left when paused");
ok(!timedOut(p, t0 + 999_000), "a paused draft never times out");
p = resumeDraft(p, t0 + 500_000);
eq(secondsLeft(p, t0 + 500_000), 40, "resumes with 40 left");
eq(readDraft(JSON.parse(JSON.stringify(d)))?.turns.length, 24, "a stored draft reads back");
eq(readDraft({}), null, "an empty draft is nothing");

// ── A smaller bank (target above half: open tracks stay in the pool) ──
const small = { ...emptyDraft(bank.slice(0, 10), 7), order: ["A", "B"] };
let s = startDraft(small);
eq(totalTurns(s), 3, "10 to 7 is three turns");
for (let i = 0; i < 3; i++) { const pk = randomPick(s, `s${i}`)!; s = applyPick(s, onClock(s)!, pk.ban, pk.protect, null, true); }
eq(draftPool(s).length, 7, "seven in the pool");
eq(openTracks(s).length, 4, "four never touched, still in the pool");

// ── A night's standings ──
const T = [{ id: "ta", n: 1, name: "Kart Club", tag: "KC", color: "#2f6fe4" }, { id: "tb", n: 2, name: "Night Owls", tag: "NO", color: "#7c4ddb" }, { id: "tc", n: 3, name: "Red Shells", tag: "RS", color: "#d63a3a" }];
const P = [
  { id: "p1", display_name: "raven", team: 1, user_id: "u1" }, { id: "p2", display_name: "peachy", team: 1, user_id: "u2" },
  { id: "p3", display_name: "owl", team: 2, user_id: "u3" }, { id: "p4", display_name: "cass", team: 2, user_id: null },
  { id: "p5", display_name: "shell", team: 3, user_id: "u5" }, { id: "p6", display_name: "mia", team: 3, user_id: "u6" },
];
const table = [15, 12, 10, 9, 8, 7];
const race = (n: number, order: string[]) => ({ id: `r${n}`, race_number: n, placements: Object.fromEntries(order.map((pid, i) => [pid, i + 1])) });
const r1 = nightResult({ teams: T, participants: P, races: [], scoringTable: table, raceCount: 2 });
eq(r1.state, "upcoming", "no races: upcoming");
eq(r1.teams.map((x) => x.points), [0, 0, 0], "all zero before racing");
eq(r1.teams.map((x) => x.place), [1, 1, 1], "all share first before racing");
const races = [race(1, ["p1", "p3", "p5", "p2", "p4", "p6"]), race(2, ["p3", "p1", "p2", "p5", "p6", "p4"])];
const r2 = nightResult({ teams: T, participants: P, races: races.slice(0, 1), scoringTable: table, raceCount: 2 });
eq(r2.state, "live", "one of two races: live");
eq(r2.teams[0], { teamId: "ta", n: 1, points: 24, last: 24, place: 1 }, "Kart Club 15+9");
const r3 = nightResult({ teams: T, participants: P, races, scoringTable: table, raceCount: 2 });
eq(r3.state, "done", "both races: done");
eq(r3.teams.map((x) => [x.teamId, x.points, x.place, x.last]), [["ta", 46, 1, 22], ["tb", 42, 2, 22], ["tc", 34, 3, 17]], "standings after two");
eq(placesWithTies([{ points: 9 }, { points: 7 }, { points: 7 }, { points: 1 }]).map((x) => x.place), [1, 2, 2, 4], "ties share");
eq(nightResult({ teams: T, participants: P, races: races.slice(0, 1), raceCount: 12, tournamentStatus: "complete" }).state, "done", "a completed tournament is done");

// Total and champions
const kickoff = r3;
const final = nightResult({ teams: T, participants: P, races: [race(1, ["p5", "p6", "p3", "p1", "p4", "p2"]), race(2, ["p6", "p5", "p3", "p1", "p2", "p4"])], scoringTable: table, raceCount: 2 });
eq(final.teams.map((x) => x.teamId), ["tc", "tb", "ta"], "Red Shells win the Final");
eq(championFromResults(T, [{ counts: false, result: kickoff }, { counts: true, result: final }]), "tc", "Final only: Red Shells");
eq(seriesTotal(T, [{ counts: false, result: kickoff }, { counts: true, result: final }]), null, "no total with one counted night");
const tot = seriesTotal(T, [{ counts: true, result: kickoff }, { counts: true, result: final }])!;
eq(tot.map((x) => [x.teamId, x.points]), [["tc", 88], ["ta", 79], ["tb", 77]], "both nights added");
eq(championFromResults(T, [{ counts: true, result: kickoff }, { counts: true, result: r2 }]), null, "no champion while a counted night runs");
eq(mostImproved(kickoff, final), { teamId: "tc", climbed: 2 }, "Red Shells climbed two");
eq(bestCreator([{ id: "a", role: "creator", points: 30 }, { id: "b", role: "creator", points: 41 }, { id: "c", role: "competitive", points: 90 }]), { playerId: "b", points: 41 }, "best creator");
eq(bestCreator([{ id: "a", role: "creator", points: 30 }, { id: "b", role: "creator", points: 30 }]), null, "a tie has no best creator");

// ── Predictions ──
eq(finishOptions(6).map((o) => o.label), ["1st", "2nd", "3rd", "4th", "5th", "6th"], "finish options");
eq(winnerOptions(T).map((o) => o.key), ["t1", "t2", "t3"], "winner keys by team number");
eq(defaultLine(null, 12, 12), 81.5, "default line for 12 races of 12");
const winnersOf = (kind: "team_finish" | "night_winner" | "player_points", res: NightResult, extra: Partial<{ teamId: string; userId: string; name: string; line: number; participantIds: string[] }> = {}) =>
  predictionWinners({ kind, teamId: extra.teamId ?? null, userId: extra.userId ?? null, name: extra.name ?? null, line: extra.line ?? null, participantIds: extra.participantIds }, res, T);
eq(winnersOf("team_finish", final, { teamId: "ta" }), ["3"], "Kart Club third");
eq(winnersOf("night_winner", final), ["t3"], "Red Shells win the night");
eq(winnersOf("player_points", final, { userId: "u5", line: 25.5 }), ["over"], "shell over 25.5 (15+12=27)");
eq(winnersOf("player_points", final, { name: "cass", line: 25.5 }), ["under"], "cass by name, under");
eq(winnersOf("player_points", final, { participantIds: ["p6"], line: 26.5 }), ["over"], "mia by participant, 27 over 26.5");
const tied = nightResult({ teams: T.slice(0, 2), participants: P.slice(0, 4), races: [race(1, ["p1", "p3", "p4", "p2"])], scoringTable: [10, 6, 4, 0], raceCount: 1 });
eq(winnersOf("night_winner", tied), ["t1", "t2"], "a tie for first: both win");

// Pot splits
const stakes = [
  { identityId: "x", option: "1", amount: 100 }, { identityId: "y", option: "2", amount: 300 },
  { identityId: "z", option: "1", amount: 50 }, { identityId: "x", option: "1", amount: 50 },
];
const sp = splitPot(stakes, ["1"]);
eq(sp.refunded, false, "winners split");
eq(Object.fromEntries(sp.payouts), { x: 375, z: 125 }, "500 split 150:50");
eq(Object.fromEntries(splitPot([{ identityId: "a", option: "1", amount: 10 }, { identityId: "b", option: "1", amount: 10 }, { identityId: "c", option: "1", amount: 10 }, { identityId: "d", option: "2", amount: 70 }], ["1"]).payouts), { a: 34, b: 33, c: 33 }, "rounding dust goes to one winner");
eq([...sp.payouts.values()].reduce((a, b) => a + b, 0), 500, "the whole pot goes out");
const none = splitPot(stakes, ["6"]);
eq(none.refunded, true, "nobody right: refunded");
eq(Object.fromEntries(none.payouts), { x: 150, y: 300, z: 50 }, "everyone back what they put in");
eq(splitPot([], ["1"]).payouts.size, 0, "empty pot pays nobody");
eq(Object.fromEntries(splitPot([{ identityId: "a", option: "1", amount: 7 }, { identityId: "b", option: "2", amount: 3 }], ["1", "2"]).payouts), { a: 7, b: 3 }, "two winning options share by stake");

// Colors
eq(inkOn("#ffffff"), "#141a2e", "dark text on white");
eq(inkOn("#141a2e"), "#ffffff", "white on navy");
eq(inkOn("#b98a06"), "#141a2e", "dark text on gold");

console.log(`series: ${checks} checks passed`);
