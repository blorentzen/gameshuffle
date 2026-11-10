/**
 * War scoring checks: npx tsx -r ./scripts/server-only-shim.cjs scripts/test-wars.ts
 * The places reader against the cases Sokuji and Quaxly agree on, the race and war math, and the codes.
 */

import {
  maxSwing, placeName, raceLine, raceScore, readRaceLine, readSpots, readTrack, RACE_TOTAL, spotsCode, spotsFromCode,
  standing, suggestTracks, tapClashes, tapsToSpots, type WarRace,
} from "../src/lib/wars/rules";
import { cleanFlagCode, fillFromRows, formatTable, parseTable, placesOf, splitTyped, swapTeams, tableIssues, tagFromFile, teamTotal } from "../src/lib/wars/table";
import { bestSplit, groupByTag, samePlayer, withoutTag } from "../src/lib/wars/tags";
import { logoFrom } from "../src/lib/wars/tables";
import { readTyped, type TypedContext } from "../src/lib/wars/legacy";
import { applyCards, fixesBetween, matchMkc, readRosterLines, teamAliases, unknownOnLinked, whoIs, type CardSet, type MkcPlayerLite } from "../src/lib/wars/cards";
import { mkcIdFrom } from "../src/lib/wars/mkcTeams";
import { cardLogo } from "../src/lib/wars/tables";
import { parsePasted } from "../src/lib/wars/table";
import { readWarSlug, warPagePath, warShort } from "../src/lib/wars/page";
import { headlineFor, leads, playerRows, tapGrid, waitingOn } from "../src/lib/wars/roomView";
import { cleanTableLook, contrast, DEFAULT_TABLE_LOOK, freeTableLook, readableTeamColor, SURFACE, tableColors, tablePaidUsed } from "../src/lib/wars/tableLook";
import { mainColor } from "../src/lib/wars/teamColor";

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

