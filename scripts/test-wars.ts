/**
 * War scoring checks: npx tsx scripts/test-wars.ts
 * The places reader against the cases Sokuji and Quaxly agree on, the race and war math, and the codes.
 */

import {
  maxSwing, placeName, raceLine, raceScore, readRaceLine, readSpots, readTrack, RACE_TOTAL, spotsCode, spotsFromCode,
  standing, suggestTracks, tapClashes, tapsToSpots, type WarRace,
} from "../src/lib/wars/rules";
import { cleanFlagCode, fillFromRows, formatTable, parseTable, placesOf, swapTeams, tableIssues, tagFromFile, teamTotal } from "../src/lib/wars/table";
import { readWarSlug, warPagePath, warShort } from "../src/lib/wars/page";
import { headlineFor, leads, playerRows, tapGrid, waitingOn } from "../src/lib/wars/roomView";

let pass = 0;
let fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log(`FAIL ${label}\n  got  ${g}\n  want ${w}`); }
}
const spots = (t: string) => { const r = readSpots(t); return r.ok ? r.spots : r.error; };

// The shorthand (cases from the research notes, checked against both bots' rules)
eq("1-378", spots("1-378"), [1, 2, 3, 7, 8, 12]);
eq("12378", spots("12378"), [1, 2, 3, 7, 8, 12]);
eq("1237812", spots("1237812"), [1, 2, 3, 7, 8, 12]);
eq("-379", spots("-379"), [1, 2, 3, 7, 9, 12]);
eq("357-", spots("357-"), [3, 5, 7, 8, 9, 10]);
eq("1234 topped up", spots("1234"), [1, 2, 3, 4, 11, 12]);
eq("110", spots("110"), [1, 10, 9, 11, 12, 8].sort((a, b) => a - b));
eq("0 is 10th", spots("123450"), [1, 2, 3, 4, 5, 10]);
eq("+ is 11th", spots("12379+"), [1, 2, 3, 7, 9, 11]);
eq("1112", spots("5671112"), [5, 6, 7, 11, 12, 10].sort((a, b) => a - b));
eq("111", spots("111456"), [1, 4, 5, 6, 11, 12]);
eq("112 is 1st and 12th", spots("112345"), [1, 3, 4, 5, 11, 12]);
eq("12 after another place is 12th", spots("345612"), [3, 4, 5, 6, 12, 11].sort((a, b) => a - b));
eq("124680", spots("124680"), [1, 2, 4, 6, 8, 10]);
eq("hex a b c", spots("1234ab"), [1, 2, 3, 4, 10, 11]);
eq("seven places keep the best six", spots("1234567"), [1, 2, 3, 4, 5, 6]);
eq("trailing range to 12", spots("7-"), [7, 8, 9, 10, 11, 12]);
eq("spaces as pieces", spots("1-3 7 8 12"), [1, 2, 3, 7, 8, 12]);
eq("commas as pieces", spots("1,2,4,7,8,9"), [1, 2, 4, 7, 8, 9]);
eq("explicit 10 11 12", spots("6 7 8 9 10 12"), [6, 7, 8, 9, 10, 12]);
eq("dash kinds", spots("1–378"), [1, 2, 3, 7, 8, 12]);
eq("13 in pieces", readSpots("1 13").ok, false);
eq("letters", readSpots("abcx").ok, false);
eq("empty", readSpots("  ").ok, false);
const topped = readSpots("1234");
eq("topped note", topped.ok && topped.note, "1234 read as 1, 2, 3, 4, 11, 12: the last places filled the rest.");
eq("12378 leaves out 12th quietly", (readSpots("12378") as { note: string | null }).note, null);
eq("six exact has no note", (readSpots("124680") as { note: string | null }).note, null);

// Every six-place set written plainly reads back as itself
let roundTrips = 0;
for (let mask = 0; mask < 1 << 12; mask++) {
  const set = Array.from({ length: 12 }, (_, i) => i + 1).filter((p) => mask & (1 << (p - 1)));
  if (set.length !== 6) continue;
  const r = readSpots(set.join(" "));
  if (r.ok && JSON.stringify(r.spots) === JSON.stringify(set)) roundTrips++;
  eq(`code ${set}`, spotsFromCode(spotsCode(set)), set);
}
eq("all 924 sets read back", roundTrips, 924);