// ── Tags in names: front or back, any separator or none (a real Nov 9 war: Twilight Zone wears Ω, FRVR Racing FRVR) ──
{
  const shot = [
    ["Ω umikofy", 125], ["Ω Twinsia", 107], ["FRVR Jalen", 102], ["Ω JJz3r0", 86], ["Ω Deku", 82], ["FRVR\uE000nsn", 81],
    ["Ω Clarence", 74], ["Ω vok", 74], ["FRVR♪ichor", 72], ["FRVR Toret", 64], ["FRVR\uFFFDyozo", 62], ["FRVRTRA$H", 55],
  ].map(([name, score]) => ({ name: name as string, score: score as number, color: null }));
  const names = shot.map((r) => r.name);
  const split = groupByTag(names, 6);
  eq("tags found", split.groups.map((g) => [g.tag, g.rows.length]), [["Ω", 6], ["FRVR", 6]]);
  eq("tags taken off (space, symbol, a box, nothing)", split.groups[1].names, ["Jalen", "nsn", "ichor", "Toret", "yozo", "TRA$H"]);
  eq("no size given: 2 teams of 6", bestSplit(names).size, 6);
  const back = ["umiko Ω", "Twinsia Ω", "Jalen [FRVR]", "JJz3r0 Ω", "Deku Ω", "nsn [FRVR]", "Clarence Ω", "vok Ω", "ichor [FRVR]", "Toret | FRVR", "yozo-FRVR", "TRA$HFRVR"];
  eq("back tags", bestSplit(back).groups.map((g) => [g.tag, g.names.join(" ")]), [["Ω", "umiko Twinsia JJz3r0 Deku Clarence vok"], ["FRVR", "Jalen nsn ichor Toret yozo TRA$H"]]);
  eq("one team front, one back", bestSplit(["KC Riley", "Mira NOR", "KC Quinn", "Kai NOR", "KC|Sam", "Rowan.NOR"]).groups.map((g) => g.tag), ["KC", "NOR"]);
  const plain = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliet", "Kilo", "Lima"];
  eq("names that only start or end alike aren't tags", bestSplit(plain).groups.length, 0);
  eq("same start, no edge: not a tag", bestSplit(["Sam", "Sky", "Sol", "Rae", "Rio", "Ray"]).groups.length, 0);
  eq("withoutTag front, back, none", [withoutTag("FRVRTRA$H", "FRVR"), withoutTag("Jalen FRVR", "frvr"), withoutTag("Clarence", "Ω"), withoutTag("[KC] Riley", "KC")], ["TRA$H", "Jalen", "Clarence", "Riley"]);
  eq("same player under two names", [samePlayer("umikofy", "umiko"), samePlayer("Twinsia", "Twins2133"), samePlayer("vok", "vokii"), samePlayer("Jalen", "peep/Sxyd")], [true, true, true, false]);

  // The war's teams were typed as TWILIGHT and INTED: MKCentral knows Ω as Twilight Zone, and FRVR is the team that's left.
  const war = parseTable("#title int vs inted\nTWILIGHT\nINTED");
  const fixed = fillFromRows(war, shot, { aliases: { "ω": ["Twilight Zone"], frvr: ["RACINGFRVR"] } });
  eq("split into the war's teams", fixed.model.teams.map((t) => [t.tag, t.name, t.players.length, teamTotal(t)]), [["Ω", "TWILIGHT", 6, 548], ["FRVR", "INTED", 6, 436]]);
  eq("not a guess", [fixed.guessed, fixed.by], [false, "tags"]);
  eq("their names", fixed.model.teams[0].players.map((p) => p.name), ["umikofy", "Twinsia", "JJz3r0", "Deku", "Clarence", "vok"]);
  eq("totals check by the war's tag, now the name", tableIssues(fixed.model, { totals: { twilight: 548, inted: 436 }, team: 6 }), []);
  eq("round trip keeps tag and name", parseTable(formatTable(fixed.model)).teams.map((t) => [t.tag, t.name]), [["Ω", "TWILIGHT"], ["FRVR", "INTED"]]);
  // Nothing to go on: in order, the first row's team first, and flagged so Swap teams is offered; the war's tags stay.
  const blind = fillFromRows(parseTable("AAA\nBBB"), shot);
  eq("blind: in order, guessed", [blind.guessed, blind.model.teams.map((t) => [t.tag, t.players[0].name, t.players.length])], [true, [["AAA", "umikofy", 6], ["BBB", "Jalen", 6]]]);
  eq("swap after a guess", swapTeams(blind.model).teams.map((t) => [t.tag, t.players[0].name]), [["AAA", "Jalen"], ["BBB", "umikofy"]]);
  const direct = fillFromRows(parseTable("FRVR - FRVR Racing\nΩ - Twilight Zone"), shot);
  eq("tags that match go straight in", [direct.guessed, direct.model.teams.map((t) => [t.tag, teamTotal(t)])], [false, [["FRVR", 436], ["Ω", 548]]]);
  const byName = fillFromRows(parseTable("TZ - Twilight Zone\nFR - FRVR Racing"), shot);
  eq("tag inside a team's name", byName.model.teams.map((t) => [t.tag, t.name, teamTotal(t)]), [["Ω", "Twilight Zone", 548], ["FRVR", "FRVR Racing", 436]]);
  // Our six came in from taps under their lounge names; the screen's Ω rows are theirs, FRVR fills the other team.
  const tapped = parseTable("TWILIGHT\numiko [us] 125\nTwins2133 [us] 107\nJJz3r0 [us] 86\nDekuMK8 [mx] 82\nvokii [us] 74\nClarence [us] 74\nINTED");
  const rest = fillFromRows(tapped, shot);
  eq("tapped team stays as typed", rest.model.teams[0].players.map((p) => p.flag), ["us", "us", "us", "mx", "us", "us"]);
  eq("the other team from the screen, under the tag it wears", [rest.guessed, rest.model.teams[1].tag, rest.model.teams[1].name, rest.model.teams[1].players.map((p) => p.name)], [false, "FRVR", "INTED", ["Jalen", "nsn", "ichor", "Toret", "yozo", "TRA$H"]]);
  // No teams typed (blank form): the tags make them, named from MKCentral.
  const scratch = fillFromRows(parseTable(""), shot, { aliases: { "ω": ["Twilight Zone"] } });
  eq("teams from the screen", scratch.model.teams.map((t) => [t.tag, t.name, teamTotal(t)]), [["Ω", "Twilight Zone", 548], ["FRVR", null, 436]]);
  const untagged = fillFromRows(parseTable(""), [{ name: "a", score: 9, color: "red" }, { name: "b", score: 8, color: "blue" }, { name: "c", score: 7, color: "red" }]);
  eq("untagged by color, marked", [untagged.guessed, untagged.model.teams.map((t) => [t.tag, t.players.length])], [true, [["?", 2], ["?", 1]]]);
  eq("a team without a tag says so", tableIssues(untagged.model, null).map((i) => i.kind), ["unnamed", "unnamed"]);
  // Typed with no team lines: split by tags, flags kept.
  const typed = splitTyped(parseTable(shot.map((r, i) => `${r.name}${i === 4 ? " [mx]" : ""} ${r.score}`).join("\n")));
  eq("typed split", typed.teams.map((t) => [t.tag, t.players.length, teamTotal(t)]), [["Ω", 6, 548], ["FRVR", 6, 436]]);
  eq("typed flag kept", typed.teams[0].players[3], { name: "Deku", flag: "mx", score: 82 });
  // Logos: the server's logo for the tag the team wears, else for the war's tag (kept as the name), else the war's own.
  const own = [{ tag: "Ω", name: "Twilight Zone", url: "omega.webp" }, { tag: "INTED", name: null, url: "inted.webp" }];
  const sides = [{ tag: "TWILIGHT", name: null, logo: "war-us.webp" }, { tag: "INTED", name: null, logo: null }];
  eq("logo by the worn tag", logoFrom(fixed.model.teams[0], own, sides).url, "omega.webp");
  eq("logo by the war's tag", logoFrom(fixed.model.teams[1], own, sides).url, "inted.webp");
  eq("logo by name", logoFrom({ tag: "TZ", name: "Twilight Zone" }, own, []).url, "omega.webp");
  eq("the war's own logo", logoFrom(fixed.model.teams[0], [], sides).url, "war-us.webp");

  // The old mistake shows up in the check: twelve on one team.
  const one = parseTable(`TWILIGHT\n${shot.map((r) => `${r.name} ${r.score}`).join("\n")}\nINTED`);
  eq("twelve on one team is flagged", tableIssues(one, { totals: { twilight: 548, inted: 436 }, team: 6 }).map((i) => i.kind), ["count", "total", "missing"]);
}

// ── Typed lines, the way the other war bots read them (overrides picks 5 to 7) ──
{
  const ctx: TypedContext = { game: "mk8dx", readsLike: "sokuji", us: { tag: "Ω", name: "Twilight Zone" }, them: { tag: "FRVR", name: "FRVR Racing" }, trackNames: { bazaar: "x-shy-guy-bazaar" } };
  const k = (line: string, played = 3, c = ctx) => { const t = readTyped(line, c, played); return t.kind === "race" ? ["race", t.spots.ok ? t.spots.spots.join(",") : "bad", t.track] : t.kind === "fix" ? ["fix", t.n, t.spots?.ok ? t.spots.spots.join(",") : null, t.track] : t.kind === "pen" || t.kind === "unpen" ? [t.kind, t.side, t.points] : t.kind === "track" ? ["track", t.track] : t.kind === "tag" ? ["tag", t.side, t.tag] : [t.kind]; };
  eq("plain places", k("1-378"), ["race", "1,2,3,7,8,12", null]);
  eq("leading dash", k("-379"), ["race", "1,2,3,7,9,12", null]);
  eq("spaced places", k("1 3 5 7 9 11"), ["race", "1,3,5,7,9,11", null]);
  eq("full-width digits", k("１２３７８"), ["race", "1,2,3,7,8,12", null]);
  eq("track alone", k("SSC"), ["track", "mushroom-sweet-sweet-canyon"]);
  eq("server nickname", k("Bazaar"), ["track", "x-shy-guy-bazaar"]);
  eq("track then places", k("SSC 12378"), ["race", "1,2,3,7,8,12", "mushroom-sweet-sweet-canyon"]);
  eq("back, every way", ["back", "undo", "%back", "!back", "!u"].map((l) => k(l)[0]), ["back", "back", "back", "back", "back"]);
  eq("a lone u is chat", k("u"), ["none"]);
  eq("Quaxly race fix", k("race 3 1-378"), ["fix", 3, "1,2,3,7,8,12", null]);
  eq("Quaxly race track", k("race 2 SSC"), ["fix", 2, null, "mushroom-sweet-sweet-canyon"]);
  eq("Sokuji %race", k("%race 2 12378"), ["fix", 2, "1,2,3,7,8,12", null]);
  eq("Sokuji counts back", k("%race -1 12378"), ["fix", 3, "1,2,3,7,8,12", null]);
  eq("Kiwi !editrace with a tag", k("!editrace 2 FRVR 12378"), ["fix", 2, "1,2,3,7,8,12", null]);
  eq("race not played yet", k("race 9 12378"), ["none"]);
  eq("Quaxly pen hits them", k("pen 15"), ["pen", "them", 15]);
  eq("Quaxly pen -15 is yours", k("pen -15"), ["pen", "us", 15]);
  eq("Sokuji %penalty is yours", k("%penalty 10"), ["pen", "us", 10]);
  eq("Sokuji %penalty -10 FRVR", k("%penalty -10 FRVR"), ["pen", "them", 10]);
  eq("repick is 15", k("%repick"), ["pen", "us", 15]);
  eq("Ice Mario !penalty TAG", k("!penalty 15 FRVR"), ["pen", "them", 15]);
  eq("by team name", k("pen 15 Twilight Zone"), ["pen", "us", 15]);
  eq("Kiwi !ap opponent", k("!ap opponent 10"), ["pen", "them", 10]);
  eq("unpen", k("unpen 15"), ["unpen", "them", 15]);
  eq("Ice Mario !a", k("!a 1 2 3 7 8 12"), ["race", "1,2,3,7,8,12", null]);
  eq("Toad _race", k("_race 1 2 3 4 5 6"), ["race", "1,2,3,4,5,6", null]);
  eq("%tag sets theirs", k("%tag FRVR2"), ["tag", "them", "FRVR2"]);
  eq("%tag 1 sets yours", k("%tag 1 ΩZ"), ["tag", "us", "ΩZ"]);
  eq("chat is chat", ["nice race", "gg", "lol", "ok see you at 9"].map((l) => k(l)[0]), ["none", "none", "none", "none"]);
  eq("Sokuji 12 later is 12th", k("3712", 0), ["race", "3,7,9,10,11,12", null]);
  eq("Kiwi 12 is 1st and 2nd", k("3712", 0, { ...ctx, readsLike: "kiwi" }), ["race", "1,2,3,7,11,12", null]);
}