// Race math
eq("race total", RACE_TOTAL, 82);
eq("max swing", maxSwing(), 40);
eq("race +20", raceScore([1, 2, 4, 7, 8, 9]), { us: 51, them: 31, diff: 20 });
eq("race -12", raceScore([3, 6, 7, 8, 9, 10]).diff, -12);
eq("race tie", raceScore([1, 4, 5, 8, 9, 12]).diff, (15 + 9 + 8 + 5 + 4 + 1) * 2 - 82);

// The walkthrough's war: Kart Club 522, Night Owls 462
const SETS = [
  [1, 2, 4, 7, 8, 9], [1, 2, 3, 5, 6, 11], [3, 6, 7, 8, 9, 10], [1, 2, 3, 7, 8, 12], [1, 2, 4, 6, 8, 10], [1, 2, 3, 7, 9, 11],
];
const race = (n: number, s: number[], track: string | null = null): WarRace => ({ n, spots: s, track, by: { id: "1", name: "Riley" }, at: "" });
const six = SETS.map((s, i) => race(i + 1, s));
const after6 = standing(six);
eq("after 6", [after6.us, after6.them, after6.diff, after6.left], [289, 203, 86, 6]);
eq("need after 6", after6.need, { side: "them", avg: 15 });
eq("not decided after 6", after6.decided, null);
// Find six more races that land on 522 to 462 and decide it after race 11.
const wantDiffs = [-8, 4, -14, 2, -6, -4];
const pool: number[][] = [];
for (let mask = 0; mask < 1 << 12; mask++) {
  const set = Array.from({ length: 12 }, (_, i) => i + 1).filter((p) => mask & (1 << (p - 1)));
  if (set.length === 6) pool.push(set);
}
const rest = wantDiffs.map((d, i) => race(7 + i, pool.find((s) => raceScore(s).diff === d)!));
const full = standing([...six, ...rest]);
eq("final", [full.us, full.them, full.diff, full.left, full.decided], [522, 462, 60, 0, "us"]);
const after11 = standing([...six, ...rest.slice(0, 5)]);
eq("decided after 11", [after11.diff, after11.left, after11.decided], [64, 1, "us"]);
const after10 = standing([...six, ...rest.slice(0, 4)]);
eq("open after 10", [after10.diff, after10.decided, after10.need], [70, null, { side: "them", avg: 36 }]);
eq("penalty", standing(six, [{ side: "them", points: 15, reason: "Repick", by: "x", at: "" }]).them, 188);
eq("level", standing([]).need, null);

// Taps
eq("taps six", tapsToSpots([1, 2, 5, 8, 9, 11].map((place) => ({ place }))), [1, 2, 5, 8, 9, 11]);
eq("taps five", tapsToSpots([1, 2, 5, 8, 9].map((place) => ({ place }))), null);
eq("taps clash", tapsToSpots([1, 2, 2, 8, 9, 11].map((place) => ({ place }))), null);
eq("clashes", tapClashes([1, 2, 2, 8, 8, 11].map((place) => ({ place }))), [2, 8]);
eq("place names", [1, 2, 3, 4, 11, 12].map(placeName), ["1st", "2nd", "3rd", "4th", "11th", "12th"]);

// Tracks
eq("SSC", readTrack("mk8dx", "SSC")?.name, "Sweet Sweet Canyon");
eq("ssc any case", readTrack("mk8dx", "ssc")?.name, "Sweet Sweet Canyon");
eq("rMMM", readTrack("mk8dx", "rMMM")?.name, "Wii Moo Moo Meadows");
eq("World rMMM", readTrack("mkworld", "rmmm")?.name, "Moo Moo Meadows");
eq("CC", readTrack("mk8dx", "CC")?.name, "Cloudtop Cruise");
eq("unknown", readTrack("mk8dx", "rmm"), null);
eq("suggest rmm", suggestTracks("mk8dx", "rmm").map((t) => t.id).length, 3);
eq("suggest rmm has rMMM", suggestTracks("mk8dx", "rmm").some((t) => t.name === "Wii Moo Moo Meadows"), true);
const line = readRaceLine("mk8dx", "SSC 12379+");
eq("line track", line.track?.name, "Sweet Sweet Canyon");
eq("line spots", line.spots.ok && line.spots.spots, [1, 2, 3, 7, 9, 11]);
eq("line CC", readRaceLine("mk8dx", "CC 124680").track?.name, "Cloudtop Cruise");
eq("line bBC3", readRaceLine("mk8dx", "bBC3 1-378").track?.name, "SNES Bowser Castle 3");
eq("line places only", readRaceLine("mk8dx", "1-3 7 8 12").spots.ok, true);
eq("race line", raceLine(race(6, [1, 2, 3, 7, 9, 11], readTrack("mk8dx", "SSC")!.id), "mk8dx"), " 6: +16 | 1,2,3,7,9,11   SSC");

// Tables (Lorenzi's format)
{
  const text = `#title Kart Club vs Night Owls
#date 2026-10-31
#style dark
KC - Kart Club #1f5f9a
Riley [us] 118
Quinn [ca] 70+20+6
Sam 84
NOR - Night Owls
Mira [fr] 101
Kai 60|30
Penalty -15
INTWARD
Münch [inward] 94
??? what is this`;
  const m = parseTable(text);
  eq("title", m.title, "Kart Club vs Night Owls");
  eq("date", m.date, "2026-10-31");
  eq("other settings kept", m.settings, ["#style dark"]);
  eq("teams", m.teams.slice(0, 3).map((t) => [t.tag, t.name, t.color]), [["KC", "Kart Club", "#1f5f9a"], ["NOR", "Night Owls", null], ["INTWARD", null, null]]);
  eq("players", m.teams[0].players.map((p) => [p.name, p.flag, p.score]), [["Riley", "us", 118], ["Quinn", "ca", 96], ["Sam", null, 84]]);
  eq("gp split", m.teams[1].players[1].score, 90);
  eq("penalty", m.teams[1].penalty, 15);
  eq("custom flag code", m.teams[2].players[0].flag, "inward");
  eq("team total", teamTotal(m.teams[1]), 101 + 90 - 15);
  eq("a line with no score starts a team (tag clipped to 12)", m.teams[3]?.tag, "??? what is");
  const round = parseTable(formatTable(m));
  eq("format round trip", round.teams.map((t) => [t.tag, t.players.length, t.penalty]), m.teams.map((t) => [t.tag, t.players.length, t.penalty]));
  const tied = parseTable("A\nx 50\ny 40\nB\nz 50\nw 10");
  const places = placesOf(tied);
  eq("places share ties", tied.teams.flatMap((t) => t.players).map((p) => places.get(p)), [1, 3, 1, 4]);
  const two = parseTable("KC - Kart Club\nRiley 118\nNOR\nMira 101");
  eq("total check", tableIssues(two, { totals: { kc: 118, nor: 110 }, team: 1 }).map((i) => i.kind), ["total"]);
  eq("count check", tableIssues(two, { totals: { kc: 118, nor: 101 }, team: 2 }).map((i) => i.kind), ["count", "count"]);
  eq("clean", tableIssues(two, { totals: { kc: 118, nor: 101 }, team: 1 }), []);
  const blank = parseTable("KC - Kart Club\nRiley 118\nNOR - Night Owls");
  const rows = [{ name: "NOR Mira", score: 101, color: "blue" }, { name: "Kai", score: 90, color: "blue" }, { name: "Riley", score: 118, color: "red" }];
  const filled = fillFromRows(blank, rows);
  eq("rows fill the empty team, by tag then by color, tag dropped", filled.model.teams[1].players.map((p) => p.name), ["Mira", "Kai"]);
  eq("known names skipped", filled.model.teams[0].players.length, 1);
  eq("not guessed when a tag shows the color", filled.guessed, false);
  const both = fillFromRows(parseTable("KC\nNOR"), [{ name: "a", score: 1, color: "red" }, { name: "b", score: 2, color: "blue" }]);
  eq("guessed by color", [both.guessed, both.model.teams[0].players[0].name, both.model.teams[1].players[0].name], [true, "a", "b"]);
  eq("swap", swapTeams(both.model).teams.map((t) => t.players[0].name), ["b", "a"]);
  // A full results screen: KC's six are already in (from taps), shown in game with their tag; NOR's come from it.
  const room = parseTable("KC - Kart Club\nRiley 118\nQuinn 96\nNOR - Night Owls");
  const screen = [
    { name: "KC Riley", score: 118, color: "red" }, { name: "NOR★Mira", score: 101, color: "blue" }, { name: "KC Quinn", score: 96, color: "red" },
    { name: "Kai", score: 90, color: "blue" }, { name: "Rowan", score: 77, color: "blue" },
  ];
  const full = fillFromRows(room, screen);
  eq("filled team's rows stay out", full.model.teams[0].players.map((p) => p.name), ["Riley", "Quinn"]);
  eq("the other color fills the empty team", full.model.teams[1].players.map((p) => p.name), ["Mira", "Kai", "Rowan"]);
  eq("not guessed", full.guessed, false);
}