// ── Team and player cards (overrides picks 1 to 3) ──
{
  const set: CardSet = {
    teams: [{ id: "t1", name: "Twilight Zone", tags: ["Ω", "TZ"], color: "#6a35c9" }, { id: "t2", name: "FRVR Racing", tags: ["FRVR"], color: null }],
    roster: [
      { teamId: "t2", ingame: "Jalen", shown: "peep/Sxyd", flag: "us", source: "captain" },
      { teamId: "t2", ingame: "TRA$H", shown: "brisktrash", flag: "ca", source: "remember" },
      { teamId: "t1", ingame: "Jalen", shown: "Jalen TZ", flag: "mx", source: "captain" },
    ],
    cards: [
      { discordId: "1", shown: "umiko", flag: "us", ingame: ["umikofy"], teams: ["Ω"] },
      { discordId: "2", shown: "Clarence", flag: "us", ingame: ["Clarence"], teams: [] },
      { discordId: "3", shown: "Other Clarence", flag: "gb", ingame: ["Clarence"], teams: ["XYZ"] },
    ],
  };
  eq("server list for this team", whoIs("Jalen", { tag: "FRVR", name: null }, set), { shown: "peep/Sxyd", flag: "us", from: "server" });
  eq("same name, other team's list", whoIs("Jalen", { tag: "TZ", name: null }, set), { shown: "Jalen TZ", flag: "mx", from: "server" });
  eq("spelled differently", whoIs("TRA$H", { tag: "FRVR", name: null }, set)?.shown, "brisktrash");
  eq("player's own card on their team", whoIs("umikofy", { tag: "Ω", name: null }, set), { shown: "umiko", flag: "us", from: "player" });
  eq("two cards claim a name: only the one on this team", whoIs("Clarence", { tag: "XYZ", name: null }, set)?.shown, "Other Clarence");
  eq("two cards, neither on this team: nobody", whoIs("Clarence", { tag: "Ω", name: null }, set), null);
  eq("unknown name", whoIs("vok", { tag: "Ω", name: null }, set), null);
  eq("aliases by tag", teamAliases(set.teams)["tz"], ["Twilight Zone", "Ω", "TZ"]);
  const table = parseTable("TWILIGHT\numikofy 125\nvok 74\nFRVR\nJalen 102\nTRA$H 55");
  const dressed = applyCards(table, set, [1]);
  eq("cards dress the teams", dressed.teams.map((t) => [t.tag, t.name, t.color]), [["TWILIGHT", null, null], ["FRVR", "FRVR Racing", null]]);
  eq("only the filled team's players change", [dressed.teams[0].players[0].name, dressed.teams[1].players.map((p) => `${p.name} ${p.flag}`)], ["umikofy", ["peep/Sxyd us", "brisktrash ca"]]);
  const tz = applyCards(parseTable("TZ\numikofy 125"), set, [0]);
  eq("a card's other tag shows the first", [tz.teams[0].tag, tz.teams[0].name, tz.teams[0].color, tz.teams[0].players[0].name], ["Ω", "Twilight Zone", "#6a35c9", "umiko"]);
  const read = parseTable("FRVR\nJalen 102\nnsn 81\nTRA$H 55");
  const posted = parseTable("FRVR - FRVR Racing\npeep/Sxyd [us] 102\nneiseun [us] 81\nTRA$H 55");
  eq("what a fix changed", fixesBetween(read, posted), [{ team: 0, ingame: "Jalen", shown: "peep/Sxyd", flag: "us" }, { team: 0, ingame: "nsn", shown: "neiseun", flag: "us" }]);
  eq("roster lines", readRosterLines("Jalen = peep/Sxyd [us]\nnsn -> neiseun\nTRA$H [ca]\n\nyozo: yozo75 [US]"), [
    { ingame: "Jalen", shown: "peep/Sxyd", flag: "us" }, { ingame: "nsn", shown: "neiseun", flag: null }, { ingame: "TRA$H", shown: null, flag: "ca" }, { ingame: "yozo", shown: "yozo75", flag: "us" },
  ]);
}

// ── MKCentral teams (logos + MKCentral picks, all A; players from the real Nov 9 rosters) ──
{
  const P = (id: number, name: string, country: string | null, discordId: string | null = null): MkcPlayerLite => ({ id, name, country, discordId });
  const frvr = [P(1, "Acria/Rei", "us"), P(2, "brisktrash", "ca"), P(3, "cloudedichor", "us"), P(4, "neiseun", "us"), P(5, "TorettoMK8", "us"), P(6, "yozo75/Eternal", "us"), P(7, "FRVRFRIDAY", "ca")];
  const tz = [P(11, "Aira / Umiko", "us", "1374992892988227634"), P(12, "DekuMK8", "us", "691754011329691709"), P(13, "JJz3r0", "us"), P(14, "Clarence", "us"), P(15, "cook", "us")];
  const m = (n: string, list: MkcPlayerLite[]) => matchMkc(n, list)?.shown ?? null;
  eq("a part of their name", m("umikofy", tz), "Umiko");
  eq("the start", [m("Deku", tz), m("Toret", frvr), m("yozo", frvr)], ["DekuMK8", "TorettoMK8", "yozo75"]);
  eq("the end, 4 letters or more", m("ichor", frvr), "cloudedichor");
  eq("exact", [m("JJz3r0", tz), m("Clarence", tz)], ["JJz3r0", "Clarence"]);
  eq("no guess", [m("nsn", frvr), m("TRA$H", frvr), m("Jalen", frvr), m("vok", tz), m("Twinsia", tz)], [null, null, null, null, null]);
  eq("two who fit: nobody", matchMkc("Ki", [P(21, "Kirby", null), P(22, "Kiki", null)]), null);
  eq("an exact name beats a start", m("cook", [P(31, "cook", null), P(32, "cookie", null)]), "cook");
  const set: CardSet = {
    teams: [{ id: "tz", name: "Twilight Zone", tags: ["Ω"], color: null, mkcTeamId: 3592 }, { id: "fr", name: "FRVR Racing", tags: ["FRVR"], color: null, mkcTeamId: 2929 }],
    roster: [{ teamId: "fr", ingame: "Jalen", shown: "peep/Sxyd", flag: "us", source: "captain" }],
    cards: [{ discordId: "691754011329691709", shown: null, flag: "mx", ingame: [], teams: [] }],
    mkc: { tz, fr: frvr },
  };
  eq("MKCentral fills in", whoIs("umikofy", { tag: "Ω", name: null }, set), { shown: "Umiko", flag: "us", from: "mkcentral", mkcPlayerId: 11 });
  eq("their own card beats MKCentral's country", whoIs("Deku", { tag: "Ω", name: null }, set), { shown: "DekuMK8", flag: "mx", from: "player", mkcPlayerId: 12 });
  eq("your server's line beats MKCentral", whoIs("Jalen", { tag: "FRVR", name: null }, set)?.shown, "peep/Sxyd");
  const screen = parseTable("Ω\numikofy 125\nTwinsia 107\nJJz3r0 86\nDeku 82\nClarence 74\nvok 74\nFRVR\nJalen 102\nnsn 81\nichor 72\nToret 64\nyozo 62\nTRA$H 55");
  const linked = applyCards(screen, set, [0, 1]);
  eq("the Nov 9 table, linked", linked.teams.map((t) => t.players.map((p) => `${p.name}${p.flag ? ` ${p.flag}` : ""}`).join(", ")), [
    "Umiko us, Twinsia, JJz3r0 us, DekuMK8 mx, Clarence us, vok", "peep/Sxyd us, nsn, cloudedichor us, TorettoMK8 us, yozo75 us, TRA$H",
  ]);
  const who = unknownOnLinked(linked, set, [0, 1]);
  eq("who's left to ask", who.map((u) => `${u.team}:${u.ingame}`), ["0:Twinsia", "0:vok", "1:nsn", "1:TRA$H"]);
  eq("the menu leaves out who's on the table", who.find((u) => u.ingame === "nsn")!.options.map((p) => p.name), ["Acria/Rei", "brisktrash", "neiseun", "FRVRFRIDAY"]);
  eq("not linked: nobody asked", unknownOnLinked(linked, { ...set, mkc: {} }, [0, 1]), []);
  eq("MKCentral links", [mkcIdFrom("https://mkcentral.com/en-us/registry/teams/profile?id=2929"), mkcIdFrom("mkcentral.com/registry/teams/3592"), mkcIdFrom("2929"), mkcIdFrom("FRVR")], [2929, 3592, 2929, null]);
}