// ── The war page's address ──
{
  const id = "2c273be3-da06-4b7a-9c1e-5f0e1d2c3b4a";
  eq("short id", warShort(id), "2c273be3da06");
  eq("path", warPagePath({ id, us: { tag: "KC" }, them: { tag: "NOR" } }), "/wars/kc-vs-nor-2c273be3da06");
  eq("accents and symbols", warPagePath({ id, us: { tag: "Équipe★" }, them: { tag: "x.y" } }), "/wars/equipe-vs-x-y-2c273be3da06");
  eq("no plain letters", warPagePath({ id, us: { tag: "☆" }, them: { tag: "NOR" } }), "/wars/2c273be3da06");
  eq("long tags cut", warPagePath({ id, us: { tag: "abcdefghijklmnopqrstu" }, them: { tag: "B" } }), "/wars/abcdefghijklmnop-vs-b-2c273be3da06");
  eq("read with tags", readWarSlug("kc-vs-nor-2c273be3da06"), "2c273be3da06");
  eq("read bare", readWarSlug("2C273BE3DA06"), "2c273be3da06");
  eq("tag ending in hex", readWarSlug("abc-vs-def-2c273be3da06"), "2c273be3da06");
  eq("too short", readWarSlug("kc-vs-nor-2c273be3"), null);
  eq("junk", readWarSlug("../etc"), null);
  // Every path reads back to its own short id.
  for (const tags of [["KC", "NOR"], ["a", "b"], ["★", "★"], ["123", "456"], ["DEADBEEF", "CAFE"]]) {
    const p = warPagePath({ id, us: { tag: tags[0] }, them: { tag: tags[1] } });
    eq(`round trip ${tags.join(" ")}`, readWarSlug(p.slice("/wars/".length)), warShort(id));
  }
}

// ── Logo files and flag codes ──
{
  eq("file tag", tagFromFile("KC.png"), { tag: "KC", name: "" });
  eq("file tag and name", tagFromFile("KC - Kart Club.png"), { tag: "KC", name: "Kart Club" });
  eq("spaces tidied", tagFromFile("  NOR   -  Night Owls .webp"), { tag: "NOR", name: "Night Owls" });
  eq("dash without spaces stays in the tag", tagFromFile("K-C.png"), { tag: "K-C", name: "" });
  eq("no extension", tagFromFile("BBQ"), { tag: "BBQ", name: "" });
  eq("dots in the name", tagFromFile("v1.0 logo.jpeg"), { tag: "v1.0 logo", name: "" });
  eq("flag code", cleanFlagCode("[US]"), "us");
  eq("region code", cleanFlagCode("gb_eng"), "gb_eng");
  eq("custom code", cleanFlagCode(" kc "), "kc");
  eq("one letter", cleanFlagCode("k"), null);
  eq("spaces", cleanFlagCode("kart club"), null);
  eq("digits", cleanFlagCode("k1"), null);
  eq("too long", cleanFlagCode("abcdefghijk"), null);
}