// ── Tables pasted from other tools (overrides pick 8) ──
{
  const ice = parsePasted("!tablel light nodate\n#title Twilight Zone vs FRVR\n#bg https://example.com/bg.png\nΩ - Twilight Zone #6a35c9 -vx\numiko [us] 125\nDeku [mx] 80-10\nFRVR - FRVR Racing\npeep [us] 102\nPenalty -15");
  eq("Ice Mario block", [ice.title, ice.teams.map((t) => [t.tag, t.name, t.color, teamTotal(t)]), ice.settings], ["Twilight Zone vs FRVR", [["Ω", "Twilight Zone", "#6a35c9", 195], ["FRVR", "FRVR Racing", null, 87]], ["#bg https://example.com/bg.png"]]);
  const lounge = parsePasted("!submit 3 a\nΩ umiko [us] 125\nΩ Deku [mx] 82\nΩ vok 74\nFRVR Jalen 102\nFRVR nsn 81\nFRVR ichor 72");
  eq("Lounge !submit block", lounge.teams.map((t) => [t.tag, t.players.map((p) => p.name).join(" "), teamTotal(t)]), [["Ω", "umiko Deku vok", 281], ["FRVR", "Jalen nsn ichor", 255]]);
  eq("Lorenzi text unchanged", parsePasted("KC - Kart Club\nRiley 118\nNOR\nMira 101").teams.map((t) => t.tag), ["KC", "NOR"]);
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

// ── Table looks (table look picks 2026-11-09) ───────────────────────────────────────────────
{
  eq("no look: the default", cleanTableLook(null), DEFAULT_TABLE_LOOK);
  eq("default is Stacked with medals on team colors", [DEFAULT_TABLE_LOOK.layout, DEFAULT_TABLE_LOOK.medals, DEFAULT_TABLE_LOOK.ground, DEFAULT_TABLE_LOOK.frame], ["stacked", true, "teams", "teams"]);
  eq("unknown values fall back", cleanTableLook({ layout: "huge", font: "comic", frame: "nope", c1: "red", light: "yes" }), DEFAULT_TABLE_LOOK);
  const paid = cleanTableLook({ layout: "sides", medals: false, ground: "checker", frame: "midnight", font: "bebas", light: true, brand: false });
  eq("paid choices named", tablePaidUsed(paid), ["the Midnight theme", "Bebas Neue", "the light version", "no gameshuffle.co line"]);
  eq("free choices aren't paid", tablePaidUsed(cleanTableLook({ layout: "classic", medals: false, ground: "checker" })), []);
  eq("custom colors are paid", tablePaidUsed(cleanTableLook({ frame: "custom", c1: "#112233", c2: "#445566" })), ["your own colors"]);
  const free = freeTableLook(paid);
  eq("the free version keeps the free choices", [free.layout, free.medals, free.ground], ["sides", false, "checker"]);
  eq("and swaps the paid ones", [free.frame, free.font, free.light, free.brand], ["teams", "gabarito", false, true]);
  eq("the free version has nothing paid", tablePaidUsed(free), []);
  // Team colors read as text: 4.5:1 on the dark rows and on the light version's white.
  for (const c of ["#1f5f9a", "#5b2a8a", "#000000", "#ffffff", "#f2c14e", "#7a6a12", "#a78bfa", "#f0435c"]) {
    eq(`${c} reads on dark`, contrast(readableTeamColor(c, false), SURFACE.dark) >= 4.5, true);
    eq(`${c} reads on light`, contrast(readableTeamColor(c, true), SURFACE.light) >= 4.5, true);
  }
  eq("a readable color keeps its hue's family (purple stays purple)", readableTeamColor("#5b2a8a", false).slice(1, 3) > readableTeamColor("#5b2a8a", false).slice(3, 5), true);
  const two = tableColors([{ color: "#d9363e", own: false }, { color: "#e0303a", own: false }], false);
  eq("two picked reds: the second gets a spare", two[0] !== two[1] && two[1] === readableTeamColor("#8cc8f0", false), true);
  const ownRed = tableColors([{ color: "#d9363e", own: false }, { color: "#e0303a", own: true }], false);
  eq("a card's own color is never swapped", ownRed[1], readableTeamColor("#e0303a", false));
  eq("the picked one moves instead", ownRed[0] !== readableTeamColor("#d9363e", false), true);
  eq("far apart colors stay", tableColors([{ color: "#a78bfa", own: false }, { color: "#f0435c", own: false }], false), [readableTeamColor("#a78bfa", false), readableTeamColor("#f0435c", false)]);
  // A logo's color: clear pixels, greys, black and white don't count.
  const px = (rgba: number[][]) => Buffer.from(rgba.flat());
  const clear = Array.from({ length: 60 }, () => [0, 0, 0, 0]);
  eq("clear pixels don't make a logo black", mainColor(px([...clear, ...Array.from({ length: 20 }, () => [150, 60, 240, 255])])), "#963cf0");
  eq("mostly black and white with a little red: red", mainColor(px([...Array.from({ length: 40 }, () => [0, 0, 0, 255]), ...Array.from({ length: 40 }, () => [255, 255, 255, 255]), ...Array.from({ length: 10 }, () => [220, 30, 40, 255])])), "#dc1e28");
  eq("a grey logo has no color", mainColor(px(Array.from({ length: 50 }, () => [128, 128, 128, 255]))), null);
}

void (async () => {
  // The logo setting (no network: these settings never reach MKCentral).
  const card = { id: "t", name: "X", tags: ["X"], color: null };
  eq("upload only", await cardLogo({ ...card, logoSource: "upload" }, { upload: "u.png", warLogo: "w.png", tags: [], game: "mk8dx" }), "u.png");
  eq("upload only, none", await cardLogo({ ...card, logoSource: "upload" }, { upload: null, warLogo: "w.png", tags: [], game: "mk8dx" }), null);
  eq("automatic: your upload first", await cardLogo({ ...card, logoSource: "auto" }, { upload: "u.png", warLogo: "w.png", tags: [], game: "mk8dx" }), "u.png");
  eq("automatic: then the war's", await cardLogo(null, { upload: null, warLogo: "w.png", tags: [], game: "mk8dx" }), "w.png");
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