// ── The War room ──
{
  const pl = (id: string, place: number) => ({ id, name: id.toUpperCase(), place });
  const race = (n: number, spots: number[], players?: ReturnType<typeof pl>[], at = `2026-11-01T0${n}:00:00Z`) => ({ n, spots, track: null, by: { id: "x", name: "X" }, at, ...(players ? { players } : {}) });
  const r1 = race(1, [1, 2, 4, 7, 8, 9], [pl("a", 1), pl("b", 2), pl("c", 4), pl("d", 7), pl("e", 8), pl("f", 9)]);
  const r2 = race(2, [1, 2, 3, 5, 6, 11]);
  const r3 = race(3, [1, 2, 3, 4, 5, 6], [pl("a", 1), pl("b", 2), pl("c", 3), pl("d", 4), pl("e", 5), pl("g", 6)]);
  eq("waits on the newest tapped lineup", waitingOn([r1, r2, r3], [{ id: "a" }, { id: "b" }]).map((p) => p.id), ["c", "d", "e", "g"]);
  eq("a subbed-out player isn't waited on", waitingOn([r1, r3], []).some((p) => p.id === "f"), false);
  eq("nothing to wait on before any taps", waitingOn([r2], [{ id: "a" }]), []);
  eq("six in: nobody", waitingOn([r1], [1, 2, 3, 4, 5, 6].map((i) => ({ id: `z${i}` }))), []);
  const rows = playerRows([r1, r2, r3], 12);
  eq("race 2 by hand", rows.byHand.races, [2]);
  eq("race 2's points not split", rows.byHand.points, 54);
  eq("a's points", rows.rows.find((r) => r.id === "a")?.points, 30);
  eq("a's places by race", rows.rows.find((r) => r.id === "a")?.places.slice(0, 3), [1, null, 1]);
  eq("points add up", rows.rows.reduce((x, r) => x + r.points, 0) + rows.byHand.points, 51 + 54 + 61);
  const part = playerRows([race(1, [1, 2, 3, 4, 5, 6], [pl("a", 1)])], 12);
  eq("a partly tapped race counts the rest by hand", [part.byHand.races, part.byHand.points], [[1], 12 + 10 + 9 + 8 + 7]);
  eq("leads", leads([r1, r2, r3], []), [20, 46, 86]);
  eq("a penalty counts from the race before it", leads([r1, r2, r3], [{ side: "them", points: 15, reason: "", by: "x", at: "2026-11-01T02:30:00Z" }]), [20, 61, 101]);
  eq("our penalty", leads([r1], [{ side: "us", points: 10, reason: "", by: "x", at: "2026-11-01T01:10:00Z" }]), [10]);
  const g = tapGrid([{ id: "a", name: "A", place: 5 }, { id: "b", name: "B", place: 5 }, { id: "c", name: "C", place: 1 }]);
  eq("taps by place", g.taps.map((t) => [t.place, t.people.length]), [[1, 1], [5, 2]]);
  eq("clash", g.clashes, [5]);
  const T = (tag: string, total: number) => ({ tag, name: tag === "KC" ? "Kart Club" : null, logo: null, total });
  eq("live: no headline", headlineFor("live", 6, 12, T("KC", 289), T("NOR", 203)), null);
  eq("won", headlineFor("done", 12, 12, T("KC", 522), T("NOR", 462)), "Kart Club won 522 to 462");
  eq("they won", headlineFor("done", 12, 12, T("KC", 462), T("NOR", 522)), "NOR won 522 to 462");
  eq("tie", headlineFor("done", 12, 12, T("KC", 492), T("NOR", 492)), "A tie, 492 to 492");
  eq("ended early", headlineFor("ended", 7, 12, T("KC", 300), T("NOR", 274)), "Ended after race 7, 300 to 274");
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
